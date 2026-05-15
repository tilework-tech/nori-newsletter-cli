import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createMockSesService, runCommand, TEST_CONFIG } from "../helpers.js";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("send-safe command", () => {
  let ses: ReturnType<typeof createMockSesService>;
  let tempDir: string;
  let htmlPath: string;

  const sampleHtml = `<!DOCTYPE html>
<html><head><title>Safe Send Test</title></head>
<body><p>Hello subscribers!</p></body></html>`;

  beforeEach(async () => {
    ses = createMockSesService({
      seedIdentities: [{ name: "test@example.com" }],
    });
    await runCommand(ses, ["init"]);
    tempDir = mkdtempSync(join(tmpdir(), "nori-send-safe-"));
    htmlPath = join(tempDir, "newsletter.html");
    writeFileSync(htmlPath, sampleHtml);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("sends to all non-suppressed contacts after passing preflight checks", async () => {
    await runCommand(ses, ["contacts", "add", "alice@example.com"]);
    await runCommand(ses, ["contacts", "add", "bob@example.com"]);
    await runCommand(ses, ["contacts", "add", "bounced@example.com"]);
    await ses.putSuppressedDestination("bounced@example.com", "BOUNCE");

    const { exitCode, stdout } = await runCommand(ses, ["send-safe", htmlPath]);

    expect(exitCode).toBe(0);
    expect(ses.getSentEmailCount()).toBe(2);
    expect(stdout).toContain("[PASS]");
    expect(stdout).toContain("2");
    const sentEmails = ses.getSentEmails().map((e) => e.to).sort();
    expect(sentEmails).toEqual(["alice@example.com", "bob@example.com"]);
  });

  it("aborts when sending is disabled", async () => {
    ses = createMockSesService({
      seedIdentities: [{ name: "test@example.com" }],
      accountInfo: { sendingEnabled: false },
    });
    await runCommand(ses, ["init"]);
    await runCommand(ses, ["contacts", "add", "alice@example.com"]);

    const { exitCode, stdout } = await runCommand(ses, ["send-safe", htmlPath]);

    expect(exitCode).toBe(1);
    expect(stdout).toContain("[FAIL]");
    expect(stdout).toMatch(/disabled/i);
    expect(ses.getSentEmailCount()).toBe(0);
  });

  it("aborts when identity is not verified", async () => {
    ses = createMockSesService({
      seedIdentities: [
        {
          name: "test@example.com",
          verifiedForSending: false,
          verificationStatus: "PENDING",
        },
      ],
    });
    await runCommand(ses, ["init"]);
    await runCommand(ses, ["contacts", "add", "alice@example.com"]);

    const { exitCode, stdout } = await runCommand(ses, ["send-safe", htmlPath]);

    expect(exitCode).toBe(1);
    expect(stdout).toContain("[FAIL]");
    expect(stdout).toMatch(/not verified/i);
    expect(ses.getSentEmailCount()).toBe(0);
  });

  it("warns on sandbox mode but continues sending", async () => {
    ses = createMockSesService({
      seedIdentities: [{ name: "test@example.com" }],
      accountInfo: { productionAccessEnabled: false },
    });
    await runCommand(ses, ["init"]);
    await runCommand(ses, ["contacts", "add", "alice@example.com"]);

    const { exitCode, stdout } = await runCommand(ses, ["send-safe", htmlPath]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("[WARN]");
    expect(stdout).toMatch(/sandbox/i);
    expect(ses.getSentEmailCount()).toBe(1);
  });

  it("warns on enforcement probation but continues sending", async () => {
    ses = createMockSesService({
      seedIdentities: [{ name: "test@example.com" }],
      accountInfo: { enforcementStatus: "PROBATION" },
    });
    await runCommand(ses, ["init"]);
    await runCommand(ses, ["contacts", "add", "alice@example.com"]);

    const { exitCode, stdout } = await runCommand(ses, ["send-safe", htmlPath]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("[WARN]");
    expect(stdout).toContain("PROBATION");
    expect(ses.getSentEmailCount()).toBe(1);
  });

  it("warns when quota headroom is insufficient for recipient count", async () => {
    ses = createMockSesService({
      seedIdentities: [{ name: "test@example.com" }],
      accountInfo: { sentLast24Hours: 49998, max24HourSend: 50000 },
    });
    await runCommand(ses, ["init"]);
    await runCommand(ses, ["contacts", "add", "alice@example.com"]);
    await runCommand(ses, ["contacts", "add", "bob@example.com"]);
    await runCommand(ses, ["contacts", "add", "carol@example.com"]);

    const { stdout } = await runCommand(ses, ["send-safe", htmlPath]);

    expect(stdout).toContain("[WARN]");
    expect(stdout).toMatch(/quota/i);
  });

  it("aborts when identity is not found", async () => {
    ses = createMockSesService();
    await runCommand(ses, ["init"]);
    await runCommand(ses, ["contacts", "add", "alice@example.com"]);

    const { exitCode, stdout } = await runCommand(ses, ["send-safe", htmlPath]);

    expect(exitCode).toBe(1);
    expect(stdout).toContain("[FAIL]");
    expect(stdout).toMatch(/not found/i);
    expect(ses.getSentEmailCount()).toBe(0);
  });

  it("runs checks and shows plan in dry-run mode without sending", async () => {
    await runCommand(ses, ["contacts", "add", "alice@example.com"]);
    await runCommand(ses, ["contacts", "add", "bounced@example.com"]);
    await ses.putSuppressedDestination("bounced@example.com", "BOUNCE");

    const { exitCode, stdout } = await runCommand(ses, [
      "send-safe",
      htmlPath,
      "--dry-run",
    ]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("[PASS]");
    expect(stdout).toMatch(/dry run/i);
    expect(stdout).toContain("alice@example.com");
    expect(ses.getSentEmailCount()).toBe(0);
  });

  it("sends to test recipients without running preflight", async () => {
    const { exitCode, stdout } = await runCommand(ses, [
      "send-safe",
      htmlPath,
      "--test",
      "testuser@example.com",
    ]);

    expect(exitCode).toBe(0);
    expect(ses.getSentEmailCount()).toBe(1);
    expect(ses.getSentEmails()[0].to).toBe("testuser@example.com");
    expect(stdout).not.toContain("[PASS]");
    expect(stdout).not.toContain("[FAIL]");
  });

  it("reports zero recipients when no contacts exist", async () => {
    const { exitCode, stdout } = await runCommand(ses, ["send-safe", htmlPath]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("Sent to 0 recipients");
    expect(ses.getSentEmailCount()).toBe(0);
  });

  it("reports partial failures when some sends fail", async () => {
    const failFor = new Set(["fail@example.com"]);
    ses = createMockSesService({
      seedIdentities: [{ name: "test@example.com" }],
      sendEmailBehavior: (to) => {
        if (failFor.has(to)) throw new Error("MessageRejected");
        return `msg-${to}`;
      },
    });
    await runCommand(ses, ["init"]);
    await runCommand(ses, ["contacts", "add", "ok@example.com"]);
    await runCommand(ses, ["contacts", "add", "fail@example.com"]);

    const { exitCode, stdout, stderr } = await runCommand(ses, [
      "send-safe",
      htmlPath,
    ]);

    expect(ses.getSentEmailCount()).toBe(1);
    expect(exitCode).toBe(1);
    expect(stderr).toContain("fail@example.com");
    expect(stdout).toContain("Sent 'Safe Send Test' to 1 recipients");
  });

  it("reports zero recipients after filtering when all contacts are suppressed", async () => {
    await runCommand(ses, ["contacts", "add", "bounced1@example.com"]);
    await runCommand(ses, ["contacts", "add", "bounced2@example.com"]);
    await ses.putSuppressedDestination("bounced1@example.com", "BOUNCE");
    await ses.putSuppressedDestination("bounced2@example.com", "COMPLAINT");

    const { exitCode, stdout } = await runCommand(ses, ["send-safe", htmlPath]);

    expect(exitCode).toBe(0);
    expect(ses.getSentEmailCount()).toBe(0);
    expect(stdout).toContain("Sent to 0 recipients");
    expect(stdout).toMatch(/filtered/i);
  });

  it("rejects invalid test recipient emails", async () => {
    const { exitCode, stderr } = await runCommand(ses, [
      "send-safe",
      htmlPath,
      "--test",
      "not-an-email,also-bad",
    ]);

    expect(exitCode).not.toBe(0);
    expect(ses.getSentEmailCount()).toBe(0);
    expect(stderr).toContain("Invalid");
  });

  it("fails when HTML file does not exist", async () => {
    const { exitCode } = await runCommand(ses, [
      "send-safe",
      "/nonexistent/file.html",
    ]);

    expect(exitCode).not.toBe(0);
  });
});
