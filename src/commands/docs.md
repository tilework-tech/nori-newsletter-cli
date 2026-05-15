# Noridoc: commands

Path: @/src/commands

### Overview

- Contains all CLI command implementations, each exported as a factory function that receives `SesService`, `Output`, and a config getter via dependency injection
- Commands cover the full newsletter workflow: low-level SES operations (contacts, send, bulk-send, suppression, lists, stats, templates, identities, config-sets, validate) and high-level abstraction commands (health, preflight, cleanup, setup) that compose multiple service calls into newsletter-specific workflows

### How it fits into the larger codebase

- `@/src/program.ts` imports each command's factory function and registers them with Commander via `program.addCommand()`
- All AWS operations go through the `SesService` interface (`@/src/services/ses.ts`), never the AWS SDK directly
- Configuration (list name, topic, sender address, reply-to) comes from the `getConfig()` callback, which resolves to `newsletter.config.json` at runtime
- Output goes through the `Output` interface (`@/src/output.ts`), allowing tests to capture stdout/stderr
- Tests in `@/tests/commands/` exercise these commands end-to-end using the mock SES service and `runCommand()` helper from `@/tests/helpers.ts`

### Core Implementation

- **Factory pattern:** Each file exports a `create*Command(ses, out, getConfig)` function returning a Commander `Command`. This keeps command logic pure (no global state) and enables test injection

- **`contacts` command** has subcommands for the full subscriber lifecycle:

  | Subcommand | Purpose | Key service calls |
  |---|---|---|
  | `add <email>` | Subscribe a single contact with optional `--name`/`--company` | `createContact` |
  | `import <csv>` | Bulk import from CSV, skipping invalid emails | `createContact` (per row) |
  | `list` | Show opted-in subscribers; `--unsubscribed` shows opted-out | `listContacts` or `listUnsubscribedContacts` |
  | `status <email>` | Show topic preferences, attributes, unsubscribe state | `getContact` |
  | `update <email>` | Update attributes (`--name`, `--company`) and/or `--resubscribe` | `getContact` then `updateContact` |
  | `remove <email>` | Permanently delete a contact | `deleteContact` |

- **`send` command** reads an HTML file, extracts the subject from the `<title>` tag, fetches opted-in subscribers, and sends individually via `SendEmail` with rate throttling via `p-throttle`. Supports `--test` (send to specific emails) and `--dry-run` (preview only). Uses `Promise.allSettled` so individual failures do not abort the batch. Uses `ListManagementOptions` to enable SES-managed unsubscribe links

- **`bulk-send` command** sends a pre-existing SES template to multiple recipients using the `SendBulkEmail` API, which batches up to 50 recipients per API call (constant `BATCH_SIZE`). Requires a template created via the `templates` command. Supports `--data` (default template data as JSON), `--test` (send to specific emails, bypassing the contact list), and `--dry-run` (preview only). Key differences from `send`:
  - Uses `sendBulkEmail` instead of per-recipient `sendEmail` calls, reducing API overhead for large lists
  - `SendBulkEmail` does **not** support `ListManagementOptions`, so no automatic unsubscribe links are injected. The command filters out unsubscribed contacts client-side by fetching opted-in contacts via `listContacts`
  - Throttling is per-batch rather than per-recipient: `batchesPerSecond = floor(effectiveRate / 50)`
  - Returns per-recipient success/failure results from the SES API response. Partial failures are reported individually and set exit code 1
  - The command is a separate top-level command (not a subcommand of `send`) to preserve backward compatibility with `send <html-file>`

- **`init` command** creates the SES contact list and topic. Idempotent -- reports success if the list already exists

- **`suppression` command** manages the SES account-level suppression list (addresses that SES refuses to deliver to due to bounces or complaints). This is an account-level resource, not tied to any contact list:

  | Subcommand | Purpose | Key service calls |
  |---|---|---|
  | `list` | Show suppressed addresses; filterable by `--reason` and date range | `listSuppressedDestinations` |
  | `check <email>` | Show suppression details or error if not suppressed | `getSuppressedDestination` |
  | `add <email>` | Manually suppress an address with `--reason` (BOUNCE/COMPLAINT) | `putSuppressedDestination` |
  | `remove <email>` | Remove an address from the suppression list | `deleteSuppressedDestination` |

