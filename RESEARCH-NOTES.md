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
