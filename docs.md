# Noridoc: nori-newsletter-cli

Path: @/

### Overview

- CLI tool for managing and sending newsletters via AWS SES, built with Commander and TypeScript
- Handles subscriber management (CRUD, CSV import) through SES contact lists and topic-based email delivery with automatic unsubscribe support
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
- **Dependency injection:** `@/src/index.ts` constructs concrete dependencies (SES client, output, config loader) and passes them to `createProgram()`. Tests substitute mocks at this same boundary
- **Help output:** `@/src/program.ts` uses Commander's `addHelpText('after', ...)` to append a self-contained Configuration section to `--help`, documenting all required config fields, an example `newsletter.config.json`, and the required AWS environment variables. This keeps the help output usable without external docs

### Things to Know

- The `engines` field requires Node >= 18.0.0, matching the ES2022 target in `tsconfig.json`
- The package is CLI-only (no `main`/`exports` — the entry point has top-level side effects). Consumers use it through the `bin`-registered `nori-newsletter` command
- Source files (`src/`) are included in the published package alongside compiled output (`dist/`) for source map debugging and transparency
- The `keywords` in `package.json` are for npm discoverability: newsletter, ses, cli, email, aws

Created and maintained by Nori.
