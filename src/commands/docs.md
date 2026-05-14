# Noridoc: commands

Path: @/src/commands

### Overview

- Contains all CLI command implementations, each exported as a factory function that receives `SesService`, `Output`, and a config getter via dependency injection
- Commands cover the full newsletter workflow: initializing the SES contact list, managing subscriber contacts (add, import, list, status, update, remove), sending newsletters, managing the SES account-level suppression list, managing contact lists (list, show, update, delete), viewing sending statistics/account health, and managing reusable email templates with Handlebars personalization

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

- **`send` command** reads an HTML file, extracts the subject from the `<title>` tag, fetches opted-in subscribers, and sends individually with rate throttling via `p-throttle`. Supports `--test` (send to specific emails) and `--dry-run` (preview only). Uses `Promise.allSettled` so individual failures do not abort the batch

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

### Things to Know

- **Error handling convention:** Commands catch only expected AWS errors at the boundary (`AlreadyExistsException`, `NotFoundException`) and let unexpected errors bubble up. The `update` and `status` subcommands verify the contact exists via `getContact` before proceeding, returning a user-facing error if not found
- **Error handling divergence across command groups:** For "get/show" operations, commands rely on the service returning `null` for not-found (e.g., `contacts status`, `suppression check`, `lists show`). For "delete/remove" operations, commands catch `NotFoundException` at the command boundary (e.g., `contacts remove`, `suppression remove`, `lists delete`). This split is intentional -- see the matching patterns in `@/src/services/ses.ts`
- **The `suppression`, `lists`, `stats`, and `templates` commands do not depend on `newsletter.config.json`** for their SES calls because they operate at the account level. However, all factories still accept `getConfig` for consistency with the shared command factory signature
- **GET-then-PUT pattern for updates:** `lists update`, `contacts update`, and `templates update` all use this pattern to handle SES's full-replacement semantics. They fetch the current state, merge the caller's changes, and issue the update. For `lists update`, the `--add-topic` option uses a colon-delimited format (`topicName:displayName:OPT_IN|OPT_OUT`) where the display name may contain colons -- parsing splits on colons and uses the last segment as the status. For `templates update`, the GET-then-PUT is done at the command layer rather than the service layer
- **Email validation:** Both `contacts add` and `contacts import` validate emails using `@/src/lib/validation.ts` before calling the service. The `suppression add` command also validates emails. Invalid emails are rejected (add) or skipped with a report (import)
- **The `update` subcommand's resubscribe logic** maps over the contact's existing topic preferences and flips only the configured topic to `OPT_IN`, preserving other topic states. It also sets `unsubscribeAll: false`
- **CSV import** uses `@/src/lib/csv.ts` for parsing. Expected columns are `email,name,company,added_date`. The `addedDate` field is stored as a contact attribute, not used for any date logic

Created and maintained by Nori.
