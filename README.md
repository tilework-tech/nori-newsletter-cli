# nori-newsletter-cli

CLI for managing and sending newsletters via AWS SES. Handles subscriber management through SES contact lists, CSV import, and individual email sending with automatic unsubscribe support.

## Setup

```bash
npm install
npm run build
```

### AWS Credentials

Configure AWS credentials via environment variables or a `.env` file:

```
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_REGION=us-east-1
```

### Newsletter Configuration

Create a `newsletter.config.json` in your project root:

```json
{
  "contactListName": "my-newsletter",
  "topicName": "weekly-updates",
  "fromAddress": "My Newsletter <newsletter@example.com>",
  "replyTo": "reply@example.com"
}
```

See `newsletter.config.example.json` for a template.

## Usage

### Initialize the contact list

Creates the SES contact list and topic defined in your config:

```bash
nori-newsletter init
```

### Manage subscribers

```bash
nori-newsletter contacts add user@example.com
nori-newsletter contacts add user@example.com --name "Jane" --company "Acme"
nori-newsletter contacts import subscribers.csv
nori-newsletter contacts list
nori-newsletter contacts remove user@example.com
```

The CSV format expects columns: `email,name,company,added_date`.

### Send a newsletter

```bash
# Send to all subscribers
nori-newsletter send newsletter.html

# Test send to specific recipients
nori-newsletter send newsletter.html --test recipient@example.com

# Preview without sending
nori-newsletter send newsletter.html --dry-run
```

The subject line is extracted from the HTML `<title>` tag. If no title is found, the filename is used.

### Unsubscribe handling

When sending via `ListManagementOptions`, SES automatically:
- Adds `List-Unsubscribe` headers (RFC 8058) for Gmail/Yahoo compliance
- Replaces `{{amazonSESUnsubscribeUrl}}` in your HTML with a managed unsubscribe link

Include `{{amazonSESUnsubscribeUrl}}` in your newsletter footer for in-body unsubscribe links.

## Development

```bash
npm run dev -- init              # Run via tsx without building
npm test                         # Run tests
npm run test:watch               # Watch mode
```

## License

Apache-2.0 — see [LICENSE](LICENSE) and [LICENSE-ADDENDUM.txt](LICENSE-ADDENDUM.txt).
