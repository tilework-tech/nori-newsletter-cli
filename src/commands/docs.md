# Noridoc: commands

Path: @/src/commands

### Overview

- Contains all CLI command implementations, each exported as a factory function that receives `SesService`, `Output`, and a config getter via dependency injection
- Commands cover the full newsletter workflow: initializing the SES contact list, managing subscriber contacts (add, import, list, status, update, remove), sending newsletters, and managing the SES account-level suppression list

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

### Things to Know

- **Error handling convention:** Commands catch only expected AWS errors at the boundary (`AlreadyExistsException`, `NotFoundException`) and let unexpected errors bubble up. The `update` and `status` subcommands verify the contact exists via `getContact` before proceeding, returning a user-facing error if not found
- **Error handling divergence in suppression commands:** `suppression check` relies on the service returning `null` for not-found (same pattern as `contacts status`). `suppression remove` catches `NotFoundException` at the command boundary because the service method lets the error propagate (same pattern as `contacts remove`). This is intentional -- see the matching patterns in `@/src/services/ses.ts`
- **The suppression command does not depend on `newsletter.config.json`** for its SES calls because the suppression list is account-level. However, the factory still accepts `getConfig` for consistency with all other command factories
- **Email validation:** Both `contacts add` and `contacts import` validate emails using `@/src/lib/validation.ts` before calling the service. The `suppression add` command also validates emails. Invalid emails are rejected (add) or skipped with a report (import)
- **The `update` subcommand's resubscribe logic** maps over the contact's existing topic preferences and flips only the configured topic to `OPT_IN`, preserving other topic states. It also sets `unsubscribeAll: false`
- **CSV import** uses `@/src/lib/csv.ts` for parsing. Expected columns are `email,name,company,added_date`. The `addedDate` field is stored as a contact attribute, not used for any date logic

Created and maintained by Nori.
