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

## Contact List Management APIs

### ListContactListsCommand
- Params: `PageSize?`, `NextToken?`
- Response: `{ ContactLists?: ContactList[], NextToken? }` — PascalCase `ContactLists`
- `ContactList` is sparse: only `ContactListName` and `LastUpdatedTimestamp`. Does NOT include Topics, Description, Tags, or CreatedTimestamp
- Returns empty array (not NotFoundException) when no lists exist
- Paginator `paginateListContactLists` is exported from `@aws-sdk/client-sesv2`
- Errors: `BadRequestException`, `TooManyRequestsException` (no NotFoundException)

### GetContactListCommand
- Params: `ContactListName` (required)
- Response: `{ ContactListName?, Topics?: Topic[], Description?, CreatedTimestamp?, LastUpdatedTimestamp?, Tags?: Tag[] }`
- Returns full metadata — this is the only way to see Topics, Description, Tags
- Does NOT return contact data (just list metadata)
- Errors: `NotFoundException`, `BadRequestException`, `TooManyRequestsException`

### UpdateContactListCommand
- Params: `ContactListName` (required), `Topics?`, `Description?`
- **CRITICAL: Full replacement operation** — omitting Topics removes all topics, omitting Description clears it
- Pattern: always GET first, modify in memory, then PUT back (same as UpdateContact)
- Cannot rename a contact list — ContactListName identifies which list to update
- No Tags field — tags must be managed separately via TagResource/UntagResource
- Errors: `NotFoundException`, `ConcurrentModificationException` (HTTP 500), `BadRequestException`, `TooManyRequestsException`

### DeleteContactListCommand
- Params: `ContactListName` (required)
- **Cascading delete: removes list AND all contacts**
- Empty response on success
- Errors: `NotFoundException`, `ConcurrentModificationException`, `BadRequestException`, `TooManyRequestsException`

### Topic Type
```typescript
interface Topic {
  TopicName: string;         // required
  DisplayName: string;       // required
  Description?: string;      // optional
  DefaultSubscriptionStatus: "OPT_IN" | "OPT_OUT"; // required
}
```

### Tag Type
```typescript
interface Tag {
  Key: string;    // required, max 128 chars
  Value: string;  // required, max 256 chars
}
```

### Key Quirks
- ListContactLists returns sparse objects — need GetContactList per list for full details
- UpdateContactList is full replacement (same pattern as UpdateContact)
- ConcurrentModificationException on both update AND delete
- Topics have a 20-topic limit per contact list
- Removing a topic via UpdateContactList — unclear what happens to existing contacts' TopicPreferences for that topic

## Sending Statistics and Metrics APIs

### GetAccountCommand (Expanded Usage)
- Already used for `getMaxSendRate()` in `src/services/ses.ts`
- Response includes much more than currently surfaced:
  - `SendQuota.Max24HourSend` — max emails per 24h period (-1 = unlimited)
  - `SendQuota.SentLast24Hours` — emails sent in past 24h
  - `SendQuota.MaxSendRate` — max emails/second (already used)
  - `EnforcementStatus` — string, documented values: "HEALTHY", "PROBATION", "SHUTDOWN" (not a formal enum)
  - `ProductionAccessEnabled` — boolean, false = sandbox mode
  - `SendingEnabled` — boolean, whether sending is enabled in current region
- All fields optional in TypeScript types
- No additional API call needed — same `GetAccountCommand({})` already in use

### BatchGetMetricDataCommand
- Import: `BatchGetMetricDataCommand` from `@aws-sdk/client-sesv2`
- **Request**: `{ Queries: BatchGetMetricDataQuery[] }` — min 1, max 10 queries per request
- **Query shape**:
  ```typescript
  {
    Id: string;              // 1-255 chars, identifies result
    Namespace: "VDM";        // only valid value
    Metric: Metric;          // see enum below
    Dimensions?: Partial<Record<MetricDimensionName, string>>;  // max 3
    StartDate: Date;
    EndDate: Date;
  }
  ```
- **Metric enum values**: SEND, DELIVERY, PERMANENT_BOUNCE, TRANSIENT_BOUNCE, COMPLAINT, OPEN, CLICK, DELIVERY_OPEN, DELIVERY_CLICK, DELIVERY_COMPLAINT
- **MetricDimensionName enum**: EMAIL_IDENTITY, CONFIGURATION_SET, ISP
- **Response**:
  ```typescript
  {
    Results?: MetricDataResult[];  // { Id, Timestamps: Date[], Values: number[] }
    Errors?: MetricDataError[];    // { Id, Code: "INTERNAL_FAILURE"|"ACCESS_DENIED", Message }
  }
  ```
- **Data granularity**: Daily buckets
- **Retention**: 60 days — queries beyond this return empty results
- **Rate limits**: 16 requests/second, 160 queries/second cumulative
- **VDM requirement**: Account must have VDM enabled for metrics to be collected
- **Key semantics**:
  - SEND = emails eligible for VDM tracking (excludes mailbox simulator/multi-recipient)
  - PERMANENT_BOUNCE = hard bounces (non-existent mailboxes)
  - TRANSIENT_BOUNCE = soft bounces (delivery failures, NOT non-existent)
  - DELIVERY_OPEN/DELIVERY_CLICK/DELIVERY_COMPLAINT = denominator metrics for rate calculation
