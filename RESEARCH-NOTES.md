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

## Email Template APIs

### API Commands and Types

#### CreateEmailTemplateCommand
- Params: `TemplateName` (required), `TemplateContent` (required), `Tags?`
- `EmailTemplateContent`: `{ Subject?: string, Text?: string, Html?: string }` — all three fields optional
- Response is empty `{}`
- Throws `AlreadyExistsException` if template name already exists
- Throws `LimitExceededException` if 20,000 template limit reached
- Rate limit: 1 req/sec

#### GetEmailTemplateCommand
- Params: `TemplateName` (required)
- Response: `{ TemplateName, TemplateContent: EmailTemplateContent, Tags? }`
- Throws `NotFoundException` if template does not exist
- Rate limit: 50 req/sec (higher than other template operations)

#### ListEmailTemplatesCommand
- Params: `NextToken?`, `PageSize?` (1-100)
- Response: `{ TemplatesMetadata?: EmailTemplateMetadata[], NextToken? }`
- `EmailTemplateMetadata`: `{ TemplateName?, CreatedTimestamp? }` — sparse, no content
- Must call GetEmailTemplate per template for full content
- Rate limit: 1 req/sec
- SDK exports `paginateListEmailTemplates` but we use manual pagination for consistency

#### UpdateEmailTemplateCommand
- Params: `TemplateName` (required), `TemplateContent` (required)
- **FULL REPLACEMENT** — omitted fields in TemplateContent are cleared
- Pattern: GET first, modify in memory, PUT back (same as UpdateContact/UpdateContactList)
- No Tags field on update (unlike Create)
- Throws `NotFoundException`
- Rate limit: 1 req/sec

#### DeleteEmailTemplateCommand
- Params: `TemplateName` (required)
- Throws `NotFoundException` if template does not exist (unlike some AWS delete operations)
- Rate limit: 1 req/sec

#### TestRenderEmailTemplateCommand
- Params: `TemplateName` (required), `TemplateData` (required, JSON string, max 256 KB)
- `TemplateData` is a **JSON string**, not an object — must `JSON.stringify()` before passing
- Response: `{ RenderedTemplate }` — returns a **complete MIME message**, not just rendered HTML
- MIME message includes headers, boundaries, and base64-encoded content parts
- Throws `NotFoundException` if template does not exist
- Throws `BadRequestException` if template data is invalid or missing required variables
- Rate limit: 1 req/sec

### Template Variable Syntax
- Uses **Handlebars double-curly syntax**: `{{variableName}}`
- **Case sensitive**: `{{Name}}` and `{{name}}` are different
- Stored templates support full Handlebars: `{{#if}}`, `{{#each}}`, nested paths (`{{contact.firstName}}`), inline partials
- Inline templates (in SendEmail) only support simple substitution

### Key Quirks
- **SES v2 field names differ from v1**: v2 uses `Subject`, `Html`, `Text`; v1 uses `SubjectPart`, `HtmlPart`, `TextPart`
- **Missing variables cause SILENT send failures**: API returns messageId but email never delivers. Only detectable via SNS Rendering Failure events
- **Extra variables are silently ignored**: Including unused variables in TemplateData is fine
- **No HTML escaping**: SES does not escape user-provided data in templates — must escape client-side
- **20,000 templates per region** (not adjustable)
- **500 KB max per template** (not adjustable)
- **TestRenderEmailTemplate returns MIME**: Need to extract HTML content from MIME boundaries for preview

## SendBulkEmail API

### API Command and Types
- `SendBulkEmailCommand` from `@aws-sdk/client-sesv2`
- **Required params**: `DefaultContent` (template reference or inline content), `BulkEmailEntries` (array of recipients)
- **Optional**: `FromEmailAddress`, `ReplyToAddresses`, `FeedbackForwardingEmailAddress`, `DefaultEmailTags`, `ConfigurationSetName`

### Request Shape
```typescript
{
  DefaultContent: {
    Template: {
      TemplateName?: string;       // stored template reference
      TemplateArn?: string;        // alternative to TemplateName
      TemplateContent?: {          // inline template (simple substitutions only)
        Subject?: string;
        Html?: string;
        Text?: string;
      };
      TemplateData?: string;       // default replacement JSON string
    }
  },
  BulkEmailEntries: [{
    Destination: {                 // REQUIRED
      ToAddresses?: string[];
      CcAddresses?: string[];
      BccAddresses?: string[];
    };
    ReplacementEmailContent?: {
      ReplacementTemplate?: {
        ReplacementTemplateData?: string;  // per-recipient JSON, max 262144 chars
      }
    };
    ReplacementTags?: MessageTag[];
    ReplacementHeaders?: MessageHeader[];  // max 15 per entry
  }]
}
```

