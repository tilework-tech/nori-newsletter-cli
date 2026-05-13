import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createMockSesService, runCommand, TEST_CONFIG } from "../helpers.js";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("send command", () => {
  let ses: ReturnType<typeof createMockSesService>;
  let tempDir: string;
  let htmlPath: string;

  const sampleHtml = `<!DOCTYPE html>
<html><head><title>Weekly Update - May 2026</title></head>
<body><p>Hello subscribers!</p></body></html>`;

  beforeEach(async () => {
    ses = createMockSesService();
    await runCommand(ses, ["init"]);
    tempDir = mkdtempSync(join(tmpdir(), "nori-test-"));
    htmlPath = join(tempDir, "newsletter.html");
    writeFileSync(htmlPath, sampleHtml);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("sends newsletter to all contacts", async () => {
    await runCommand(ses, ["contacts", "add", "alice@example.com"]);
    await runCommand(ses, ["contacts", "add", "bob@example.com"]);

    const { exitCode, stdout } = await runCommand(ses, ["send", htmlPath]);

    expect(exitCode).toBe(0);
    expect(ses.getSentEmailCount()).toBe(2);
    expect(ses.getSentEmails()[0].subject).toBe("Weekly Update - May 2026");
    expect(stdout).toContain("2");
  });

  it("uses from address and reply-to from config", async () => {
    await runCommand(ses, ["contacts", "add", "alice@example.com"]);

    await runCommand(ses, ["send", htmlPath]);

    const sent = ses.getSentEmails()[0];
    expect(sent.from).toBe(TEST_CONFIG.fromAddress);
    expect(sent.replyTo).toBe(TEST_CONFIG.replyTo);
    expect(sent.listName).toBe(TEST_CONFIG.contactListName);
    expect(sent.topicName).toBe(TEST_CONFIG.topicName);
  });

  it("sends to test recipients only with --test", async () => {
    await runCommand(ses, ["contacts", "add", "alice@example.com"]);

    const { exitCode } = await runCommand(ses, [
      "send",
      htmlPath,
      "--test",
      "test1@example.com,test2@example.com",
    ]);

    expect(exitCode).toBe(0);
    expect(ses.getSentEmailCount()).toBe(2);
    const sent = ses.getSentEmails();
    expect(sent[0].to).toBe("test1@example.com");
    expect(sent[1].to).toBe("test2@example.com");
  });

  it("does not send with --dry-run", async () => {
    await runCommand(ses, ["contacts", "add", "alice@example.com"]);

    const { exitCode, stdout } = await runCommand(ses, [
      "send",
      htmlPath,
      "--dry-run",
    ]);

    expect(exitCode).toBe(0);
    expect(ses.getSentEmailCount()).toBe(0);
    expect(stdout).toContain("dry run");
  });

  it("reports zero sends when no contacts exist", async () => {
    const { exitCode, stdout } = await runCommand(ses, ["send", htmlPath]);

    expect(exitCode).toBe(0);
    expect(ses.getSentEmailCount()).toBe(0);
    expect(stdout).toContain("0");
  });

  it("fails when HTML file does not exist", async () => {
    const { exitCode } = await runCommand(ses, [
      "send",
      "/nonexistent/file.html",
    ]);

    expect(exitCode).not.toBe(0);
  });

  it("uses filename as fallback subject when title is missing", async () => {
    const noTitlePath = join(tempDir, "2026-05-08.html");
    writeFileSync(noTitlePath, "<html><body>Hello</body></html>");

    await runCommand(ses, ["contacts", "add", "alice@example.com"]);

    const { exitCode } = await runCommand(ses, ["send", noTitlePath]);

    expect(exitCode).toBe(0);
    expect(ses.getSentEmails()[0].subject).toBe("2026-05-08");
  });

  it("rejects invalid test recipient emails", async () => {
    const { exitCode } = await runCommand(ses, [
      "send",
      htmlPath,
      "--test",
      "not-an-email,also-bad",
    ]);

    expect(exitCode).not.toBe(0);
    expect(ses.getSentEmailCount()).toBe(0);
  });

  it("continues sending after individual failures and reports them", async () => {
    const failFor = new Set(["fail1@example.com", "fail3@example.com"]);
    ses = createMockSesService({
      sendEmailBehavior: (to) => {
        if (failFor.has(to)) {
          throw new Error("Throttling: Maximum sending rate exceeded");
        }
        return `msg-${to}`;
      },
    });
    await runCommand(ses, ["init"]);

    const { exitCode, stdout, stderr } = await runCommand(ses, [
      "send",
      htmlPath,
      "--test",
      "ok1@example.com,fail1@example.com,ok2@example.com,fail3@example.com,ok3@example.com",
    ]);

    expect(ses.getSentEmailCount()).toBe(3);
    expect(exitCode).toBe(1);
    expect(stderr).toContain("fail1@example.com");
    expect(stderr).toContain("fail3@example.com");
    expect(stdout).toContain("3");
  });
});
