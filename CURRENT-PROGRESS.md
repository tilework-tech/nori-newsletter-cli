# Current Progress

## Tier 1 Features (from APPLICATION-SPEC.md)

| Feature | Status |
|---------|--------|
| 1. Unsubscribe Visibility | Done |
| 2. Account-Level Suppression List | Done |
| 3. Contact Updates | Done |
| 4. Contact List Management | Done |
| 5. Sending Statistics and Metrics | Done |

## Completed: Unsubscribe Visibility + Contact Lifecycle

Added three new CLI capabilities:

- `contacts list --unsubscribed` — lists contacts who have opted out, working around the AWS service bug where FilteredStatus OPT_OUT returns empty results by fetching all contacts and filtering client-side
- `contacts status <email>` — shows a contact's full details including topic preferences, attributes, and unsubscribe state. Uses the previously-unused `getContact` SES service method
- `contacts update <email>` — updates contact attributes (--name, --company) and allows resubscribing (--resubscribe). Handles SES's full-replacement UpdateContact semantics by doing GET-then-PUT internally

### Files changed
- `src/services/ses.ts` — Extended SesService interface with `listUnsubscribedContacts`, `updateContact`, expanded `getContact` return type
- `src/commands/contacts.ts` — Added `--unsubscribed` flag, `status` and `update` subcommands
- `tests/helpers.ts` — Extended mock with new methods
- `tests/commands/contacts.test.ts` — Added 10 new tests (64 total, all passing)

## Completed: Account-Level Suppression List

Added a `suppression` command group with four subcommands:

- `suppression list` — lists suppressed addresses, filterable by `--reason` (BOUNCE/COMPLAINT) and `--start-date`/`--end-date` date range
- `suppression check <email>` — shows details of a suppressed address (reason, date, message ID, feedback ID) or error if not suppressed
- `suppression add <email> --reason <BOUNCE|COMPLAINT>` — manually adds an address to the suppression list (upsert behavior)
- `suppression remove <email>` — removes an address from the suppression list

### Files changed
- `src/services/ses.ts` — Extended SesService with `listSuppressedDestinations`, `getSuppressedDestination`, `putSuppressedDestination`, `deleteSuppressedDestination`
- `src/commands/suppression.ts` — New command file with four subcommands
- `src/program.ts` — Registered the suppression command
- `tests/helpers.ts` — Extended mock with in-memory suppression storage
- `tests/commands/suppression.test.ts` — 14 new tests (78 total, all passing)

## Completed: Contact List Management

Added a `lists` command group with four subcommands:

- `lists list` — lists all contact lists in the SES account with names and last-updated timestamps
- `lists show <name>` — displays full details of a contact list including description, topics (with display name, default status, description), timestamps, and tags
- `lists update <name>` — updates a contact list's description, adds topics (`--add-topic name:displayName:OPT_IN|OPT_OUT`), or removes topics (`--remove-topic name`). Uses GET-then-PUT internally to handle SES's full-replacement semantics
- `lists delete <name>` — deletes a contact list and all its contacts (cascading delete)

### Files changed
- `src/services/ses.ts` — Extended SesService with `listContactLists`, `getContactList`, `updateContactList`, `deleteContactList`
- `src/commands/lists.ts` — New command file with four subcommands
- `src/program.ts` — Registered the lists command, updated program description to mention all command groups
- `tests/helpers.ts` — Refactored mock from boolean to Map-based contact list storage, added mock implementations for all 4 new methods
- `tests/commands/lists.test.ts` — 14 new tests (93 total, all passing)

## Completed: Sending Statistics and Metrics

Added a `stats` command group with two subcommands:

- `stats account` — shows SES account health: sending quota usage (sent/max in last 24h), max send rate, enforcement status (HEALTHY/PROBATION/SHUTDOWN), production vs sandbox mode, and whether sending is enabled
- `stats send` — retrieves delivery metrics using BatchGetMetricData API. Shows totals for SEND, DELIVERY, PERMANENT_BOUNCE, and COMPLAINT over a configurable time range (`--days`, default 7, max 60). Supports filtering by sending identity (`--identity`). Requires VDM to be enabled.