### Response Shape
```typescript
{
  BulkEmailEntryResults?: [{
    Status?: BulkEmailStatus;  // SUCCESS, MESSAGE_REJECTED, ACCOUNT_THROTTLED, etc.
    Error?: string;            // detail on failure
    MessageId?: string;        // only populated on SUCCESS
  }]
}
```

### BulkEmailStatus Values (14 total)
SUCCESS, MESSAGE_REJECTED, MAIL_FROM_DOMAIN_NOT_VERIFIED, CONFIGURATION_SET_NOT_FOUND, TEMPLATE_NOT_FOUND, ACCOUNT_SUSPENDED, ACCOUNT_THROTTLED, ACCOUNT_DAILY_QUOTA_EXCEEDED, INVALID_SENDING_POOL_NAME, ACCOUNT_SENDING_PAUSED, CONFIGURATION_SET_SENDING_PAUSED, INVALID_PARAMETER, TRANSIENT_FAILURE, FAILED

### Limits
- **Max destinations per call**: 50 (hard limit, not adjustable)
- **Each recipient counts individually** against sending quota
- **Sending rate**: Per-recipient, same as SendEmail (sandbox: 1/sec, production varies)
- **ReplacementTemplateData**: max 262,144 characters per entry
- **ReplacementHeaders**: max 15 per entry

### Critical Limitation: No ListManagementOptions
- `ListManagementOptions` is **NOT available** on `SendBulkEmail` — only on `SendEmail`
- This means no automatic unsubscribe link management, no `{{amazonSESUnsubscribeUrl}}`, no automatic contact preference updates
- GitHub issue aws-sdk-js-v3 #5495 closed as "not planned"
- Workaround: fetch contacts separately via `ListContacts`, filter by subscription status, send via bulk without unsubscribe management

### Template Data Merge Semantics
- `DefaultContent.Template.TemplateData` provides defaults
- `ReplacementTemplateData` is a **full replacement, NOT a merge** of keys
- If recipient provides partial keys, missing keys render as empty — they do NOT fall back to defaults
- Fallback to `TemplateData` only happens when `ReplacementTemplateData` is `"{}"` or omitted entirely

### Inline vs Stored Templates
- Stored templates (`TemplateName`): support full Handlebars (`{{#if}}`, `{{#each}}`, nested paths)
- Inline templates (`TemplateContent`): only simple `{{variable}}` substitution
- Cannot use both simultaneously

### Error Handling
- HTTP 200 even when individual entries fail — partial success/failure
- One `BulkEmailEntryResult` per `BulkEmailEntry` in same order
- Retriable statuses: `ACCOUNT_THROTTLED`, `TRANSIENT_FAILURE`, `FAILED`
- Permanent failures: `MESSAGE_REJECTED`, `ACCOUNT_SUSPENDED`, etc.
- Batch-level HTTP errors (400/404/429) indicate entire call failed before processing

### Key Quirks
- No ListManagementOptions — biggest gap vs SendEmail
- Rendering failures are silent (SES accepts but email never delivers)
- Rate limiting is per-recipient within a batch — a batch of 50 can partially throttle
- Inline templates don't support Handlebars conditionals/loops

## Configuration Set and Event Destination APIs

### Configuration Set Commands
- `CreateConfigurationSetCommand` — params: `ConfigurationSetName` (required, max 64 chars alphanumeric/hyphens/underscores), `DeliveryOptions?`, `ReputationOptions?`, `SendingOptions?`, `SuppressionOptions?`, `TrackingOptions?`, `VdmOptions?`, `Tags?`
- Response: empty `{}`
- Errors: `AlreadyExistsException`, `LimitExceededException` (10,000 per region max), `ConcurrentModificationException`
- `GetConfigurationSetCommand` — param: `ConfigurationSetName` (required)
- Returns: all fields from create (ConfigurationSetName, DeliveryOptions, ReputationOptions, SendingOptions, SuppressionOptions, TrackingOptions, VdmOptions, Tags)
- Errors: `NotFoundException`
- `ListConfigurationSetsCommand` — params: `NextToken?`, `PageSize?`
- Response: `{ ConfigurationSets?: string[], NextToken? }` — returns only names, not full objects
- Must call GetConfigurationSet per name for details
- `DeleteConfigurationSetCommand` — param: `ConfigurationSetName` (required)
- Errors: `NotFoundException`, `ConcurrentModificationException`

