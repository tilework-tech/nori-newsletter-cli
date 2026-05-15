# Noridoc: lib

Path: @/src/lib

### Overview

- Shared utility functions used by CLI commands for parsing, validation, text extraction, and external service abstraction
- Most modules are pure functions with no external dependencies. The exception is `dns.ts`, which defines the `DnsResolver` interface and a default implementation wrapping Node's `dns.promises` module

### How it fits into the larger codebase

- Pure utility functions (email, validation, csv, html) are imported directly by commands -- they are not injected via dependency injection
- `extractEmail()` (`@/src/lib/email.ts`) is used by `health`, `preflight`, `setup`, `domain-check`, `audit`, and `send-safe` commands to parse the bare email address from the `fromAddress` config field, which may be in `"Name <email>"` format
- `isValidEmail()` (`@/src/lib/validation.ts`) is used by `contacts add`, `contacts import`, `suppression add`, and `send-safe --test` to reject invalid emails before calling the service
- `parseCsv()` (`@/src/lib/csv.ts`) is used by `contacts import` to parse CSV files into contact records
- `extractSubject()` (`@/src/lib/html.ts`) is used by the `send` and `send-safe` commands to pull the email subject from an HTML file's `<title>` tag
- The `DnsResolver` interface (`@/src/lib/dns.ts`) is the exception to the direct-import pattern: it is injected via `createProgram()`'s `options` parameter into the `domain-check` and `audit` command factories. This enables test injection of a mock DNS resolver without mocking Node internals. The interface mirrors the shape of `dns.promises` (methods: `resolveMx`, `resolveTxt`, `resolveCname`)

### Core Implementation

- **`email.ts`:** `extractEmail()` uses a regex to match `<email>` inside angle brackets. Returns the captured email if the pattern matches, otherwise returns the input unchanged. This handles both `"Name <email>"` and bare `"email"` formats
- **`validation.ts`:** `isValidEmail()` uses a simple regex checking for `user@domain.tld` structure (no whitespace, at least one dot in domain)
- **`csv.ts`:** `parseCsv()` splits on newlines, skips the header row, and splits each line on commas. Expected columns: `email,name,company,added_date`. Empty/missing optional fields become `undefined`
- **`html.ts`:** `extractSubject()` extracts text from the first `<title>` tag using a case-insensitive regex. Returns `null` if no title found or title is empty
- **`dns.ts`:** Defines the `DnsResolver` interface with three methods (`resolveMx`, `resolveTxt`, `resolveCname`) and a `createDnsResolver()` factory that wraps Node's `dns.promises` module. The interface exists to decouple the `domain-check` and `audit` commands from Node's DNS implementation, enabling test injection. This is the only non-SES external dependency in the codebase and establishes the pattern for injecting external I/O dependencies through `createProgram()`'s `options` bag

### Things to Know

- The pure utility modules (`email.ts`, `validation.ts`, `csv.ts`, `html.ts`) are all synchronous, stateless functions with no side effects. `dns.ts` is the exception -- it wraps an async I/O dependency and is injected via dependency injection rather than imported directly
- The email regex in `validation.ts` is intentionally simple -- it validates format, not deliverability. The `validate` command handles deeper deliverability checks via the SES API
- `extractEmail()` in `email.ts` is distinct from `isValidEmail()` in `validation.ts` -- one extracts from a display format, the other validates format correctness

Created and maintained by Nori.