- **`lists` command** manages SES contact lists at the account level (viewing, updating, deleting). Unlike `init` (which creates a specific list with a topic), this command operates on any contact list in the account:

  | Subcommand | Purpose | Key service calls |
  |---|---|---|
  | `list` | Show all contact lists in the SES account | `listContactLists` |
  | `show <name>` | Show list metadata, topics, tags, and timestamps | `getContactList` |
  | `update <name>` | Update description and/or add/remove topics | `getContactList` then `updateContactList` |
  | `delete <name>` | Permanently delete a list and all its contacts | `deleteContactList` |

- **`stats` command** provides account-level sending statistics and health monitoring. Unlike most other commands, it does not depend on `newsletter.config.json`:

  | Subcommand | Purpose | Key service calls |
  |---|---|---|
  | `account` | Show sending quota usage, send rate, enforcement status, production/sandbox mode, sending enabled/disabled | `getAccountInfo` |
  | `send` | Show delivery metrics (send, delivery, bounce, complaint totals) over a configurable time range | `getMetrics` |

  The `send` subcommand validates `--days` (positive integer, max 60) at the command boundary and returns exit code 1 for invalid input. It sums per-day metric values into totals for display. Supports `--identity` to filter metrics by a specific sending identity (email or domain)

- **`templates` command** manages SES email templates at the account level. Templates support Handlebars `{{variable}}` syntax for personalization. This command does not depend on `newsletter.config.json`:

  | Subcommand | Purpose | Key service calls |
  |---|---|---|
  | `create <name>` | Create template from local HTML/text files with optional subject | `createTemplate` |
  | `list` | Show all templates with creation dates | `listTemplates` |
  | `show <name>` | Display template name, subject, and content | `getTemplate` |
  | `update <name>` | Update specific fields while preserving others (GET-then-PUT) | `getTemplate` then `updateTemplate` |
  | `delete <name>` | Permanently delete a template | `deleteTemplate` |
  | `preview <name>` | Test-render a template with JSON data and display raw output | `testRenderTemplate` |

  The `create` and `update` subcommands read HTML/text content from local files via `readFileSync`, validating file readability at the command boundary. The `preview` subcommand validates JSON input before calling SES and returns raw rendered MIME output

- **`identities` command** manages SES email and domain identities -- the verified sending addresses/domains that SES requires before allowing email delivery. This is an account-level resource, not tied to any contact list:

  | Subcommand | Purpose | Key service calls |
  |---|---|---|
  | `list` | Show all identities with type and verification status | `listIdentities` |
  | `verify <identity>` | Create and begin verification for an email or domain | `createIdentity` |
  | `show <identity>` | Show verification status, DKIM config, MAIL FROM settings | `getIdentity` |
  | `delete <identity>` | Permanently delete an identity | `deleteIdentity` |

  The `verify` subcommand auto-detects email vs domain from the SES API response type: for emails it displays a message about the verification email, for domains it displays the DKIM CNAME records that must be added to DNS. The `show` subcommand displays detailed DKIM configuration (status, signing enabled, key length, tokens with CNAME record format) and optional MAIL FROM domain settings

- **`config-sets` command** manages SES configuration sets and their nested event destinations. Configuration sets control delivery options (TLS policy, dedicated IP pools), reputation tracking, suppression behavior, click/open tracking, and VDM settings. Event destinations route email events (bounces, complaints, opens, clicks, etc.) to observability targets. This is the first command with a nested sub-entity relationship (event destinations belong to a configuration set). Does not depend on `newsletter.config.json`:

  | Subcommand | Purpose | Key service calls |
  |---|---|---|
  | `list` | Show all configuration sets in the SES account | `listConfigSets` |
  | `create <name>` | Create a config set with optional delivery, reputation, suppression, tracking, and VDM options | `createConfigSet` |
  | `show <name>` | Show full config set details including all option groups | `getConfigSet` |
  | `delete <name>` | Permanently delete a configuration set | `deleteConfigSet` |
  | `destinations <config-set>` | List event destinations for a config set | `getEventDestinations` |
  | `add-destination <config-set> <dest-name>` | Add an event destination routing events to SNS, EventBridge, CloudWatch, or Kinesis Firehose | `createEventDestination` |
  | `remove-destination <config-set> <dest-name>` | Remove an event destination | `deleteEventDestination` |

  The `add-destination` subcommand performs client-side validation before calling the service: it validates event types against a whitelist (`SEND`, `BOUNCE`, `COMPLAINT`, `DELIVERY`, `OPEN`, `CLICK`, `REJECT`, `RENDERING_FAILURE`, `DELIVERY_DELAY`, `SUBSCRIPTION`) and enforces destination-type-specific required parameters (e.g., `--topic-arn` for SNS, `--stream-arn` + `--role-arn` for Firehose, `--dimension` for CloudWatch, `--bus-arn` for EventBridge). CloudWatch dimensions use a colon-delimited format: `name:valueSource:defaultValue`