### Event Destination Commands
- `CreateConfigurationSetEventDestinationCommand` — params: `ConfigurationSetName` (required, path), `EventDestinationName` (required), `EventDestination` (required, EventDestinationDefinition)
- Max 10 event destinations per config set
- Errors: `AlreadyExistsException`, `LimitExceededException`, `NotFoundException` (config set)
- `GetConfigurationSetEventDestinationsCommand` — param: `ConfigurationSetName`
- Response: `{ EventDestinations?: EventDestination[] }` — NO pagination, all destinations returned at once (max 10)
- `UpdateConfigurationSetEventDestinationCommand` — params: `ConfigurationSetName`, `EventDestinationName` (both path params), `EventDestination` (body)
- **FULL REPLACEMENT** — must re-specify all fields
- Cannot rename an event destination
- `DeleteConfigurationSetEventDestinationCommand` — params: `ConfigurationSetName`, `EventDestinationName`
- Errors: `NotFoundException`

### EventDestinationDefinition (write type)
```typescript
interface EventDestinationDefinition {
  Enabled?: boolean;
  MatchingEventTypes?: EventType[];
  KinesisFirehoseDestination?: { DeliveryStreamArn: string; IamRoleArn: string };
  CloudWatchDestination?: { DimensionConfigurations: CloudWatchDimensionConfiguration[] };
  SnsDestination?: { TopicArn: string };
  EventBridgeDestination?: { EventBusArn: string };
}
```

### EventType Enum
SEND, REJECT, BOUNCE, COMPLAINT, DELIVERY, OPEN, CLICK, RENDERING_FAILURE, DELIVERY_DELAY, SUBSCRIPTION

### Destination Types
- **SNS**: `{ TopicArn: string }` — simplest, just an ARN
- **EventBridge**: `{ EventBusArn: string }` — just the bus ARN
- **CloudWatch**: `{ DimensionConfigurations: [{ DimensionName, DimensionValueSource, DefaultDimensionValue }] }`
  - DimensionValueSource: MESSAGE_TAG | EMAIL_HEADER | LINK_TAG
  - Max 10 dimensions per destination
- **Kinesis Firehose**: `{ DeliveryStreamArn: string, IamRoleArn: string }` — needs both stream and role

### Configuration Set Options Types
- `DeliveryOptions`: `{ TlsPolicy?: "REQUIRE"|"OPTIONAL", SendingPoolName?: string, MaxDeliverySeconds?: number }`
- `ReputationOptions`: `{ ReputationMetricsEnabled?: boolean, LastFreshStart?: Date }`
- `SendingOptions`: `{ SendingEnabled?: boolean }`
- `SuppressionOptions`: `{ SuppressedReasons?: ("BOUNCE"|"COMPLAINT")[] }`
- `TrackingOptions`: `{ CustomRedirectDomain: string, HttpsPolicy?: "REQUIRE"|"REQUIRE_OPEN_ONLY"|"OPTIONAL" }`
  - CustomRedirectDomain is REQUIRED if TrackingOptions is provided at all
- `VdmOptions`: `{ DashboardOptions?: { EngagementMetrics?: "ENABLED"|"DISABLED" }, GuardianOptions?: { OptimizedSharedDelivery?: "ENABLED"|"DISABLED" } }`

### Key Quirks
- ListConfigurationSets returns only names — N+1 calls needed for details
- Only ONE destination type per event destination — use multiple destinations to fan out
- UpdateConfigurationSetEventDestination is full replacement (HTTP PUT)
- API rate limit: 1 req/sec for all management operations
- TrackingOptions.CustomRedirectDomain is required if TrackingOptions is included at all
- OPEN/CLICK tracking requires VDM DashboardOptions or TrackingOptions to inject tracking pixels/link rewriting

## Identity and Domain Management APIs

### CreateEmailIdentityCommand
- Params: `EmailIdentity` (required — email address or domain), `Tags?`, `DkimSigningAttributes?`, `ConfigurationSetName?`
- `DkimSigningAttributes` can only be specified for domains, not email addresses
- Response: `{ IdentityType?, VerifiedForSendingStatus?, DkimAttributes? }`
- For **email addresses**: SES sends verification email with a link (expires 24h). `DkimAttributes` is empty. `VerifiedForSendingStatus` = false until clicked.
- For **domains**: SES returns DKIM tokens in `DkimAttributes.Tokens` (3 tokens for Easy DKIM). Must add CNAME records to DNS. SES polls for 72h.
- Throws `AlreadyExistsException` if identity already exists (NOT idempotent)
- Throws `LimitExceededException` (max 10,000 identities per region)

### GetEmailIdentityCommand
- Params: `EmailIdentity` (required)
- Response fields: `IdentityType`, `FeedbackForwardingStatus`, `VerifiedForSendingStatus`, `DkimAttributes`, `MailFromAttributes`, `Policies`, `Tags`, `ConfigurationSetName`, `VerificationStatus`, `VerificationInfo`
- Throws `NotFoundException` if identity does not exist

