# Noridoc: lib

Path: @/src/lib

### Overview

- Shared utility functions used by CLI commands for parsing, validation, text extraction, external service abstraction, durable send-progress journaling, and detached background execution
- The parsing/validation/extraction modules (`email.ts`, `validation.ts`, `csv.ts`, `html.ts`) are pure, stateless functions. Three modules do real I/O and hold the send-safety invariants: `dns.ts` (DNS lookups), `send-journal.ts` (filesystem state that makes an interrupted send resumable), and `detach.ts` (spawns detached background send processes)

### How it fits into the larger codebase

- `campaign.ts` is imported directly by `send`, `send-safe`, and `bulk-send` to derive the SES open-tracking campaign id and message tags for a run
- Pure utility functions (email, validation, csv, html) are imported directly by commands -- they are not injected via dependency injection
- `extractEmail()` (`@/src/lib/email.ts`) is used by `health`, `preflight`, `setup`, `domain-check`, `audit`, and `send-safe` commands to parse the bare email address from the `fromAddress` config field, which may be in `"Name <email>"` format
- `isValidEmail()` (`@/src/lib/validation.ts`) is used by `contacts add`, `contacts import`, `suppression add`, and `send-safe --test` to reject invalid emails before calling the service
- `parseCsv()` (`@/src/lib/csv.ts`) is used by `contacts import` to parse CSV files into contact records
- `extractSubject()` (`@/src/lib/html.ts`) is used by the `send` and `send-safe` commands to pull the email subject from an HTML file's `<title>` tag
- The `DnsResolver` interface (`@/src/lib/dns.ts`) is one exception to the direct-import pattern: it is injected via `createProgram()`'s `options` parameter into the `domain-check` and `audit` command factories. This enables test injection of a mock DNS resolver without mocking Node internals. The interface mirrors the shape of `dns.promises` (methods: `resolveMx`, `resolveTxt`, `resolveCname`)
- The `DetachLauncher` type (`@/src/lib/detach.ts`) is the other injection seam: it is threaded through `createProgram()`'s `options.launchDetached` into the `send`, `send-safe`, and `bulk-send` command factories (see `@/src/program.ts`). In production it defaults to `defaultDetachLauncher` (which re-execs the CLI as a real background process); tests inject a stub so they can assert the foreground process short-circuits without spawning an OS process
- `send-journal.ts` is the durability backbone of resumable sends: `send`, `send-safe`, and `bulk-send` (`@/src/commands/`) open a journal, skip already-recorded addresses on start, and `record()` each successful delivery. It is the single source of truth for "which recipients already got this newsletter"

### Core Implementation

- **`email.ts`:** `extractEmail()` uses a regex to match `<email>` inside angle brackets. Returns the captured email if the pattern matches, otherwise returns the input unchanged. This handles both `"Name <email>"` and bare `"email"` formats
- **`validation.ts`:** `isValidEmail()` uses a simple regex checking for `user@domain.tld` structure (no whitespace, at least one dot in domain)
- **`csv.ts`:** `parseCsv()` splits on newlines, skips the header row, and splits each line on commas. Expected columns: `email,name,company,added_date`. Empty/missing optional fields become `undefined`
- **`html.ts`:** `extractSubject()` extracts text from the first `<title>` tag using a case-insensitive regex. Returns `null` if no title found or title is empty
- **`dns.ts`:** Defines the `DnsResolver` interface with three methods (`resolveMx`, `resolveTxt`, `resolveCname`) and a `createDnsResolver()` factory that wraps Node's `dns.promises` module. The interface exists to decouple the `domain-check` and `audit` commands from Node's DNS implementation, enabling test injection. It establishes the pattern for injecting external I/O dependencies through `createProgram()`'s `options` bag
- **`send-journal.ts`:** Append-only journal of already-sent addresses that makes an interrupted full-list send resumable. `openJournal(path)` reads any prior journal into an in-memory `alreadySent` set (lowercased) and returns a `record(email)` that appends the address. `stateDir()` resolves the durable per-user state directory — `$XDG_STATE_HOME/nori-newsletter/`, falling back to `~/.local/state/nori-newsletter/` — and `journalPathForKey(key)` / `defaultJournalPath(htmlFile, html)` place journals inside it. A send is keyed on the resolved HTML path **and** its content hash, so re-running the same file resumes while editing the file starts a fresh send. Every `record()` opens the file, writes the line, and `fsync`s before closing
- **`campaign.ts`:** Turns an issue into SES message tags. `sanitizeTagValue()` exists because SES message tag names/values accept **only** ASCII letters, digits, hyphens and underscores (1-256 chars) and reject the whole `SendEmail` call otherwise -- it replaces every disallowed character with `-`, collapses runs of `-`, trims leading/trailing `-`, truncates to 256, and falls back to `unknown` if nothing usable remains. `campaignIdFromFile()` applies it to the HTML filename minus its extension, which is the only stable per-issue identifier the CLI has. `buildTracking(configurationSetName, campaignId)` returns the `{ configurationSetName, emailTags }` bag passed to `SesService.sendEmail`/`sendBulkEmail`, or `undefined` when no configuration set is configured. `NO_CONFIG_SET_WARNING` is the single shared warning string the send commands print in that case
- **`detach.ts`:** Implements the `--detach` background-run mode. `announceDetachedSend()` calls the injected `DetachLauncher`, then prints the child pid and a durable log path. `defaultDetachLauncher()` re-execs the CLI with `stripDetachFlag()` applied to `process.argv` as a `detached`, `unref`'d child whose stdout/stderr stream to `detachedLogPath(seed)` (a hashed path under the state dir's `logs/` subdir). The parent exits immediately while the send keeps running

### Things to Know

- The pure utility modules (`email.ts`, `validation.ts`, `csv.ts`, `html.ts`) are all synchronous, stateless functions with no side effects. `dns.ts`, `send-journal.ts`, and `detach.ts` are the exceptions -- they do I/O and are the modules carrying the send-safety invariants
- **Durability invariant (the reason `send-journal.ts` exists):** the journal must survive a reboot, or a restart after an interrupted send would re-blast the entire subscriber list. This is why the journal lives in a durable state dir and **not** `os.tmpdir()` (tmp is wiped on reboot). This was the root cause of a duplicate-send incident. The per-record `fsync` exists for the same reason: a hard kill (SIGKILL / power loss) must not lose an already-sent address to the OS page cache, which would cause a resend on resume
- **Detach seam:** `defaultDetachLauncher` in `detach.ts` re-execs `process.argv` minus `--detach`, so the background copy runs the send in its own foreground and never recursively re-detaches. `--detach` exists because a foreground shell with a timeout (agent/CI shells often kill after ~2 minutes) would interrupt a long send mid-run; detaching keeps the send alive independent of the caller's shell
- The email regex in `validation.ts` is intentionally simple -- it validates format, not deliverability. The `validate` command handles deeper deliverability checks via the SES API
- `extractEmail()` in `email.ts` is distinct from `isValidEmail()` in `validation.ts` -- one extracts from a display format, the other validates format correctness

Created and maintained by Nori.
