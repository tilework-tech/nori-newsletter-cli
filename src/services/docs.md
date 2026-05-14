# Noridoc: services

Path: @/src/services

### Overview

- Defines the `SesService` interface and its concrete AWS SES implementation, providing the abstraction boundary between CLI commands and the AWS SDK
- All AWS SES API calls (contact management, individual and bulk email sending, account quota queries, account-level suppression list management, contact list management, account health, delivery metrics, email template management, and email/domain identity management) flow through this single service layer

### How it fits into the larger codebase

- Commands in `@/src/commands/` receive a `SesService` instance via dependency injection and never call the AWS SDK directly
- `@/src/index.ts` constructs the concrete SES implementation via `createSesService(client)` and passes it to `createProgram()`
- Tests substitute the mock implementation from `@/tests/helpers.ts` at this same interface boundary
- The `SesService` interface is the primary seam for testability -- any new AWS SES operation must be added to both the interface and the mock

### Core Implementation

- **Interface pattern:** `SesService` is a TypeScript interface; `createSesService()` returns an object literal implementing it. This avoids class inheritance and keeps the factory function as the single construction point
- **Contact lifecycle methods:** The service provides `createContact`, `getContact`, `listContacts`, `listUnsubscribedContacts`, `updateContact`, and `deleteContact`. Together these cover the full subscriber lifecycle from opt-in through opt-out and resubscription
- **Attributes storage:** SES stores contact attributes as a single JSON string (`AttributesData`). The service handles JSON serialization/deserialization at the boundary so callers work with plain `Record<string, string>` objects
- **Email sending:** `sendEmail` wraps `SendEmailCommand` with `ListManagementOptions` to enable SES-managed unsubscribe links and topic-based preference handling. `sendBulkEmail` wraps `SendBulkEmailCommand` for batched template-based sending -- it accepts a `from`, `replyTo`, `templateName`, optional `defaultTemplateData`, and an array of per-recipient entries (each with a `to` and optional `replacementData` for per-recipient template overrides). Returns per-entry results with status, optional messageId, and optional error. Unlike `sendEmail`, `SendBulkEmail` does **not** support `ListManagementOptions`, so unsubscribe filtering must happen client-side
- **Rate discovery:** `getMaxSendRate()` calls `GetAccountCommand` to read the account's `SendQuota.MaxSendRate`, falling back to 1/sec on any error
- **Suppression list methods:** `listSuppressedDestinations`, `getSuppressedDestination`, `putSuppressedDestination`, and `deleteSuppressedDestination` wrap the corresponding SES account-level suppression list API commands. These operate at the AWS account level, not on any specific contact list. `listSuppressedDestinations` supports server-side filtering by reason and date range, and handles pagination via `NextToken`
- **Contact list management methods:** `listContactLists`, `getContactList`, `updateContactList`, and `deleteContactList` provide CRUD operations on SES contact lists themselves (as opposed to the contacts within them). `updateContactList` uses GET-then-PUT to handle SES's full-replacement semantics -- same pattern as `updateContact`. `listContactLists` handles pagination via `NextToken`
- **Account health and metrics methods:** `getAccountInfo()` calls `GetAccountCommand` and surfaces sending quota (sent/max last 24h), max send rate, enforcement status (HEALTHY/PROBATION/SHUTDOWN), production vs sandbox mode, and whether sending is enabled. `getMetrics()` wraps `BatchGetMetricDataCommand` to retrieve delivery metrics (SEND, DELIVERY, PERMANENT_BOUNCE, COMPLAINT) over a time range, with optional filtering by sending identity via the `EMAIL_IDENTITY` dimension. Both methods reuse the same `GetAccountCommand` that `getMaxSendRate()` uses, but `getAccountInfo()` extracts a broader set of fields
- **Email template methods:** `createTemplate`, `getTemplate`, `listTemplates`, `updateTemplate`, `deleteTemplate`, and `testRenderTemplate` wrap the SES email template API commands. Templates are account-level resources that support Handlebars `{{variable}}` syntax for personalization. `testRenderTemplate` passes a JSON string of template variables to SES and returns the raw rendered output. Unlike `updateContact` and `updateContactList`, the template `updateTemplate` does not do GET-then-PUT at the service layer -- the command layer (`@/src/commands/templates.ts`) handles the merge. `listTemplates` handles pagination via `NextToken`
- **Email/domain identity methods:** `listIdentities`, `createIdentity`, `getIdentity`, and `deleteIdentity` wrap the SES email identity API commands (`ListEmailIdentitiesCommand`, `CreateEmailIdentityCommand`, `GetEmailIdentityCommand`, `DeleteEmailIdentityCommand`). Identities are account-level resources representing verified email addresses or domains that SES requires before allowing email delivery. `createIdentity` returns the identity type (auto-detected by SES), verification status, and DKIM tokens/hosted zone for domain identities. `getIdentity` returns detailed information including DKIM configuration (status, signing enabled, key length, tokens, hosted zone) and optional MAIL FROM domain settings. `listIdentities` handles pagination via `NextToken`

### Things to Know

- **`listUnsubscribedContacts` works around an AWS service bug:** The SES `ListContactsCommand` with `FilteredStatus: "OPT_OUT"` returns empty results (tracked in AWS SDK GitHub issue #8742). The implementation fetches all contacts without a filter and performs client-side filtering for `UnsubscribeAll` or topic-level `OPT_OUT` status. This is intentional and necessary until AWS fixes the API
- **`updateContact` uses GET-then-PUT to handle SES's full-replacement semantics:** The SES `UpdateContactCommand` replaces all fields, not just the ones you send. The service reads the current contact state first, merges the caller's changes (topic preferences, unsubscribe flag, attributes), and then issues the update. This prevents accidental data loss when updating a single field
- **"Get" methods catch `NotFoundException` and return `null`:** `getContact`, `getSuppressedDestination`, `getContactList`, `getTemplate`, and `getIdentity` all catch `NotFoundException` at the SDK boundary and return `null` instead of propagating the error. All other methods (including delete operations and `sendBulkEmail`) let errors propagate to the caller. This split is intentional -- "get" methods are querying for existence, while other operations failing is an error the command layer should handle
- **Pagination:** All `list*` methods (`listContacts`, `listUnsubscribedContacts`, `listSuppressedDestinations`, `listContactLists`, `listTemplates`, `listIdentities`) handle SES pagination via `NextToken` loops to return complete result sets
- **`getMetrics()` requires VDM:** The `BatchGetMetricDataCommand` only works when Virtual Deliverability Manager is enabled on the SES account. Metric data is retained for 60 days. The method builds one query per metric in the `VDM` namespace and returns both results and errors separately, since individual metric queries can fail independently within a batch

Created and maintained by Nori.