### ListEmailIdentitiesCommand
- Params: `NextToken?`, `PageSize?` (0-1000)
- Response: `{ EmailIdentities?: IdentityInfo[], NextToken? }`
- `IdentityInfo`: `{ IdentityType?, IdentityName?, SendingEnabled?, VerificationStatus? }` — sparse, no DKIM/MailFrom details
- Returns both verified AND unverified identities
- No `NotFoundException` — returns empty array when no identities exist

### DeleteEmailIdentityCommand
- Params: `EmailIdentity` (required)
- Empty response on success
- Throws `NotFoundException` if identity does not exist (NOT idempotent)

### DkimAttributes Type
```typescript
interface DkimAttributes {
  SigningEnabled?: boolean;
  Status?: DkimStatus;                    // PENDING | SUCCESS | FAILED | TEMPORARY_FAILURE | NOT_STARTED
  Tokens?: string[];                      // 3 tokens for Easy DKIM, selector for BYODKIM
  SigningHostedZone?: string;             // DNS zone for CNAME records
  SigningAttributesOrigin?: string;       // AWS_SES | EXTERNAL | regional AWS_SES_* values
  NextSigningKeyLength?: string;          // RSA_1024_BIT | RSA_2048_BIT
  CurrentSigningKeyLength?: string;
  LastKeyGenerationTimestamp?: Date;
}
```

### MailFromAttributes Type
```typescript
interface MailFromAttributes {
  MailFromDomain: string;                 // Must be subdomain of identity
  MailFromDomainStatus: string;           // PENDING | SUCCESS | FAILED | TEMPORARY_FAILURE (no NOT_STARTED)
  BehaviorOnMxFailure: string;            // USE_DEFAULT_VALUE | REJECT_MESSAGE
}
```

### Enum Values
- `IdentityType`: EMAIL_ADDRESS | DOMAIN | MANAGED_DOMAIN (MANAGED_DOMAIN is not supported/usable)
- `VerificationStatus`: PENDING | SUCCESS | FAILED | TEMPORARY_FAILURE | NOT_STARTED
- `DkimStatus`: PENDING | SUCCESS | FAILED | TEMPORARY_FAILURE | NOT_STARTED
- `DkimSigningKeyLength`: RSA_1024_BIT | RSA_2048_BIT
- `MailFromDomainStatus`: PENDING | SUCCESS | FAILED | TEMPORARY_FAILURE

### Key Quirks
- **Email vs domain verification flows differ completely**: email uses link clicks, domain uses DNS CNAME records
- **No re-send verification API**: must delete and re-create identity to trigger new verification email
- **Domain verification inherits to emails**: when a domain is verified, email addresses on that domain can send without separate verification
- **DKIM tokens create CNAME records**: format is `{token}._domainkey.yourdomain.com` → `{token}.{SigningHostedZone}`
- **API rate limit**: 1 request/second for all identity operations (not adjustable)
- **Max 10,000 identities per region**: email addresses + domains combined
- **VerifiedForSendingStatus vs VerificationStatus**: `VerifiedForSendingStatus` is a boolean (can send right now?), `VerificationStatus` is an enum (PENDING/SUCCESS/FAILED/etc.)
- **CreateEmailIdentity response is sparse**: only IdentityType, VerifiedForSendingStatus, DkimAttributes. Must call GetEmailIdentity for full details.

## Email Address Validation API

### GetEmailAddressInsightsCommand
- Available in `@aws-sdk/client-sesv2` v3.1045.0 (installed)
- Endpoint: `POST /v2/email/email-address-insights/`
- Request: `{ EmailAddress: string }` — single address only, no batch endpoint
- Response: `{ MailboxValidation?: { IsValid?: Verdict, Evaluations?: Evaluations } }`
- Errors: `BadRequestException` (400), `TooManyRequestsException` (429)

### TypeScript Types
```typescript
type EmailAddressInsightsConfidenceVerdict = "HIGH" | "MEDIUM" | "LOW";

interface EmailAddressInsightsVerdict {
  ConfidenceVerdict?: EmailAddressInsightsConfidenceVerdict;
}

interface EmailAddressInsightsMailboxEvaluations {
  HasValidSyntax?: EmailAddressInsightsVerdict;
  HasValidDnsRecords?: EmailAddressInsightsVerdict;
  MailboxExists?: EmailAddressInsightsVerdict;
  IsRoleAddress?: EmailAddressInsightsVerdict;
  IsDisposable?: EmailAddressInsightsVerdict;
  IsRandomInput?: EmailAddressInsightsVerdict;
}

interface MailboxValidation {
  IsValid?: EmailAddressInsightsVerdict;
  Evaluations?: EmailAddressInsightsMailboxEvaluations;
}
```

