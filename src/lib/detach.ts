import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, openSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Output } from "../output.js";
import { stateDir } from "./send-journal.js";

// Launches a detached background copy of this send and returns its pid. Injected
// in tests so we can assert the foreground process short-circuits without
// spawning a real OS process.
export type DetachLauncher = (logPath: string) => number;

// Removes the --detach flag so the re-spawned background process runs the send
// in its own foreground (and does not recursively re-detach).
export function stripDetachFlag(argv: string[]): string[] {
  return argv.filter((arg) => arg !== "--detach");
}

// Durable, deterministic log location for a detached run, keyed on `seed` (the
// resolved HTML path for `send`, or the template identity for `bulk-send`).
export function detachedLogPath(seed: string): string {
  const key = createHash("sha256").update(seed).digest("hex").slice(0, 32);
  return join(stateDir(), "logs", `${key}.log`);
}

// Launch a detached background run for `seed` and report where it is logging.
// Shared by the send commands so none of them holds a long send in the foreground.
export function announceDetachedSend(
  out: Output,
  launchDetached: DetachLauncher,
  seed: string,
  label: string
): void {
  const logPath = detachedLogPath(seed);
  const pid = launchDetached(logPath);
  out.write(
    `Started ${label} (pid ${pid}).\n` +
      `Logs: ${logPath}\n` +
      `Watch progress: tail -f ${logPath}\n`
  );
}

// Re-exec this CLI (minus --detach) as a detached, backgrounded process whose
// stdout/stderr stream to `logPath`. The parent can exit immediately; the send
// keeps running. Returns the child pid.
export function defaultDetachLauncher(logPath: string): number {
  mkdirSync(dirname(logPath), { recursive: true });
  const fd = openSync(logPath, "a");
  const child = spawn(process.execPath, stripDetachFlag(process.argv.slice(1)), {
    detached: true,
    stdio: ["ignore", fd, fd],
  });
  child.unref();
  return child.pid ?? -1;
}