### Files changed
- `src/services/ses.ts` — Extended SesService with `getAccountInfo()` (expands existing GetAccount usage) and `getMetrics()` (new BatchGetMetricDataCommand)
- `src/commands/stats.ts` — New command file with two subcommands
- `src/program.ts` — Registered the stats command, updated program description
- `tests/helpers.ts` — Extended mock with `getAccountInfo()` and `getMetrics()`, added MockSesServiceOptions fields
- `tests/commands/stats.test.ts` — 15 new tests (110 total, all passing)

## All Tier 1 Features Complete

All 5 Tier 1 features from APPLICATION-SPEC.md are now implemented.

## Tier 2 Features (from APPLICATION-SPEC.md)

| Feature | Status |
|---------|--------|
| 6. Email Templates | Done |
| 7. Bulk Send | Done |
| 8. Identity and Domain Management | Done |
| 9. Configuration Sets and Event Destinations | Done |
| 10. Email Address Validation | Done |
| 11. Bulk Import/Export via S3 | Not started |

## Completed: Email Templates

Added a `templates` command group with six subcommands:

- `templates create <name>` — creates a template from local HTML (`--html <path>`) and/or text (`--text <path>`) files with an optional subject line (`--subject`). Catches AlreadyExistsException for duplicate names.
- `templates list` — lists all templates showing names and creation timestamps
- `templates show <name>` — displays full template details including subject, HTML content, and text content
- `templates update <name>` — updates specific fields of a template (`--subject`, `--html <path>`, `--text <path>`). Uses GET-then-PUT at the command layer to preserve unspecified fields, working around SES's full-replacement UpdateEmailTemplate semantics.
- `templates delete <name>` — deletes a template, handles NotFoundException
- `templates preview <name> --data <json>` — renders a template with test variable data (JSON string) and displays the output. Validates JSON before calling SES.

### Files changed
- `src/services/ses.ts` — Extended SesService interface with `createTemplate`, `getTemplate`, `listTemplates`, `updateTemplate`, `deleteTemplate`, `testRenderTemplate`
- `src/commands/templates.ts` — New command file with six subcommands
- `src/program.ts` — Registered the templates command, updated program description
- `tests/helpers.ts` — Extended mock with in-memory template storage, basic Handlebars substitution for testRenderTemplate
- `tests/commands/templates.test.ts` — 15 new tests (123 total, all passing)

## Completed: Bulk Send

Added a `bulk-send` command that sends templated emails to multiple recipients using the SES `SendBulkEmail` API, batching up to 50 recipients per API call instead of sending one-at-a-time.

- `bulk-send <template>` — sends a templated email to all subscribed contacts using the named SES template. Batches recipients into groups of 50 per API call. Supports `--data <json>` for default template variable data, `--test <emails>` for test recipients, and `--dry-run` for previewing
- Reports per-recipient success/failure from the bulk API response
- Throttles batch calls based on account's max send rate (same `p-throttle` pattern as `send` but per-batch instead of per-email)
- Verifies template exists before sending (fails fast with clear error)
- Validates `--data` JSON before sending

**Key limitation:** `SendBulkEmail` does NOT support `ListManagementOptions` (automatic unsubscribe link management). The command filters out unsubscribed contacts client-side via the existing `listContacts` method. This is a documented AWS API limitation with no planned resolution.

### Files changed
- `src/services/ses.ts` — Extended SesService interface with `sendBulkEmail` method (wraps `SendBulkEmailCommand`)
- `src/commands/bulk-send.ts` — New command file with bulk send logic
- `src/program.ts` — Registered the bulk-send command, updated program description
- `tests/helpers.ts` — Extended mock with `sendBulkEmail`, `SentBulkEmail` tracking, `sendBulkEmailBehavior` option
- `tests/commands/bulk-send.test.ts` — 10 new tests (133 total, all passing)

## Completed: Identity and Domain Management

Added an `identities` command group with four subcommands:

- `identities list` — lists all email and domain identities in the SES account with their type (EMAIL_ADDRESS/DOMAIN) and verification status (PENDING/SUCCESS/FAILED/etc.)
- `identities verify <identity>` — verifies a new email address or domain. For email addresses, reports that a verification email was sent (link expires in 24h). For domains, displays the 3 DKIM CNAME records that need to be added to DNS (SES polls for 72h).
- `identities show <identity>` — displays full identity details including verification status, DKIM configuration (status, signing enabled, key length, tokens), and MAIL FROM settings if configured
- `identities delete <identity>` — deletes an identity, handles NotFoundException