### Six Evaluation Checks
1. **HasValidSyntax** — RFC standards and valid character check
2. **HasValidDnsRecords** — domain exists with valid DNS, configured for email
3. **MailboxExists** — mailbox exists and can receive messages (without sending)
4. **IsRoleAddress** — role-based addresses (admin@, support@, info@)
5. **IsDisposable** — disposable/temporary email addresses
6. **IsRandomInput** — random text detection

### Verdict Semantics (CRITICAL)
- For `IsValid`: HIGH = good (high delivery likelihood), LOW = bad
- For risk checks (`IsRoleAddress`, `IsDisposable`, `IsRandomInput`): HIGH = bad (strong indication flag is true), LOW = good
- The semantics of HIGH/LOW are **inverted** between IsValid and risk checks

### Pricing
- $0.01 per API validation call
- No free tier for validation
- Auto Validation (send-time alternative): $0.01 per 1,000 — 100x cheaper but only at send time

### Rate Limits
- General SES API quota: 1 req/s for non-send operations (likely applies)
- Not explicitly documented for this endpoint
- Returns `TooManyRequestsException` (429) when throttled
- Not adjustable

### Key Quirks
- No batch endpoint — must iterate one address at a time with throttle handling
- All response fields are optional (`?`) — must handle undefined throughout
- At 1 req/s + $0.01/call, validating 10,000 addresses = ~2.8 hours and $100
- Feature announced December 2025 — may not be available in all regions
- Sandbox availability: not explicitly documented, but likely works (validation doesn't send email)
- IAM permissions needed: `ses:GetEmailAddressInsights` and `iam:CreateServiceLinkedRole`

## High-Level Abstraction Features Research

### Suppression List / Contact List Overlap Problem
- SES treats suppression lists and contact lists as entirely separate systems — no cross-referencing API exists
- Sending to a suppressed address: SES **accepts** the message (HTTP 200, returns MessageId), but **does not send** it
- **Counts toward daily quota** but does NOT count toward bounce/complaint reputation metrics
- A bounce event IS generated with `bounceSubType: "OnAccountSuppressionList"` (only if event destinations are configured)
- **Case sensitivity mismatch**: Suppression list lookups are case-sensitive (`User@Example.com` ≠ `user@example.com`) but email sending is case-insensitive. Must normalize case for cross-referencing.
- Cross-referencing approach: Paginate `ListSuppressedDestinations`, build a Set (lowercased), then compare against contacts (lowercased)
- Only hard bounces trigger automatic suppression; soft bounces do not
- Gmail does NOT report complaints to SES — major blind spot

### Pre-Send Validation Checks
- `GetAccount`: check `SendingEnabled`, `ProductionAccessEnabled`, `EnforcementStatus`, quota headroom (`Max24HourSend - SentLast24Hours`)
- `GetEmailIdentity(fromAddress)`: check `VerifiedForSendingStatus` (boolean) and `VerificationStatus` (enum)
- `TestRenderEmailTemplate`: catches missing variables before send — critical because SES returns a MessageId for template render failures but never delivers
- Template variables: No API to introspect required variables. Must use `TestRenderEmailTemplate` with sample data to discover missing fields via error.
- Sandbox mode: can only send to verified addresses, max 200/day, 1/sec. CLI should warn loudly.

### Contact List Aggregate Statistics
- **No aggregate statistics API** for contact lists. `GetContactList` returns only metadata (name, timestamps, topics, tags)
- Must paginate `ListContacts` to count contacts — no total count in response
- Feature request filed and closed without resolution
- Can filter by `FilteredStatus` (OPT_IN/OPT_OUT) and `TopicFilter` on `ListContacts`

### Health Dashboard Metrics
- `GetAccount`: sending quota, enforcement status, production/sandbox mode, sending enabled
- `BatchGetMetricData` (requires VDM): SEND, DELIVERY, PERMANENT_BOUNCE, COMPLAINT rates over time
- Industry thresholds: bounce rate < 5%, complaint rate < 0.1%, delivery rate > 95%
- VDM only tracks metrics from single-recipient emails; multi-recipient excluded
- Apple Mail Privacy Protection inflates open rates

### Cleanup Best Practices
- AWS recommends **removing** bounced addresses entirely (hard bounces)
- For complaints: AWS recommends not re-sending, use `UnsubscribeAll: true` or `OPT_OUT` to preserve contact record
- Account suppression list is a safety net, not a replacement for list hygiene
- Two strategies: `DeleteContact` for hard bounces, `UpdateContact` with `UnsubscribeAll: true` for complaints
- No event for "added to suppression list" — must infer from BOUNCE/COMPLAINT events

### Setup Command Research

#### SES Setup Order of Operations
1. Create configuration set (must exist before assigning to identity)
2. Add event destination to config set (at minimum: bounces, complaints)
3. Verify from-address identity (email or domain)
4. Create contact list with topic
5. Check account status (sandbox/production, sending enabled)

#### Idempotency Requirements
- All create operations should check-then-create: use `getIdentity`/`getContactList`/`getConfigSet` to check existence before `createIdentity`/`createContactList`/`createConfigSet`
- Alternative: call create and catch `AlreadyExistsException` (existing `init` pattern)
- For setup check: use the get methods to verify existence and status without creating

#### Existing SesService Methods Available (No New Methods Needed)
- `getAccountInfo()` — account status, quotas, sandbox/production
- `createIdentity(identity)` / `getIdentity(identity)` — identity lifecycle
- `createContactList(name, topicName)` / `getContactList(name)` — contact list lifecycle
- `extractEmail(fromAddress)` — extracts bare email from "Name <email>" format

#### CLI Design Constraints (Agentic CLI)
- No interactivity — all parameters via flags
- No colors/spinners — plain text output
- Single-shot commands — no wizards or multi-step prompts
- Clear error messages with context

#### Design Decision: check/run Subcommand Pattern
- Follows existing `cleanup report`/`cleanup run` pattern in codebase
- `setup check` = read-only audit (like `cleanup report`)
- `setup run` = create missing infrastructure (like `cleanup run`)
- Separating check from run gives agents control over when to create resources

#### What Setup Does NOT Do
- Does not request production access (requires manual AWS review)
- Does not create DNS records (DKIM, SPF, DMARC are DNS-only)
- Does not create event destinations (requires destination-specific config: SNS ARN, EventBridge ARN, etc.)
- Does not wait for identity verification (DNS propagation takes up to 72 hours)

## Bulk Import/Export Job APIs

### CreateImportJob
- Endpoint: `POST /v2/email/import-jobs`
- Two import destination types: `SuppressionListDestination` or `ContactListDestination` (mutually exclusive)
- Data source: S3 URL (`s3://<bucket>/<object>`), supports `CSV` or `JSON` DataFormat
- Response: `{ JobId: string }`
- Max 20 concurrent import jobs
- S3 bucket must be in same AWS region as SES
- Requires production access (not sandbox)
- SES needs `s3:GetObject` permission on the bucket via bucket policy

### Import Destination Types
```typescript
interface ImportDestination {
  SuppressionListDestination?: { SuppressionListImportAction: "PUT" | "DELETE" };
  ContactListDestination?: { ContactListName: string; ContactListImportAction: "PUT" | "DELETE" };
}
```
- `PUT` = add/upsert, `DELETE` = remove

### Import CSV Formats
**Suppression list PUT** (no header row):
```
recipient1@example.com,BOUNCE
recipient2@example.com,COMPLAINT
```

**Suppression list DELETE** (no header row, email only):
```
recipient3@example.com
```

**Contact list PUT** (requires header row):
```
emailAddress,unsubscribeAll,attributesData,topicPreferences.Sports
example1@amazon.com,false,{"Name": "John"},OPT_IN
```

**Contact list JSON** (newline-delimited):
```json
{"emailAddress":"example1@amazon.com","unsubscribeAll":false,"topicPreferences":[{"topicName":"Sports","subscriptionStatus":"OPT_IN"}]}
```

### Import Record Limits
- Suppression PUT: max 100,000 per S3 object
- Suppression DELETE: max 10,000 per S3 object
- Contact list PUT: max 1,000,000 per import job

### GetImportJob
- Returns: JobId, ImportDestination, ImportDataSource, FailureInfo, JobStatus, CreatedTimestamp, CompletedTimestamp, ProcessedRecordsCount, FailedRecordsCount
- `FailureInfo`: `{ FailedRecordsS3Url?: string; ErrorMessage?: string }` — pre-signed URL to failed records
- Bad records don't fail the job — it completes with `FailedRecordsCount > 0`

### ListImportJobs
- Filterable by `ImportDestinationType`: `"SUPPRESSION_LIST"` or `"CONTACT_LIST"`
- Standard token-based pagination
- Returns `ImportJobSummary[]`: JobId, ImportDestination, JobStatus, CreatedTimestamp, ProcessedRecordsCount, FailedRecordsCount

### JobStatus Enum
- Values: `CREATED`, `PROCESSING`, `COMPLETED`, `FAILED`, `CANCELLED`
- Shared between import and export jobs

### CreateExportJob
- Two mutually exclusive data sources: `MetricsDataSource` or `MessageInsightsDataSource`
- `MetricsDataSource`: requires VDM, supports SEND/DELIVERY/BOUNCE/COMPLAINT/OPEN/CLICK metrics with VOLUME or RATE aggregation, filterable by EMAIL_IDENTITY/CONFIGURATION_SET/ISP dimensions
- `MessageInsightsDataSource`: per-message tracking, filterable by from address, destination, subject, ISP, delivery events, engagement events. Max 10,000 results.
- `ExportDestination`: `{ DataFormat: "CSV" | "JSON", S3Url?: string }` — S3Url is populated by AWS in the response (pre-signed URL, expires 5 min but refreshable via GetExportJob)
- Rate limit: 1 req/sec

### GetExportJob / ListExportJobs
- `GetExportJob`: returns JobId, ExportSourceType, JobStatus, ExportDestination (with S3Url), ExportDataSource, timestamps, FailureInfo, Statistics (ProcessedRecordsCount, ExportedRecordsCount)
- `ListExportJobs`: filterable by both `ExportSourceType` ("METRICS_DATA" | "MESSAGE_INSIGHTS") and `JobStatus`
- Standard pagination

### Key Quirks
- Export pre-signed URL expires after 5 minutes — can be refreshed by calling GetExportJob again
- No batch import validation — bad records silently fail, check FailedRecordsCount after completion
- S3 bucket policy must grant `ses.amazonaws.com` GetObject permission
- Import jobs require production access (sandbox can't use them)
- AWS SDK enum inconsistency: docs mention `ERROR` but actual enum has `FAILED`

## Reputation Monitoring Research

### AWS SES Enforcement Thresholds (Official)

**Bounce Rate:**
- Below 2%: AWS-recommended best practice
- 5% or greater: Account automatically placed **under review** (PROBATION)
- 10% or greater: AWS **may pause** sending ability (SHUTDOWN)
- Only hard bounces to non-verified domains count

**Complaint Rate:**
- Below 0.1%: AWS-recommended best practice
- 0.1% or greater: Account automatically placed **under review** (PROBATION)
- 0.5% or greater: AWS **may pause** sending ability (SHUTDOWN)
- Only calculated on mail to domains with feedback loop (FBL) support

**Industry/Gmail thresholds (stricter than AWS):**
- Gmail spam complaint rate must stay below 0.10%, never reach 0.30%
- Industry bounce: excellent <1%, acceptable 1-2%, concerning 2-5%, dangerous >5%

### Enforcement Progression
- HEALTHY → PROBATION (under review, can still send) → SHUTDOWN (sending paused)
- AWS can skip review and immediately pause for severe spamtrap problems
- Review period duration not publicly documented

### API Fields for Reputation Monitoring

**`GetAccount` response** (already wrapped as `getAccountInfo()`):
- `EnforcementStatus`: `HEALTHY`, `PROBATION`, `SHUTDOWN`
- `Details.ReviewDetails.Status`: review status
- `Details.ReviewDetails.CaseId`: AWS Support case ID
- `VdmAttributes.VdmEnabled`: whether VDM is enabled

**`BatchGetMetricData`** (already wrapped as `getMetrics()`):
- Returns raw counts, NO rate calculation
- Must compute rates manually: `bounce_rate = PERMANENT_BOUNCE / SEND`, `complaint_rate = COMPLAINT / SEND`
- VDM formula for complaint rate uses `COMPLAINT / DELIVERY` (not SEND)

**CloudWatch `AWS/SES` namespace** (not accessible via SES API):
- `Reputation.BounceRate` — percentage as decimal (0.05 = 5%)
- `Reputation.ComplaintRate` — percentage as decimal (0.001 = 0.1%)

### Threshold Summary for CLI Implementation

| Metric | OK (green) | WARN (yellow) | CRITICAL (red) |
|--------|-----------|---------------|----------------|
| Bounce Rate | < 2% | 2% - 5% | >= 5% |
| Complaint Rate | < 0.05% | 0.05% - 0.1% | >= 0.1% |
| Enforcement | HEALTHY | PROBATION | SHUTDOWN |
| Quota Usage | < 80% | 80% - 95% | >= 95% |

### Design Decision: No New SES API Methods Needed
- `getAccountInfo()` provides enforcement status, quota, sending enabled
- `getMetrics()` provides raw SEND/DELIVERY/PERMANENT_BOUNCE/COMPLAINT counts
- `listSuppressedDestinations()` provides suppression list for growth analysis
- Rate calculations done in command layer, not service layer
- Falls back gracefully when VDM not enabled (metrics will error/empty)

## Domain Check Command Research

### DNS Lookups via Node.js `dns.promises`
- `dns.promises.resolveMx(domain)` — returns `Array<{ priority: number, exchange: string }>`
- `dns.promises.resolveTxt(domain)` — returns `string[][]` (TXT records split into 255-byte chunks, must `.join('')` inner arrays)
- `dns.promises.resolveCname(domain)` — returns `string[]` of CNAME targets
- Error codes: `ENOTFOUND` (domain doesn't exist), `ENODATA` (domain exists but no records of this type), `ETIMEOUT`, `ESERVFAIL`
- Long TXT records are split across sub-array elements — always join before parsing
- `resolveCname` throws `ENODATA` if target has A record instead of CNAME
- DNS resolve methods do NOT read `/etc/hosts` — always query network

### SPF Record Format for SES
- TXT record on root domain: `v=spf1 include:amazonses.com ~all`
- Only ONE SPF TXT record per domain — multiple SPF records cause evaluation failures
- For custom MAIL FROM domain, SPF record goes on the MAIL FROM subdomain, not root
- Use `~all` (softfail) or `-all` (hardfail)

### DMARC Record Format
- TXT record at `_dmarc.{domain}`
- Minimal: `v=DMARC1; p=none;`
- Recommended: `v=DMARC1; p=quarantine; rua=mailto:dmarc@example.com;`
- Policy values: `none` (monitor), `quarantine` (spam folder), `reject` (block)
- DMARC passes if EITHER SPF or DKIM passes alignment

### DKIM DNS Records for SES
- 3 CNAME records: `{token}._domainkey.{domain}` → `{token}.dkim.amazonses.com`
- Some regions may use region-specific DKIM domains
- SES `getIdentity()` returns tokens and `hostedZone` (the CNAME target domain)
- Common misconfiguration: DNS provider appending apex domain to CNAME value

### MX Records
- NOT required on root domain for sending, but ARE required for custom MAIL FROM
- Custom MAIL FROM MX: `10 feedback-smtp.{region}.amazonses.com` on the MAIL FROM subdomain
- Some receiving servers check sender domain for MX records as deliverability heuristic

### Diagnostic Check Design
- **DKIM**: Look up each `{token}._domainkey.{domain}` CNAME, verify it points to `{token}.{hostedZone}`
- **SPF**: Look up TXT records on domain, find `v=spf1`, check for `include:amazonses.com`
- **DMARC**: Look up TXT on `_dmarc.{domain}`, check for `v=DMARC1`, report policy
- **MX**: Look up MX records on domain, report whether domain can receive mail
- **Identity**: Cross-reference with SES `getIdentity()` for verification and DKIM signing status
- Both domain identity and email identity should be checked (domain verification inherits to email addresses)

### Architecture Decision: DnsResolver Interface
- Create `DnsResolver` interface for testability
- Default implementation uses `dns.promises` from Node.js (no new dependencies)
- Pass through `createProgram` options parameter to `createDomainCheckCommand`
- Tests inject mock resolver via extended `runCommand` options parameter
- Backward-compatible: all existing code paths unaffected

## Audit Command Research

### Design Rationale
- No SES-specific open-source CLI audit tool exists — this is an unserved niche
- Current CLI requires running 4-5 separate commands (health, reputation, domain-check, setup check, cleanup report) to understand account readiness
- Single unified command enables CI/CD integration and agentic usage

### Checks to Include (from AWS Pre-Send Checklist)
1. **Account**: sending enabled, enforcement status, production/sandbox, quota usage
2. **Identity**: from-address verified, DKIM signing status
3. **DNS**: SPF record with amazonses.com, DMARC record, DKIM CNAME records, MX records
4. **Reputation**: bounce rate vs AWS thresholds (<2% OK, 2-5% WARN, >=5% CRITICAL), complaint rate (<0.05% OK, 0.05-0.1% WARN, >=0.1% CRITICAL)
5. **Contacts**: subscribed count, suppression list overlap
6. **Contact list**: exists and has correct topic configured

### Architecture Decisions
- Composes existing SesService methods — no new service methods needed
- Requires DnsResolver (same pattern as domain-check)
- Uses `[PASS]`/`[WARN]`/`[FAIL]` status labels (matches preflight and domain-check patterns)
- Grouped into sections with `=== Section ===` headers (matches health and reputation patterns)
- Summary line at end with pass/warn/fail counts
- Exit code 1 if any FAIL, 0 otherwise (WARNs are non-blocking)
- Falls back gracefully when VDM not enabled (reputation section shows "Metrics unavailable")
- DNS failures reported as [FAIL] (timeouts) or [WARN] (missing optional records)

### Methods Composed (all existing)
- `getAccountInfo()` — account status, quotas
- `getIdentity(email)` — verification, DKIM, mail-from
- `getContactList(name)` — contact list existence
- `listContacts(name, topic)` — subscribed contacts
- `listSuppressedDestinations()` — suppressed addresses
- `getMetrics()` — VDM sending metrics (when available)
- DnsResolver: `resolveTxt`, `resolveCname`, `resolveMx` — DNS records
