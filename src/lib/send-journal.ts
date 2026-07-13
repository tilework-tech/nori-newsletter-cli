import { createHash } from "node:crypto";
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";

export interface SendJournal {
  path: string;
  // Lowercased addresses already confirmed sent in a prior (or current) run.
  alreadySent: Set<string>;
  // Durably record that `email` was sent. Appends immediately so a hard kill
  // (SIGTERM/SIGKILL) loses at most the in-flight sends, never the recorded ones.
  record(email: string): void;
}

// Durable, per-user state directory for send progress. Unlike os.tmpdir(), this
// survives reboots so an interrupted send can resume instead of re-blasting the
// whole list. Honors XDG_STATE_HOME, falling back to ~/.local/state.
export function stateDir(): string {
  const xdg = process.env.XDG_STATE_HOME;
  const base =
    xdg && xdg.trim().length > 0 ? xdg : join(homedir(), ".local", "state");
  return join(base, "nori-newsletter");
}

export function journalPathForKey(key: string): string {
  return join(stateDir(), `${key}.journal`);
}

// A send is identified by the resolved HTML path AND its content hash. Re-running
// the exact same file resumes; editing the file (same name) starts a fresh send.
// Keying on the absolute path keeps concurrent sends of different files isolated.
export function defaultJournalPath(htmlFile: string, html: string): string {
  const absPath = resolve(htmlFile);
  const contentHash = createHash("sha256").update(html).digest("hex");
  const key = createHash("sha256")
    .update(`${absPath}\n${contentHash}`)
    .digest("hex")
    .slice(0, 32);
  return journalPathForKey(key);
}

export function openJournal(path: string): SendJournal {
  const alreadySent = new Set<string>();

  let existing = "";
  try {
    existing = readFileSync(path, "utf-8");
  } catch {
    // No prior journal at this path: this is a fresh send.
  }
  for (const line of existing.split("\n")) {
    const email = line.trim();
    if (email) alreadySent.add(email.toLowerCase());
  }

  let dirEnsured = false;

  return {
    path,
    alreadySent,
    record(email: string): void {
      const normalized = email.toLowerCase();
      if (alreadySent.has(normalized)) return;
      if (!dirEnsured) {
        mkdirSync(dirname(path), { recursive: true });
        dirEnsured = true;
      }
      // Append synchronously: a hard kill (timeout / SIGKILL) then loses at most
      // the in-flight sends, never a recorded one, so a re-run resumes instead of
      // re-sending the whole list.
      appendFileSync(path, `${email}\n`);
      alreadySent.add(normalized);
    },
  };
}