### Files changed
- `src/services/ses.ts` — Extended SesService interface with `listIdentities`, `createIdentity`, `getIdentity`, `deleteIdentity`. Uses `CreateEmailIdentityCommand`, `GetEmailIdentityCommand`, `ListEmailIdentitiesCommand`, `DeleteEmailIdentityCommand`.
- `src/commands/identities.ts` — New command file with four subcommands
- `src/program.ts` — Registered the identities command, updated program description
- `tests/helpers.ts` — Extended mock with `MockIdentity` in-memory storage, email-vs-domain auto-detection, DKIM token generation for domains
- `tests/commands/identities.test.ts` — 10 new tests (144 total, all passing)

## Completed: Configuration Sets and Event Destinations

Added a `config-sets` command group with seven subcommands for managing SES configuration sets and their event destinations:

- `config-sets list` — lists all configuration sets in the SES account
- `config-sets create <name>` — creates a configuration set with optional delivery (`--tls`), reputation (`--reputation-metrics`), suppression (`--suppression-reasons`), tracking (`--tracking-domain`), and VDM (`--vdm-engagement`, `--vdm-optimized-delivery`) settings
- `config-sets show <name>` — displays full config set details including all configured options
- `config-sets delete <name>` — deletes a configuration set, handles NotFoundException
- `config-sets destinations <name>` — lists event destinations for a config set, showing destination name, type, enabled status, and matched event types
- `config-sets add-destination <config-set> <dest-name>` — adds an event destination. Supports four destination types: SNS (`--topic-arn`), EventBridge (`--bus-arn`), Kinesis Firehose (`--stream-arn` + `--role-arn`), and CloudWatch (`--dimension`). Requires `--type` and `--events` (comma-separated event types). Validates destination-type-specific required parameters client-side before API call.
- `config-sets remove-destination <config-set> <dest-name>` — removes an event destination

Event destinations are the first nested sub-entity in the CLI — they belong to a configuration set rather than being top-level. The mock storage reflects this with a Map inside each MockConfigSet.

### Files changed
- `src/services/ses.ts` — Extended SesService interface with `createConfigSet`, `getConfigSet`, `listConfigSets`, `deleteConfigSet`, `createEventDestination`, `getEventDestinations`, `deleteEventDestination`. Uses 7 new AWS SDK commands.
- `src/commands/config-sets.ts` — New command file with seven subcommands
- `src/program.ts` — Registered the config-sets command, updated program description
- `tests/helpers.ts` — Extended mock with `MockConfigSet` and `MockEventDestination` in-memory storage, `getConfigSetCount()` inspector
- `tests/commands/config-sets.test.ts` — 25 new tests (170 total, all passing)

## Completed: Email Address Validation

Added a `validate` command group with two subcommands that use the SES `GetEmailAddressInsights` API to check email address deliverability before sending:

- `validate check <email>` — validates a single email address and displays all 6 evaluation checks: syntax, DNS records, mailbox existence, role address detection, disposable address detection, and random input detection. Each check returns a confidence verdict (HIGH/MEDIUM/LOW). Handles `BadRequestException` for malformed input.
- `validate list` — validates all subscribed contacts in the configured contact list. Shows per-contact results (email + overall verdict) and a summary line with counts of valid (HIGH), uncertain (MEDIUM), and invalid (LOW) addresses.

### Files changed
- `src/services/ses.ts` — Extended SesService interface with `getEmailAddressInsights(email)`. Uses `GetEmailAddressInsightsCommand` from `@aws-sdk/client-sesv2`. Returns normalized result with `isValid` verdict and 6 evaluation checks, defaulting optional fields to `"UNKNOWN"`.
- `src/commands/validate.ts` — New command file with two subcommands
- `src/program.ts` — Registered the validate command, updated program description
- `tests/helpers.ts` — Extended mock with `validateBehavior` option and `getEmailAddressInsights` default implementation (all-valid)
- `tests/commands/validate.test.ts` — 8 new tests (178 total, all passing)
