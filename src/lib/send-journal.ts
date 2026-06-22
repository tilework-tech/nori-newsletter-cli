import { createHash } from "node:crypto";
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

export interface SendJournal {
  path: string;
  // Lowercased addresses already confirmed sent in a prior (or current) run.
  alreadySent: Set<string>;
  // Durably record that `email` was sent. Appends immediately so a hard kill
  // (SIGTERM/SIGKILL) loses at most the in-flight sends, never the recorded ones.
  record(email: string): void;
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
  return join(tmpdir(), "nori-newsletter-state", `${key}.journal`);
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
      appendFileSync(path, `${email}\n`);
      alreadySent.add(normalized);
    },
  };
}
