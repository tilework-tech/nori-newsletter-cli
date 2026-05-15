# Noridoc: nori-newsletter-cli

Path: @/

### Overview

- CLI tool for managing and sending newsletters via AWS SES, built with Commander and TypeScript
- Provides both low-level SES operations (contact management, sending, suppression, templates, identities, config sets, validation, bulk import/export jobs) and high-level abstraction commands (`health` dashboard, `preflight` pre-send checks, `cleanup` contact/suppression reconciliation, `setup` infrastructure provisioning, `reputation` sending health analysis) that compose multiple service calls into newsletter-specific workflows
- Sends emails concurrently with automatic rate throttling based on the account's SES sending quota. The `send` command sends individually via `SendEmail`; the `bulk-send` command batches up to 50 recipients per API call via `SendBulkEmail`
- Published to npm as `nori-newsletter-cli`, installable globally via `npm install -g nori-newsletter-cli`

### How it fits into the larger codebase

- Entry point is `@/src/index.ts`, which wires up the SES client, output, config, and Commander program
- All CLI commands live in `@/src/commands/` and are registered in `@/src/program.ts`
- AWS SES operations are abstracted behind the `SesService` interface in `@/src/services/ses.ts`, making commands testable with a mock implementation
- Shared utility functions (email parsing, validation, CSV parsing, HTML extraction) live in `@/src/lib/` and are used directly by commands
- Configuration is loaded from `newsletter.config.json` in the working directory via `@/src/config.ts`
- Tests in `@/tests/` mirror the `src/` directory structure and use a shared mock harness in `@/tests/helpers.ts`

### Core Implementation

- **Build pipeline:** TypeScript compiles `src/` to `dist/` via `tsc`. The `dist/index.js` entry point has a `#!/usr/bin/env node` shebang for CLI execution
- **npm publishing:** The `files` array in `package.json` ships `dist/`, `src/`, `LICENSE`, and `README.md`. The `prepublishOnly` script runs `npm run build && npm test` as a safety gate before every publish
- **Module system:** Uses ESM (`"type": "module"`) with Node16 module resolution. All internal imports use `.js` extensions per Node ESM requirements
- **Dependency injection:** `@/src/index.ts` constructs concrete dependencies (SES client, output, config loader) and passes them to `createProgram()`. Tests substitute mocks at this same boundary. The SES client is configured with `maxAttempts: 5` for SDK-level retry on transient errors
- **Send throttling:** Both `send` (`@/src/commands/send.ts`) and `bulk-send` (`@/src/commands/bulk-send.ts`) query `SesService.getMaxSendRate()` before each send run, then use `p-throttle` to cap concurrent sends at 80% of the account's max rate (minimum 1/sec). `send` throttles per-recipient; `bulk-send` throttles per-batch (batch = 50 recipients). Both use `Promise.allSettled` so individual failures do not abort the run. This prevents SES `ThrottlingException` errors that would otherwise silently drop emails
- **Help output:** `@/src/program.ts` uses Commander's `addHelpText('after', ...)` to append a self-contained Configuration section to `--help`, documenting all required config fields, an example `newsletter.config.json`, and the required AWS environment variables. This keeps the help output usable without external docs

### Things to Know

- The `engines` field requires Node >= 18.0.0, matching the ES2022 target in `tsconfig.json`
- The package is CLI-only (no `main`/`exports` — the entry point has top-level side effects). Consumers use it through the `bin`-registered `nori-newsletter` command
- Source files (`src/`) are included in the published package alongside compiled output (`dist/`) for source map debugging and transparency
- The `SesService` interface (`@/src/services/ses.ts`) includes `getMaxSendRate()`, which calls `GetAccountCommand` to read the account's `SendQuota.MaxSendRate`. It falls back to 1/sec on any error or missing quota, treating the safest rate as default
- The send command makes an additional AWS API call (`GetAccountCommand`) before each send run to determine the throttle rate
- Several commands operate at the AWS account level and do not depend on `newsletter.config.json`: `suppression`, `lists`, `stats`, `templates`, `identities`, `config-sets`, `validate check`, `reputation`, and most `jobs` subcommands. Their factory functions still accept `getConfig` for consistency with the shared command factory signature. The `jobs import-contacts` subcommand defaults to the configured `contactListName` when `--list` is not provided. The abstraction commands that depend on config are `health`, `preflight`, `cleanup`, `setup`, and `validate list`. Note that `reputation` is an abstraction command but operates account-level only
- The abstraction commands (`health`, `preflight`, `cleanup`, `setup`, `reputation`) are a distinct architectural layer: they compose existing `SesService` methods without adding new AWS API calls. They exist because SES treats suppression lists and contact lists as separate systems with no cross-referencing, has silent failure modes (suppressed addresses still count toward quota), requires multiple API calls to assemble a complete picture of newsletter health or provision the required infrastructure, and provides raw metric numbers without interpreting them against enforcement thresholds
- The `bulk-send` command uses `SendBulkEmail`, which does **not** support `ListManagementOptions` (the SES feature that auto-injects unsubscribe links). Because of this, `bulk-send` fetches opted-in contacts client-side via `listContacts` instead of relying on SES-managed unsubscribe filtering. This is a known AWS API limitation, not a design oversight
- The `stats send` subcommand and `reputation` command require VDM (Virtual Deliverability Manager) to be enabled on the SES account for full metrics. VDM data is retained for 60 days, which caps the `--days` option at 60. The `reputation` command degrades gracefully when VDM is unavailable, displaying a fallback message instead of failing

Created and maintained by Nori.
