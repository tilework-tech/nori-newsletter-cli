# Research Notes

## SES v2 API Findings

### ListContacts OPT_OUT Filter Bug
- `FilteredStatus: "OPT_OUT"` is broken at the AWS service level (GitHub issue #8742)
- Returns empty results even when OPT_OUT contacts exist
- Workaround: fetch all contacts (no filter) and filter client-side
- The OPT_IN filter works correctly

### UpdateContact Full Replacement Semantics
- UpdateContact replaces ALL TopicPreferences, not just the ones you specify
- Omitted topics lose their preferences entirely
- Pattern: always GET first, modify in memory, then PUT back
- Also applies to AttributesData and UnsubscribeAll

### UseDefaultIfPreferenceUnavailable
- Controls whether contacts without explicit topic preferences are included based on the topic's DefaultSubscriptionStatus
- When true + topic defaults to OPT_IN: contacts without explicit preference are treated as opted-in
- Current codebase uses `true` for the OPT_IN listing, which is correct

### GetContact Already Implemented
- `getContact` exists on SesService interface but is unused by any command
- Returns `{email, attributes?, unsubscribeAll}` or null for NotFoundException
- Missing: TopicPreferences in the return type (needed for status display)

### SDK Enum Exports
- SDK exports: `SuppressionListReason`, `Metric`, `MetricDimensionName`, `SubscriptionStatus`
- If enums don't resolve, use string literals: "BOUNCE", "OPT_IN", etc.

## Account-Level Suppression List APIs

### API Commands and Types
- `ListSuppressedDestinationsCommand` — params: `Reasons?` (["BOUNCE"|"COMPLAINT"]), `StartDate?`, `EndDate?`, `NextToken?`, `PageSize?`
- Returns `SuppressedDestinationSummary[]`: `{ EmailAddress, Reason, LastUpdateTime }` (no Attributes)
- `GetSuppressedDestinationCommand` — param: `EmailAddress` (required)
- Returns `SuppressedDestination`: `{ EmailAddress, Reason, LastUpdateTime, Attributes?: { MessageId?, FeedbackId? } }`
- Throws `NotFoundException` when address is not suppressed
- `PutSuppressedDestinationCommand` — params: `EmailAddress` (required), `Reason` (required: "BOUNCE"|"COMPLAINT")
- Empty response. This is an upsert — calling on already-suppressed address updates reason and timestamp
- `DeleteSuppressedDestinationCommand` — param: `EmailAddress` (required)
- Empty response. Throws `NotFoundException` if not suppressed

### SuppressionListReason
- Const object, not TypeScript enum: `{ BOUNCE: "BOUNCE", COMPLAINT: "COMPLAINT" }`
- Type is union: `"BOUNCE" | "COMPLAINT"`

### Key Quirks
- **Case sensitivity**: Suppression list management APIs are case-sensitive for email lookups
- **Pagination**: SDK paginator `paginateListSuppressedDestinations` works (AWS CLI has a known pagination bug #7859, not relevant here)
- **Sandbox restriction**: `PutSuppressedDestination` requires production access (not sandbox)
- **Messages still count toward quota**: Sending to suppressed addresses counts toward daily quota even though SES won't deliver
- **Hard bounces only**: Only hard bounces trigger automatic suppression; soft bounces do not
- **Gmail complaints**: Gmail does NOT forward complaint data to SES, so Gmail spam reports don't auto-suppress
- **90-day auto-deletion**: If account sending is paused, SES deletes all suppression entries after 90 days
