# Noridoc: lib

Path: @/src/lib

### Overview

- Shared utility functions used by CLI commands for parsing, validation, and text extraction
- Pure functions with no AWS SDK or service dependencies

### How it fits into the larger codebase

- Commands in `@/src/commands/` import these utilities directly -- they are not injected via dependency injection
- `extractEmail()` (`@/src/lib/email.ts`) is used by `health`, `preflight`, and `setup` commands to parse the bare email address from the `fromAddress` config field, which may be in `"Name <email>"` format
- `isValidEmail()` (`@/src/lib/validation.ts`) is used by `contacts add`, `contacts import`, and `suppression add` to reject invalid emails before calling the service
- `parseCsv()` (`@/src/lib/csv.ts`) is used by `contacts import` to parse CSV files into contact records
- `extractSubject()` (`@/src/lib/html.ts`) is used by the `send` command to pull the email subject from an HTML file's `<title>` tag

### Core Implementation

- **`email.ts`:** `extractEmail()` uses a regex to match `<email>` inside angle brackets. Returns the captured email if the pattern matches, otherwise returns the input unchanged. This handles both `"Name <email>"` and bare `"email"` formats
- **`validation.ts`:** `isValidEmail()` uses a simple regex checking for `user@domain.tld` structure (no whitespace, at least one dot in domain)
- **`csv.ts`:** `parseCsv()` splits on newlines, skips the header row, and splits each line on commas. Expected columns: `email,name,company,added_date`. Empty/missing optional fields become `undefined`
- **`html.ts`:** `extractSubject()` extracts text from the first `<title>` tag using a case-insensitive regex. Returns `null` if no title found or title is empty

### Things to Know

- These are all synchronous, stateless functions with no side effects
- The email regex in `validation.ts` is intentionally simple -- it validates format, not deliverability. The `validate` command handles deeper deliverability checks via the SES API
- `extractEmail()` in `email.ts` is distinct from `isValidEmail()` in `validation.ts` -- one extracts from a display format, the other validates format correctness

Created and maintained by Nori.
