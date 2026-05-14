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
| 8. Identity and Domain Management | Not started |
| 9. Configuration Sets and Event Destinations | Not started |
| 10. Email Address Validation | Not started |
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
