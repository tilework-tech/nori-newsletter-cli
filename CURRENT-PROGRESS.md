# Current Progress

## Tier 1 Features (from APPLICATION-SPEC.md)

| Feature | Status |
|---------|--------|
| 1. Unsubscribe Visibility | Done |
| 2. Account-Level Suppression List | Done |
| 3. Contact Updates | Done |
| 4. Contact List Management | Not Started |
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

## Next: Contact List Management

The next commit should add visibility and management of SES contact lists. Key operations: list all contact lists, view details, update metadata/topics, delete a list. This is Tier 1 item #4.
