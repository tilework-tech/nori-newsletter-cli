# Current Progress

## Tier 1 Features (from APPLICATION-SPEC.md)

| Feature | Status |
|---------|--------|
| 1. Unsubscribe Visibility | Done |
| 2. Account-Level Suppression List | Not Started |
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

## Next: Account-Level Suppression List

The next commit should add visibility into SES's account-level suppression list (bounced/complained addresses). Key operations: list, check, add, remove suppressed destinations. This is Tier 1 item #2.
