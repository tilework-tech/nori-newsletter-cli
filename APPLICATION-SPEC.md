# SES v2 Capabilities Not Exposed in This CLI

The CLI uses 7 of ~97 SES v2 API operations. The gaps below are ordered by relevance to a newsletter use case.

## Current CLI Coverage

| SES Command | CLI Command | Description |
|---|---|---|
| `CreateContactListCommand` | `nori-newsletter init` | Creates a contact list with one topic |
| `CreateContactCommand` | `nori-newsletter contacts add` / `contacts import` | Adds a contact with topic preference OPT_IN |
| `ListContactsCommand` | `nori-newsletter contacts list` | Paginated listing of OPT_IN contacts |
| `GetContactCommand` | *(implemented but unused)* | Retrieves a single contact |
| `DeleteContactCommand` | `nori-newsletter contacts remove` | Removes a contact |
| `SendEmailCommand` | `nori-newsletter send` | Sends HTML email with ListManagementOptions |
| `GetAccountCommand` | `nori-newsletter send` (internal) | Reads MaxSendRate for throttling |

## Tier 1: Directly Relevant to Newsletter Operations

### 1. Unsubscribe Visibility

The CLI sends with `ListManagementOptions`, so SES manages unsubscribes automatically — but there is no command to see who has unsubscribed. `ListContacts` with `FilteredStatus: "OPT_OUT"` would show this. `GetContact` is already implemented in `SesService` but unused by any command.

**SES APIs:**
- `ListContacts` (with `FilteredStatus: "OPT_OUT"`) — list all unsubscribed contacts
- `GetContact` — check a specific contact's subscription status and topic preferences
- `UpdateContact` — resubscribe a contact or update topic preferences

### 2. Account-Level Suppression List

SES automatically suppresses addresses that hard-bounce or generate complaints. The CLI has zero visibility into this.

**SES APIs:**
- `ListSuppressedDestinations` — list all bounced/complained addresses, filterable by reason (BOUNCE/COMPLAINT) and date range
- `GetSuppressedDestination` — check if a specific address is suppressed, includes the FeedbackId/MessageId of the triggering event
- `DeleteSuppressedDestination` — un-suppress an address
- `PutSuppressedDestination` — manually suppress an address
- `PutAccountSuppressionAttributes` — enable/disable suppression for BOUNCE and/or COMPLAINT reasons

### 3. Contact Updates

No `UpdateContact` command exists. A contact's attributes or subscription status cannot be changed without delete + re-add.

**SES APIs:**
- `UpdateContact` — update topic preferences, UnsubscribeAll flag, or AttributesData

### 4. Contact List Management

The CLI can create a list (`init`) but cannot list all contact lists, view list details, update list metadata/topics, or delete a list.

**SES APIs:**
- `ListContactLists` — list all contact lists in the account
- `GetContactList` — get metadata about a specific contact list (topics, description, tags)
- `UpdateContactList` — update contact list metadata or topics
- `DeleteContactList` — delete a contact list and all its contacts

### 5. Sending Statistics and Metrics

`GetAccount` is already called for rate throttling but does not surface quota usage (`SentLast24Hours` / `Max24HourSend`). No access to delivery/engagement metrics.

**SES APIs:**
- `BatchGetMetricData` — send/bounce/complaint/open/click rates over time, filterable by identity, config set, ISP. 60-day retention.
- `GetDomainStatisticsReport` — domain-level delivery and engagement statistics over a time period
- `GetMessageInsights` — per-message delivery/engagement details (recipient, events, status)
- `GetAccount` (expanded usage) — expose `SentLast24Hours`, `Max24HourSend`, enforcement status

## Tier 2: Useful but Not Core to Basic Newsletter Workflow

### 6. Email Templates

Reusable templates with personalization variables instead of raw HTML files.

**SES APIs:**
- `CreateEmailTemplate` — create a template with HTML, text, and subject containing personalization tags
- `GetEmailTemplate` — retrieve a template by name
- `ListEmailTemplates` — list all templates
- `UpdateEmailTemplate` — update an existing template
- `DeleteEmailTemplate` — delete a template
- `TestRenderEmailTemplate` — render a template with test data to preview output

### 7. Bulk Send

`SendBulkEmail` sends templated emails to multiple recipients in one API call with per-recipient replacement data. The CLI currently loops `SendEmail` one at a time.

**SES APIs:**
- `SendBulkEmail` — send to multiple recipients in a single call using a template with per-recipient replacement data

### 8. Identity and Domain Management

The CLI assumes the `fromAddress` is pre-verified in SES. There are no commands for managing identities.

**SES APIs:**
- `CreateEmailIdentity` — verify a new email address or domain (starts DKIM/verification process)
- `GetEmailIdentity` — get verification status, DKIM config, MAIL FROM attributes
- `ListEmailIdentities` — list all verified identities
- `DeleteEmailIdentity` — delete an identity
- `PutEmailIdentityDkimAttributes` — enable/disable DKIM signing
- `PutEmailIdentityDkimSigningAttributes` — configure Easy DKIM or BYODKIM
- `PutEmailIdentityMailFromAttributes` — set custom MAIL FROM domain
- `PutEmailIdentityFeedbackAttributes` — configure bounce/complaint forwarding via email

### 9. Configuration Sets and Event Destinations

Track opens, clicks, bounces, complaints, and delivery via SNS/EventBridge/CloudWatch/Kinesis Firehose. The `SUBSCRIPTION` event type fires on unsubscribes specifically.

**SES APIs:**
- `CreateConfigurationSet` — create a config set with delivery, reputation, sending, suppression, tracking, and VDM options
- `GetConfigurationSet` / `ListConfigurationSets` / `DeleteConfigurationSet`
- `CreateConfigurationSetEventDestination` — route events (SEND, BOUNCE, COMPLAINT, DELIVERY, OPEN, CLICK, SUBSCRIPTION, etc.) to SNS, EventBridge, CloudWatch, or Kinesis Firehose
- `GetConfigurationSetEventDestinations` / `UpdateConfigurationSetEventDestination` / `DeleteConfigurationSetEventDestination`

### 10. Email Address Validation

Pre-send validation to reduce bounces.

**SES APIs:**
- `GetEmailAddressInsights` — syntax check, DNS check, mailbox existence. Returns confidence verdict (HIGH/MEDIUM/LOW).

### 11. Bulk Import/Export via S3

Import contacts or suppression entries from S3 at scale instead of the current CSV-row-by-row loop.

**SES APIs:**
- `CreateImportJob` — bulk import contacts to a contact list or bulk add/delete suppressed destinations from S3 (CSV or JSON). Contact limit: 500,000 per call. Suppression add limit: 100,000 per call.
- `GetImportJob` / `ListImportJobs` — monitor import job status
- `CreateExportJob` — export message insights or metrics data to S3
- `GetExportJob` / `ListExportJobs` — monitor export job status

## Notes

- **Email receiving/receipt rules are NOT in SES v2.** They remain exclusively in the SES v1 API (`@aws-sdk/client-ses`).
- **There is no "query bounces" API.** Bounce/complaint data must be captured in real-time via event destinations (SNS/EventBridge). The only historical record is the account suppression list.
- **Contact list topic limit:** 20 topics per contact list.
- **`ListContacts` filtering quirk:** `FilteredStatus=OPT_OUT` may return empty results in some cases. The `UseDefaultIfPreferenceUnavailable` filter parameter controls whether contacts without an explicit topic preference are included based on the topic's default subscription status.
