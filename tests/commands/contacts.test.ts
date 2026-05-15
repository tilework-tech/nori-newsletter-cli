import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createMockSesService, runCommand, TEST_CONFIG } from "../helpers.js";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("contacts command", () => {
  let ses: ReturnType<typeof createMockSesService>;
  let tempDir: string;

  beforeEach(async () => {
    ses = createMockSesService();
    await runCommand(ses, ["init"]);
    tempDir = mkdtempSync(join(tmpdir(), "nori-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe("add", () => {
    it("adds a contact by email", async () => {
      const { exitCode } = await runCommand(ses, [
        "contacts",
        "add",
        "alice@example.com",
      ]);

      expect(exitCode).toBe(0);
      const { stdout } = await runCommand(ses, ["contacts", "list"]);
      expect(stdout).toContain("alice@example.com");
    });

    it("adds a contact with name and company", async () => {
      const { exitCode } = await runCommand(ses, [
        "contacts",
        "add",
        "alice@example.com",
        "--name",
        "Alice",
        "--company",
        "Acme",
      ]);

      expect(exitCode).toBe(0);
      const contact = await ses.getContact(TEST_CONFIG.contactListName, "alice@example.com");
      expect(contact?.attributes?.name).toBe("Alice");
      expect(contact?.attributes?.company).toBe("Acme");
    });

    it("reports when contact already exists", async () => {
      await runCommand(ses, ["contacts", "add", "alice@example.com"]);
      const { stdout } = await runCommand(ses, [
        "contacts",
        "add",
        "alice@example.com",
      ]);

      expect(stdout).toContain("already exists");
    });

    it("rejects invalid email", async () => {
      const { exitCode } = await runCommand(ses, [
        "contacts",
        "add",
        "not-an-email",
      ]);

      expect(exitCode).not.toBe(0);
      expect(ses.getContactCount()).toBe(0);
    });
  });

  describe("import", () => {
    it("imports contacts from a CSV file", async () => {
      const csvPath = join(tempDir, "test.csv");
      writeFileSync(
        csvPath,
        `email,name,company,added_date
alice@example.com,Alice,Acme,2026-01-15
bob@example.com,Bob,,2026-02-01`
      );

      const { exitCode, stdout } = await runCommand(ses, [
        "contacts",
        "import",
        csvPath,
      ]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("2");

      const { stdout: listOut } = await runCommand(ses, ["contacts", "list"]);
      expect(listOut).toContain("alice@example.com");
      expect(listOut).toContain("bob@example.com");
    });

    it("skips invalid emails in CSV and reports them", async () => {
      const csvPath = join(tempDir, "test.csv");
      writeFileSync(
        csvPath,
        `email,name,company,added_date
alice@example.com,Alice,,
not-valid,Bob,,`
      );

      const { exitCode, stdout } = await runCommand(ses, [
        "contacts",
        "import",
        csvPath,
      ]);

      expect(exitCode).toBe(0);
      expect(ses.getContactCount()).toBe(1);
      expect(stdout).toContain("Skipped");
    });

    it("fails when CSV file does not exist", async () => {
      const { exitCode } = await runCommand(ses, [
        "contacts",
        "import",
        "/nonexistent/file.csv",
      ]);

      expect(exitCode).not.toBe(0);
    });
  });

  describe("list", () => {
    it("lists all contacts", async () => {
      await runCommand(ses, ["contacts", "add", "alice@example.com"]);
      await runCommand(ses, ["contacts", "add", "bob@example.com"]);

      const { exitCode, stdout } = await runCommand(ses, ["contacts", "list"]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("alice@example.com");
      expect(stdout).toContain("bob@example.com");
    });

    it("reports when no contacts exist", async () => {
      const { exitCode, stdout } = await runCommand(ses, ["contacts", "list"]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("0");
    });
  });

  describe("list --unsubscribed", () => {
    it("lists contacts who have unsubscribed from the topic", async () => {
      await runCommand(ses, ["contacts", "add", "alice@example.com"]);
      await runCommand(ses, ["contacts", "add", "bob@example.com"]);
      ses.setContactUnsubscribed("bob@example.com", TEST_CONFIG.topicName);

      const { exitCode, stdout } = await runCommand(ses, [
        "contacts",
        "list",
        "--unsubscribed",
      ]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("bob@example.com");
      expect(stdout).not.toContain("alice@example.com");
    });

    it("shows count of 0 when no contacts are unsubscribed", async () => {
      await runCommand(ses, ["contacts", "add", "alice@example.com"]);

      const { exitCode, stdout } = await runCommand(ses, [
        "contacts",
        "list",
        "--unsubscribed",
      ]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("0");
    });

    it("does not affect regular list behavior", async () => {
      await runCommand(ses, ["contacts", "add", "alice@example.com"]);
      await runCommand(ses, ["contacts", "add", "bob@example.com"]);
      ses.setContactUnsubscribed("bob@example.com", TEST_CONFIG.topicName);

      const { stdout } = await runCommand(ses, ["contacts", "list"]);

      expect(stdout).toContain("alice@example.com");
      expect(stdout).not.toContain("bob@example.com");
    });
  });

  describe("status", () => {
    it("shows contact details for an existing contact", async () => {
      await runCommand(ses, [
        "contacts",
        "add",
        "alice@example.com",
        "--name",
        "Alice",
        "--company",
        "Acme",
      ]);

      const { exitCode, stdout } = await runCommand(ses, [
        "contacts",
        "status",
        "alice@example.com",
      ]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("alice@example.com");
      expect(stdout).toContain("Alice");
      expect(stdout).toContain("Acme");
      expect(stdout).toContain("OPT_IN");
    });

    it("shows unsubscribed status for opted-out contact", async () => {
      await runCommand(ses, ["contacts", "add", "bob@example.com"]);
      ses.setContactUnsubscribed("bob@example.com", TEST_CONFIG.topicName);

      const { exitCode, stdout } = await runCommand(ses, [
        "contacts",
        "status",
        "bob@example.com",
      ]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("OPT_OUT");
    });

    it("reports error when contact not found", async () => {
      const { exitCode, stderr } = await runCommand(ses, [
        "contacts",
        "status",
        "nobody@example.com",
      ]);

      expect(exitCode).not.toBe(0);
      expect(stderr).toContain("not found");
    });
  });

  describe("update", () => {
    it("updates name and company for an existing contact", async () => {
      await runCommand(ses, [
        "contacts",
        "add",
        "alice@example.com",
        "--name",
        "Alice",
      ]);

      const { exitCode } = await runCommand(ses, [
        "contacts",
        "update",
        "alice@example.com",
        "--name",
        "Alice Smith",
        "--company",
        "NewCorp",
      ]);

      expect(exitCode).toBe(0);

      const { stdout } = await runCommand(ses, [
        "contacts",
        "status",
        "alice@example.com",
      ]);
      expect(stdout).toContain("Alice Smith");
      expect(stdout).toContain("NewCorp");
    });

    it("resubscribes an unsubscribed contact", async () => {
      await runCommand(ses, ["contacts", "add", "bob@example.com"]);
      ses.setContactUnsubscribed("bob@example.com", TEST_CONFIG.topicName);

      const { exitCode, stdout } = await runCommand(ses, [
        "contacts",
        "update",
        "bob@example.com",
        "--resubscribe",
      ]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("resubscribed");

      const { stdout: listOut } = await runCommand(ses, ["contacts", "list"]);
      expect(listOut).toContain("bob@example.com");
    });

    it("reports error when contact not found", async () => {
      const { exitCode, stderr } = await runCommand(ses, [
        "contacts",
        "update",
        "nobody@example.com",
        "--name",
        "Ghost",
      ]);

      expect(exitCode).not.toBe(0);
      expect(stderr).toContain("not found");
    });

    it("updates only provided attributes without clearing others", async () => {
      await runCommand(ses, [
        "contacts",
        "add",
        "alice@example.com",
        "--name",
        "Alice",
        "--company",
        "Acme",
      ]);

      await runCommand(ses, [
        "contacts",
        "update",
        "alice@example.com",
        "--name",
        "Alice Smith",
      ]);

      const { stdout } = await runCommand(ses, [
        "contacts",
        "status",
        "alice@example.com",
      ]);
      expect(stdout).toContain("Alice Smith");
      expect(stdout).toContain("Acme");
    });
  });

  describe("remove", () => {
    it("removes a contact", async () => {
      await runCommand(ses, ["contacts", "add", "alice@example.com"]);

      const { exitCode } = await runCommand(ses, [
        "contacts",
        "remove",
        "alice@example.com",
      ]);

      expect(exitCode).toBe(0);
      const { stdout } = await runCommand(ses, ["contacts", "list"]);
      expect(stdout).not.toContain("alice@example.com");
    });

    it("reports when contact not found", async () => {
      const { exitCode } = await runCommand(ses, [
        "contacts",
        "remove",
        "nobody@example.com",
      ]);

      expect(exitCode).not.toBe(0);
    });
  });
});
