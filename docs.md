# Noridoc: nori-newsletter-cli

Path: @/

### Overview

- CLI tool for managing and sending newsletters via AWS SES, built with Commander and TypeScript
- Handles full subscriber lifecycle (CRUD, CSV import, unsubscribe visibility, contact status inspection, attribute updates, resubscription) through SES contact lists, plus topic-based email delivery with automatic unsubscribe support and account-level suppression list management
- Sends emails concurrently with automatic rate throttling based on the account's SES sending quota
- Published to npm as `nori-newsletter-cli`, installable globally via `npm install -g nori-newsletter-cli`

### How it fits into the larger codebase

- Entry point is `@/src/index.ts`, which wires up the SES client, output, config, and Commander program
- All CLI commands live in `@/src/commands/` and are registered in `@/src/program.ts`
- AWS SES operations are abstracted behind the `SesService` interface in `@/src/services/ses.ts`, making commands testable with a mock implementation
- Configuration is loaded from `newsletter.config.json` in the working directory via `@/src/config.ts`
- Tests in `@/tests/` mirror the `src/` directory structure and use a shared mock harness in `@/tests/helpers.ts`

### Core Implementation

- **Build pipeline:** TypeScript compiles `src/` to `dist/` via `tsc`. The `dist/index.js` entry point has a `#!/usr/bin/env node` shebang for CLI execution
- **npm publishing:** The `files` array in `package.json` ships `dist/`, `src/`, `LICENSE`, and `README.md`. The `prepublishOnly` script runs `npm run build && npm test` as a safety gate before every publish
- **Module system:** Uses ESM (`"type": "module"`) with Node16 module resolution. All internal imports use `.js` extensions per Node ESM requirements
- **Dependency injection:** `@/src/index.ts` constructs concrete dependencies (SES client, output, config loader) and passes them to `createProgram()`. Tests substitute mocks at this same boundary. The SES client is configured with `maxAttempts: 5` for SDK-level retry on transient errors
- **Send throttling:** The `send` command (`@/src/commands/send.ts`) queries `SesService.getMaxSendRate()` before each send run, then uses `p-throttle` to cap concurrent sends at 80% of the account's max rate (minimum 1/sec). Emails are dispatched via `Promise.allSettled` so individual failures do not abort the batch. This prevents SES `ThrottlingException` errors that would otherwise silently drop emails
- **Help output:** `@/src/program.ts` uses Commander's `addHelpText('after', ...)` to append a self-contained Configuration section to `--help`, documenting all required config fields, an example `newsletter.config.json`, and the required AWS environment variables. This keeps the help output usable without external docs

### Things to Know

- The `engines` field requires Node >= 18.0.0, matching the ES2022 target in `tsconfig.json`
- The package is CLI-only (no `main`/`exports` — the entry point has top-level side effects). Consumers use it through the `bin`-registered `nori-newsletter` command
- Source files (`src/`) are included in the published package alongside compiled output (`dist/`) for source map debugging and transparency
- The `SesService` interface (`@/src/services/ses.ts`) includes `getMaxSendRate()`, which calls `GetAccountCommand` to read the account's `SendQuota.MaxSendRate`. It falls back to 1/sec on any error or missing quota, treating the safest rate as default
- The send command makes an additional AWS API call (`GetAccountCommand`) before each send run to determine the throttle rate
- The `SesService` interface includes suppression list methods that operate at the AWS account level (not tied to any contact list). The `suppression` command (`@/src/commands/suppression.ts`) does not use `newsletter.config.json` for its SES calls despite accepting `getConfig` in its factory signature

Created and maintained by Nori.
