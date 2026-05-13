# Noridoc: tests

Path: @/tests

### Overview

- Vitest test suite covering CLI commands, library utilities, configuration loading, and npm packaging
- Mirrors the `@/src/` directory structure: `tests/commands/`, `tests/lib/`, and root-level test files for cross-cutting concerns

### How it fits into the larger codebase

- Tests are run via `npm test` (which calls `vitest run`) and are gated in the `prepublishOnly` script in `@/package.json`, so a failing test blocks npm publishing
- Command tests depend on the shared mock harness in `@/tests/helpers.ts`, which provides `createMockSesService()` and `runCommand()` to exercise Commander commands without real AWS calls
- The `SesService` interface (`@/src/services/ses.ts`) is the primary seam for testing: all command tests inject a mock implementation rather than hitting AWS
- Packaging tests (`@/tests/packaging.test.ts`) run `npm pack --dry-run` against the real project to verify the published tarball contents

### Core Implementation

- **`helpers.ts`:** Central test infrastructure. `createMockSesService()` returns an in-memory mock implementing the full `SesService` interface with state tracking (contacts map, sent emails list). `runCommand()` wires up the mock + a test output capture and runs Commander with `exitOverride()` so command errors become catchable `CommanderError` exceptions
- **Command tests** (`commands/*.test.ts`) use `runCommand()` to test CLI behavior end-to-end: they pass argument arrays and assert on stdout/stderr/exitCode
- **Help output tests** (`help.test.ts`) verify that `--help` output is self-contained by asserting on config field names, example JSON, env vars, and the correct program name. These use `program.outputHelp()` / `sub.outputHelp()` with captured output rather than `runCommand()`, since help is a synchronous Commander feature
- **Packaging tests** (`packaging.test.ts`) shell out to `npm run build` and `npm pack --dry-run` to verify that `dist/`, `src/`, `LICENSE`, and `README.md` are included in the package, and that the bin entry has a valid node shebang

### Things to Know

- Packaging tests run a real build (`npm run build`) as a side effect, so they are slower than unit tests and will fail if TypeScript compilation fails
- The mock SES service simulates AWS error conventions: it throws errors with `.name` set to `"AlreadyExistsException"` or `"NotFoundException"` to match the real SES SDK behavior
- Config tests (`config.test.ts`) use temp directories (`mkdtempSync`) and clean up after themselves, so they don't depend on any project-level config file existing

Created and maintained by Nori.
