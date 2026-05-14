# Noridoc: services

Path: @/src/services

### Overview

- Defines the `SesService` interface and its concrete AWS SES implementation, providing the abstraction boundary between CLI commands and the AWS SDK
- All AWS SES API calls (contact management, email sending, account quota queries) flow through this single service layer

### How it fits into the larger codebase

- Commands in `@/src/commands/` receive a `SesService` instance via dependency injection and never call the AWS SDK directly
- `@/src/index.ts` constructs the concrete SES implementation via `createSesService(client)` and passes it to `createProgram()`
- Tests substitute the mock implementation from `@/tests/helpers.ts` at this same interface boundary
- The `SesService` interface is the primary seam for testability -- any new AWS SES operation must be added to both the interface and the mock

### Core Implementation

- **Interface pattern:** `SesService` is a TypeScript interface; `createSesService()` returns an object literal implementing it. This avoids class inheritance and keeps the factory function as the single construction point
- **Contact lifecycle methods:** The service provides `createContact`, `getContact`, `listContacts`, `listUnsubscribedContacts`, `updateContact`, and `deleteContact`. Together these cover the full subscriber lifecycle from opt-in through opt-out and resubscription
- **Attributes storage:** SES stores contact attributes as a single JSON string (`AttributesData`). The service handles JSON serialization/deserialization at the boundary so callers work with plain `Record<string, string>` objects
- **Email sending:** `sendEmail` wraps `SendEmailCommand` with `ListManagementOptions` to enable SES-managed unsubscribe links and topic-based preference handling
- **Rate discovery:** `getMaxSendRate()` calls `GetAccountCommand` to read the account's `SendQuota.MaxSendRate`, falling back to 1/sec on any error

### Things to Know

- **`listUnsubscribedContacts` works around an AWS service bug:** The SES `ListContactsCommand` with `FilteredStatus: "OPT_OUT"` returns empty results (tracked in AWS SDK GitHub issue #8742). The implementation fetches all contacts without a filter and performs client-side filtering for `UnsubscribeAll` or topic-level `OPT_OUT` status. This is intentional and necessary until AWS fixes the API
- **`updateContact` uses GET-then-PUT to handle SES's full-replacement semantics:** The SES `UpdateContactCommand` replaces all fields, not just the ones you send. The service reads the current contact state first, merges the caller's changes (topic preferences, unsubscribe flag, attributes), and then issues the update. This prevents accidental data loss when updating a single field
- **`getContact` returns `null` for missing contacts** by catching `NotFoundException`, rather than letting the error propagate. This is the only method with a try/catch, and it is at the SDK boundary
- **Pagination:** Both `listContacts` and `listUnsubscribedContacts` handle SES pagination via `NextToken` loops to return complete result sets

Created and maintained by Nori.