- **`validate` command** checks email address deliverability using the SES `GetEmailAddressInsights` API. This helps reduce bounces and protect sender reputation by pre-validating addresses before sending. Does not depend on `newsletter.config.json` for `check`, but `list` uses the configured contact list:

  | Subcommand | Purpose | Key service calls |
  |---|---|---|
  | `check <email>` | Validate a single email, displaying overall verdict and 6 evaluation checks (syntax, DNS, mailbox exists, role address, disposable, random input) | `getEmailAddressInsights` |
  | `list` | Validate all opted-in contacts in the configured contact list, showing per-contact results and a summary (valid/uncertain/invalid counts) | `listContacts` then `getEmailAddressInsights` (per contact) |

  The `check` subcommand catches `BadRequestException` for invalid email input and reports via `out.error()`. The `list` subcommand categorizes results by confidence verdict: `HIGH` = valid, `MEDIUM` = uncertain, anything else = invalid

- **`health` command** is a read-only dashboard that aggregates account status, from-address identity verification, contact list health (subscribed/unsubscribed counts), and suppression list statistics into a single view. Depends on `newsletter.config.json` because it uses the configured `contactListName`, `topicName`, and `fromAddress`. Composes four parallel service calls (`getAccountInfo`, `listContacts`, `listUnsubscribedContacts`, `listSuppressedDestinations`) followed by a sequential `getIdentity` call (sequential because it needs to extract the email from config first). Uses `extractEmail()` from `@/src/lib/email.ts` to parse the bare email from the config's `fromAddress` (which may be in `"Name <email>"` format)

- **`preflight` command** performs pre-send validation before a newsletter delivery. Takes a required `<template>` argument and optional `--data <json>` for template render testing. Runs checks sequentially and reports each as `[PASS]`, `[WARN]`, or `[FAIL]`:

  | Check | PASS | WARN | FAIL |
  |---|---|---|---|
  | Account | Sending enabled, production access | Sandbox mode or non-HEALTHY enforcement | Sending disabled |
  | Identity | From address verified | -- | Not found or not verified |
  | Template | Exists (and renders if `--data` provided) | -- | Not found or render fails |
  | Recipients | Contacts exist | 0 subscribers | -- |
  | Quota | Headroom sufficient | Recipients exceed remaining quota | -- |
  | Suppression | No overlap | Contacts on suppression list | -- |

  Sets exit code 1 if any check is FAIL. WARN checks do not cause failure. Depends on `newsletter.config.json`. Uses `extractEmail()` from `@/src/lib/email.ts`

- **`cleanup` command** cross-references the configured contact list with the account suppression list to find subscribed contacts that have bounced or complained. Has two subcommands:

  | Subcommand | Purpose | Key behavior |
  |---|---|---|
  | `report` | Display overlap between contacts and suppression list | Read-only, shows email/reason/date |
  | `run` | Take action on overlapping contacts | `--action unsubscribe` (default) sets `unsubscribeAll: true`; `--action remove` deletes the contact |

  The `run` subcommand requires a `--confirm` flag for safety; without it, the command exits with code 1 and an error message. The overlap detection (`findOverlap` helper) uses case-insensitive email matching via `toLowerCase()`. This command bridges the gap between SES's separate contact list and suppression list systems, which have no built-in cross-referencing API. Depends on `newsletter.config.json`

