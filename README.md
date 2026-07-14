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

# Run in the background and return immediately (recommended for large lists)
nori-newsletter send newsletter.html --detach
```

The subject line is extracted from the HTML `<title>` tag. If no title is found, the filename is used.

As it sends, `send` prints per-recipient progress (`[k/total] sent <email>`) so an
interrupted run shows exactly how far it got.

### Run large sends in the background

A full-list send can take minutes. **Never run it in a foreground shell that may
enforce a timeout** (many agent/CI shells kill a command after ~2 minutes, which
interrupts the send). Use `--detach`: the CLI spawns the send as a detached
background process, prints its pid and a log path, and returns immediately.

```bash
nori-newsletter send newsletter.html --detach
# Started background send (pid 12345).
# Logs: ~/.local/state/nori-newsletter/logs/<key>.log
# Watch progress: tail -f ~/.local/state/nori-newsletter/logs/<key>.log
```

`send-safe` and `bulk-send` accept `--detach` as well. A detached run reports its
pid and log path and then returns; check the log before launching again. Do **not**
start the same campaign twice at once — the journal makes a *sequential* re-run
safe, but two runs racing concurrently both read an empty journal and can double-send.

### Resuming an interrupted send

Full-list sends are resumable. Each successful delivery is appended to a journal
file in a **durable** state directory — `$XDG_STATE_HOME/nori-newsletter/`,
falling back to `~/.local/state/nori-newsletter/` — keyed by the newsletter's path
and content. (It is deliberately **not** the OS temp directory, which is wiped on
reboot and would let a restart re-send the whole list.) If a send is interrupted —
timeout, crash, Ctrl-C — just run the **same command again**: already-sent
recipients are skipped and only the remainder go out, so no subscriber is emailed
twice.

```bash
# First run is interrupted partway through...
nori-newsletter send newsletter.html

# ...re-run the identical command to send only the recipients that remain.
nori-newsletter send newsletter.html

# Force a full re-send, ignoring saved progress:
nori-newsletter send newsletter.html --no-resume

# Use an explicit journal location (e.g. to inspect, share, or place on
# persistent storage so a resume survives a different machine):
nori-newsletter send newsletter.html --state-file ./send.journal
```

Editing the newsletter (same filename, changed content) starts a fresh send rather
than resuming the old one. `--test` sends are never journaled. The same resume
options apply to `send-safe` and `bulk-send`.

> **Ephemeral machines:** the durable state dir survives reboots but not a *different*
> machine. If an interrupted send may be retried on a fresh VM, point `--state-file`
> at shared/persistent storage so the resume can find prior progress.

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

## Releasing

Publishing is automated by `.github/workflows/newsletter-cli-release.yml` and uses
**npm OIDC Trusted Publishing — no `NPM_TOKEN` secret**, matching the sibling
`nori-slack-cli` / `nori-skillsets` deploys. A `newsletter-cli-v<version>` **git tag
is the source of truth** for the version; `package.json` ships a `0.0.0` placeholder
that the workflow stamps from the tag before it builds, so `--version` (read from
`package.json` at runtime) always matches the installed build.

Cut a release from a clean `main`:

```bash
npm run release -- 1.1.0
```

This validates the version, creates and pushes the `newsletter-cli-v1.1.0` tag, and
the workflow builds, tests, publishes to npm (`@latest`), and creates a GitHub
Release. `npx nori-newsletter-cli@latest` therefore can never lag behind a release.

**One-time setup** (repo/npm admin — cannot be scripted):

- Create a GitHub **Environment** named `npm-publish` in this repo.
- Register a **Trusted Publisher** for `nori-newsletter-cli` on npmjs.com:
  org `tilework-tech`, repo `nori-newsletter-cli`, workflow
  `newsletter-cli-release.yml`, environment `npm-publish`.

## License

Apache-2.0 — see [LICENSE](LICENSE) and [LICENSE-ADDENDUM.txt](LICENSE-ADDENDUM.txt).
