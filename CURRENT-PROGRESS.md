# Current Progress

## Tier 1 Features (from APPLICATION-SPEC.md)

| Feature | Status |
|---------|--------|
| 1. Unsubscribe Visibility | Done |
| 2. Account-Level Suppression List | Done |
| 3. Contact Updates | Done |
| 4. Contact List Management | Done |
| 5. Sending Statistics and Metrics | Not Started |

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

## Next: Sending Statistics and Metrics

The next commit should expose sending statistics and metrics. Key operations: surface quota usage (SentLast24Hours / Max24HourSend) from GetAccount, and batch metric data for delivery/engagement rates. This is Tier 1 item #5.