- **`setup` command** orchestrates SES newsletter infrastructure setup into a single workflow, following the same subcommand pattern as `cleanup` (read-only audit vs. mutating action). Depends on `newsletter.config.json`:

  | Subcommand | Purpose | Key behavior |
  |---|---|---|
  | `check` | Audit SES infrastructure readiness | Parallel reads via `Promise.all` for account, identity, and contact list; reports `[OK]`/`[MISSING]`/`[PENDING]`/`[WARN]`/`[FAIL]` status markers |
  | `run` | Create missing SES infrastructure | Check-then-create for identity; catch `AlreadyExistsException` for contact list; safe to run multiple times |

  The `check` subcommand verifies three things: account sending is enabled (`[FAIL]` if disabled), the from-address identity exists and is verified (`[MISSING]` if absent, `[PENDING]` if unverified), and the contact list exists (`[MISSING]` if absent). Sandbox mode produces a `[WARN]` but does not set exit code 1. The `run` subcommand creates the identity and contact list if they do not exist, displaying DKIM DNS records for domain identities. Uses `extractEmail()` from `@/src/lib/email.ts` to parse the bare email from `fromAddress`. Composes existing `SesService` methods (`getAccountInfo`, `getIdentity`, `createIdentity`, `getContactList`, `createContactList`) without adding any new service methods

### Things to Know

- **Error handling convention:** Commands catch only expected AWS errors at the boundary (`AlreadyExistsException`, `NotFoundException`, `BadRequestException`) and let unexpected errors bubble up. The `update` and `status` subcommands verify the contact exists via `getContact` before proceeding, returning a user-facing error if not found
- **Error handling divergence across command groups:** For "get/show" operations, commands rely on the service returning `null` for not-found (e.g., `contacts status`, `suppression check`, `lists show`, `identities show`, `config-sets show`). For "delete/remove" operations, commands catch `NotFoundException` at the command boundary (e.g., `contacts remove`, `suppression remove`, `lists delete`, `identities delete`, `config-sets delete`, `config-sets remove-destination`). For "create/verify" operations, commands catch `AlreadyExistsException` (e.g., `init`, `identities verify`, `config-sets create`, `config-sets add-destination`). The `validate check` subcommand catches `BadRequestException` for malformed email input. This split is intentional -- see the matching patterns in `@/src/services/ses.ts`
- **The `suppression`, `lists`, `stats`, `templates`, `identities`, `config-sets`, and `validate check` commands do not depend on `newsletter.config.json`** for their SES calls because they operate at the account level. However, all factories still accept `getConfig` for consistency with the shared command factory signature. The `validate list` subcommand does depend on config to determine which contact list and topic to validate. The abstraction commands (`health`, `preflight`, `cleanup`, `setup`) all depend on config because they operate on the configured contact list and from-address
- **The abstraction commands (`health`, `preflight`, `cleanup`, `setup`) use a top-level try/catch pattern** unlike the low-level commands which catch specific AWS errors. This is because these commands compose multiple service calls and any failure should produce a user-friendly error rather than a stack trace. The `preflight` and `setup check` commands additionally track a `hasFailure` boolean to set exit code 1 when any individual check fails, even if the overall command completes without throwing
- **`bulk-send` validates template existence before sending:** It calls `ses.getTemplate(templateName)` and exits with an error if the template is not found, preventing wasted API calls. Similarly, `--data` JSON is validated before any API interaction
- **GET-then-PUT pattern for updates:** `lists update`, `contacts update`, and `templates update` all use this pattern to handle SES's full-replacement semantics. They fetch the current state, merge the caller's changes, and issue the update. For `lists update`, the `--add-topic` option uses a colon-delimited format (`topicName:displayName:OPT_IN|OPT_OUT`) where the display name may contain colons -- parsing splits on colons and uses the last segment as the status. For `templates update`, the GET-then-PUT is done at the command layer rather than the service layer
- **Email validation:** Both `contacts add` and `contacts import` validate emails using `@/src/lib/validation.ts` before calling the service. The `suppression add` command also validates emails. Invalid emails are rejected (add) or skipped with a report (import)
- **The `update` subcommand's resubscribe logic** maps over the contact's existing topic preferences and flips only the configured topic to `OPT_IN`, preserving other topic states. It also sets `unsubscribeAll: false`
- **CSV import** uses `@/src/lib/csv.ts` for parsing. Expected columns are `email,name,company,added_date`. The `addedDate` field is stored as a contact attribute, not used for any date logic

Created and maintained by Nori.
