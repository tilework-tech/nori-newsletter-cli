import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  defaultJournalPath,
  openJournal,
} from "../../src/lib/send-journal.js";

describe("send-journal", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "nori-journal-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe("defaultJournalPath", () => {
    it("is stable for the same file path and content", () => {
      const a = defaultJournalPath("/news/issue.html", "<html>same</html>");
      const b = defaultJournalPath("/news/issue.html", "<html>same</html>");
      expect(a).toBe(b);
    });

    it("differs when the content changes (edited newsletter starts fresh)", () => {
      const a = defaultJournalPath("/news/issue.html", "<html>v1</html>");
      const b = defaultJournalPath("/news/issue.html", "<html>v2</html>");
      expect(a).not.toBe(b);
    });

    it("differs for different file paths with identical content", () => {
      const a = defaultJournalPath("/news/a.html", "<html>same</html>");
      const b = defaultJournalPath("/news/b.html", "<html>same</html>");
      expect(a).not.toBe(b);
    });
  });

  describe("openJournal", () => {
    it("starts empty when no journal file exists", () => {
      const journal = openJournal(join(tempDir, "fresh.journal"));
      expect(journal.alreadySent.size).toBe(0);
    });

    it("loads previously recorded addresses (case-insensitive)", () => {
      const path = join(tempDir, "existing.journal");
      writeFileSync(path, "Alice@Example.com\nbob@example.com\n");

      const journal = openJournal(path);
      expect(journal.alreadySent.has("alice@example.com")).toBe(true);
      expect(journal.alreadySent.has("bob@example.com")).toBe(true);
      expect(journal.alreadySent.size).toBe(2);
    });

    it("appends recorded sends and dedupes", () => {
      const path = join(tempDir, "record.journal");
      const journal = openJournal(path);

      journal.record("carol@example.com");
      journal.record("carol@example.com"); // duplicate, ignored
      journal.record("dave@example.com");

      const lines = readFileSync(path, "utf-8").trim().split("\n");
      expect(lines).toEqual(["carol@example.com", "dave@example.com"]);
      expect(journal.alreadySent.size).toBe(2);
    });

    it("persists records across re-opens (resume survives a crash)", () => {
      const path = join(tempDir, "resume.journal");
      const first = openJournal(path);
      first.record("eve@example.com");

      const second = openJournal(path);
      expect(second.alreadySent.has("eve@example.com")).toBe(true);
    });
  });
});
