# Noridoc: tests

Path: @/tests

### Overview

- Vitest test suite covering CLI commands, library utilities, configuration loading, SES service behavior, and npm packaging
- Mirrors the `@/src/` directory structure: `tests/commands/`, `tests/services/`, `tests/lib/`, and root-level test files for cross-cutting concerns

### How it fits into the larger codebase

- Tests are run via `npm test` (which calls `vitest run`) and are gated in the `prepublishOnly` script in `@/package.json`, so a failing test blocks npm publishing
- Command tests depend on the shared mock harness in `@/tests/helpers.ts`, which provides `createMockSesService()` and `runCommand()` to exercise Commander commands without real AWS calls
- The `SesService` interface (`@/src/services/ses.ts`) is the primary seam for testing: all command tests inject a mock implementation rather than hitting AWS
- Packaging tests (`@/tests/packaging.test.ts`) run `npm pack --dry-run` against the real project to verify the published tarball contents

### Core Implementation

- **`helpers.ts`:** Central test infrastructure. `createMockSesService()` accepts an optional `MockSesServiceOptions` object with behavior overrides (`sendEmailBehavior`, `sendBulkEmailBehavior`, `validateBehavior`), `maxSendRate` (defaults to 14), `accountInfo` (overrides for account health fields), `metricsResults`/`metricsErrors` (canned responses for `getMetrics()`), and `seedIdentities` (pre-populates the identity store with verified identities, useful for `health`, `preflight`, `setup`, and `domain-check` tests that need a verified from-address without calling `createIdentity`). It returns an in-memory mock implementing the full `SesService` interface with state tracking (contacts map, sent emails list, sent bulk emails list, suppressed destinations map, contact lists map, templates map, identities map, config sets map, import jobs map, export jobs map). Config sets are the first entity in the mock with nested sub-entity storage: each `MockConfigSet` contains a `Map<string, MockEventDestination>` for its event destinations. Import and export jobs use auto-incrementing IDs (`import-job-1`, `export-job-1`) instead of UUIDs for test determinism. The mock also exposes test-only helpers like `setContactUnsubscribed()` for simulating opt-out state, and `getImportJobCount()`/`getExportJobCount()` for inspecting job storage. `runCommand()` wires up the mock + a test output capture and runs Commander with `exitOverride()` so command errors become catchable `CommanderError` exceptions. `runCommand()` accepts an optional 4th `options` parameter (currently `{ dnsResolver?: DnsResolver }`) that is passed through to `createProgram()`, enabling injection of non-SES external dependencies for testing
- **Command tests** (`commands/*.test.ts`) use `runCommand()` to test CLI behavior end-to-end: they pass argument arrays and assert on stdout/stderr/exitCode
- **Help output tests** (`help.test.ts`) verify that `--help` output is self-contained by asserting on config field names, example JSON, env vars, and the correct program name. These use `program.outputHelp()` / `sub.outputHelp()` with captured output rather than `runCommand()`, since help is a synchronous Commander feature
- **Packaging tests** (`packaging.test.ts`) shell out to `npm run build` and `npm pack --dry-run` to verify that `dist/`, `src/`, `LICENSE`, and `README.md` are included in the package, and that the bin entry has a valid node shebang

### Things to Know

- Packaging tests run a real build (`npm run build`) as a side effect, so they are slower than unit tests and will fail if TypeScript compilation fails
- The mock SES service simulates AWS error conventions: it throws errors with `.name` set to `"AlreadyExistsException"` or `"NotFoundException"` to match the real SES SDK behavior. It replicates topic-aware filtering for `listContacts` and `listUnsubscribedContacts`, the attribute-merging semantics of `updateContact`, and reason/date filtering for `listSuppressedDestinations`. The mock follows the same null-return vs. throw split as the real service -- "get" methods (`getContact`, `getSuppressedDestination`, `getContactList`, `getTemplate`, `getIdentity`, `getConfigSet`, `getImportJob`, `getExportJob`) return `null` for not-found, while "delete" methods (`deleteContact`, `deleteSuppressedDestination`, `deleteContactList`, `deleteTemplate`, `deleteIdentity`, `deleteConfigSet`, `deleteEventDestination`) throw `NotFoundException`. For config sets, the mock stores event destinations in a nested `Map` within each `MockConfigSet`, and `createEventDestination`/`getEventDestinations`/`deleteEventDestination` all validate the parent config set exists before operating on destinations. The mock infers destination type from which ARN/dimension field is provided, matching the real service's detection logic. For import/export jobs, the mock stores jobs in separate `Map` collections with auto-incrementing counters, and all created jobs default to `CREATED` status
- Config tests (`config.test.ts`) use temp directories (`mkdtempSync`) and clean up after themselves, so they don't depend on any project-level config file existing
- The `domain-check` tests (`@/tests/commands/domain-check.test.ts`) define a local `createMockDnsResolver()` that returns a `DnsResolver` implementation with configurable responses and error simulation (keyed by `type:hostname`, e.g. `cname:token-1._domainkey.example.com`). This is separate from the shared helpers because the `DnsResolver` is not part of the `SesService` interface -- it is a distinct injection point. DNS errors are simulated by attaching a `.code` property to thrown errors (e.g., `ENODATA`, `ETIMEOUT`), matching Node's `dns.promises` error conventions

Created and maintained by Nori.
