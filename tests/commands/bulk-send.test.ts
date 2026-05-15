import { describe, it, expect, beforeEach } from "vitest";
import { createMockSesService, runCommand } from "../helpers.js";

describe("bulk-send command", () => {
  let ses: ReturnType<typeof createMockSesService>;

  beforeEach(async () => {
    ses = createMockSesService();
    await runCommand(ses, ["init"]);
    await ses.createTemplate("my-template", {
      subject: "Hello {{name}}",
      html: "<p>Hi {{name}}, your code is {{code}}</p>",
    });
  });

  it("sends bulk email to all contacts using a template", async () => {
    await runCommand(ses, ["contacts", "add", "alice@example.com"]);
    await runCommand(ses, ["contacts", "add", "bob@example.com"]);

    const { exitCode, stdout } = await runCommand(ses, [
      "bulk-send",
      "my-template",
    ]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("to 2 recipients");
    const bulkSends = ses.getSentBulkEmails();
    expect(bulkSends.length).toBe(1);
    expect(bulkSends[0].templateName).toBe("my-template");
    expect(bulkSends[0].entries.length).toBe(2);
  });

  it("batches recipients into groups of 50", async () => {
    for (let i = 0; i < 75; i++) {
      await ses.createContact(
        "test-newsletter",
        `user${i}@example.com`,
        "test-topic"
      );
    }

    const { exitCode, stdout } = await runCommand(ses, [
      "bulk-send",
      "my-template",
    ]);

    expect(exitCode).toBe(0);
    const bulkSends = ses.getSentBulkEmails();
    expect(bulkSends.length).toBe(2);
    expect(bulkSends[0].entries.length).toBe(50);
    expect(bulkSends[1].entries.length).toBe(25);
    expect(stdout).toContain("to 75 recipients");
  });

  it("passes default template data via --data", async () => {
    await runCommand(ses, ["contacts", "add", "alice@example.com"]);

    const { exitCode } = await runCommand(ses, [
      "bulk-send",
      "my-template",
      "--data",
      '{"name":"friend","code":"ABC"}',
    ]);

    expect(exitCode).toBe(0);
    const bulkSends = ses.getSentBulkEmails();
    expect(bulkSends[0].defaultTemplateData).toBe(
      '{"name":"friend","code":"ABC"}'
    );
  });

  it("sends only to test recipients with --test", async () => {
    await runCommand(ses, ["contacts", "add", "alice@example.com"]);

    const { exitCode } = await runCommand(ses, [
      "bulk-send",
      "my-template",
      "--test",
      "test1@example.com,test2@example.com",
    ]);

    expect(exitCode).toBe(0);
    const bulkSends = ses.getSentBulkEmails();
    expect(bulkSends.length).toBe(1);
    expect(bulkSends[0].entries.map((e: { to: string }) => e.to)).toEqual([
      "test1@example.com",
      "test2@example.com",
    ]);
  });

  it("does not send with --dry-run", async () => {
    await runCommand(ses, ["contacts", "add", "alice@example.com"]);

    const { exitCode, stdout } = await runCommand(ses, [
      "bulk-send",
      "my-template",
      "--dry-run",
    ]);

    expect(exitCode).toBe(0);
    expect(ses.getSentBulkEmails().length).toBe(0);
    expect(stdout).toContain("dry run");
    expect(stdout).toContain("alice@example.com");
  });

  it("reports zero sends when no contacts exist", async () => {
    const { exitCode, stdout } = await runCommand(ses, [
      "bulk-send",
      "my-template",
    ]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("to 0 recipients");
  });

  it("errors when template does not exist", async () => {
    await runCommand(ses, ["contacts", "add", "alice@example.com"]);

    const { exitCode, stderr } = await runCommand(ses, [
      "bulk-send",
      "nonexistent-template",
    ]);

    expect(exitCode).toBe(1);
    expect(stderr).toContain("nonexistent-template");
  });

  it("reports partial failures from bulk send results", async () => {
    ses = createMockSesService({
      sendBulkEmailBehavior: (entries) =>
        entries.map((e: { to: string }) => ({
          status: e.to === "bob@example.com" ? "FAILED" : "SUCCESS",
          messageId:
            e.to === "bob@example.com" ? undefined : `msg-${e.to}`,
          error:
            e.to === "bob@example.com" ? "Rendering failure" : undefined,
        })),
    });
    await runCommand(ses, ["init"]);
    await ses.createTemplate("my-template", {
      subject: "Hello {{name}}",
      html: "<p>Hi {{name}}</p>",
    });
    await ses.createContact("test-newsletter", "alice@example.com", "test-topic");
    await ses.createContact("test-newsletter", "bob@example.com", "test-topic");
    await ses.createContact("test-newsletter", "charlie@example.com", "test-topic");

    const { exitCode, stdout, stderr } = await runCommand(ses, [
      "bulk-send",
      "my-template",
    ]);

    expect(exitCode).toBe(1);
    expect(stdout).toContain("to 2 recipients");
    expect(stderr).toContain("bob@example.com");
    expect(stderr).toContain("Failed to send to 1");
  });

  it("sets exit code 1 when all sends fail", async () => {
    ses = createMockSesService({
      sendBulkEmailBehavior: () => [
        {
          status: "ACCOUNT_SUSPENDED",
          error: "Account is suspended",
        },
      ],
    });
    await runCommand(ses, ["init"]);
    await ses.createTemplate("my-template", {
      subject: "Hello",
      html: "<p>Hi</p>",
    });
    await ses.createContact("test-newsletter", "alice@example.com", "test-topic");

    const { exitCode, stderr } = await runCommand(ses, [
      "bulk-send",
      "my-template",
    ]);

    expect(exitCode).toBe(1);
    expect(stderr).toContain("alice@example.com");
  });

  it("rejects invalid --data JSON", async () => {
    await runCommand(ses, ["contacts", "add", "alice@example.com"]);

    const { exitCode, stderr } = await runCommand(ses, [
      "bulk-send",
      "my-template",
      "--data",
      "not-valid-json",
    ]);

    expect(exitCode).toBe(1);
    expect(stderr).toContain("Invalid JSON");
  });

  it("rejects invalid test recipient emails", async () => {
    const { exitCode, stderr } = await runCommand(ses, [
      "bulk-send",
      "my-template",
      "--test",
      "not-an-email,also-bad",
    ]);

    expect(exitCode).toBe(1);
    expect(stderr).toContain("Invalid");
    expect(ses.getSentBulkEmails().length).toBe(0);
  });
});
