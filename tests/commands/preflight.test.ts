import { describe, it, expect } from "vitest";
import { createMockSesService, runCommand, TEST_CONFIG } from "../helpers.js";

describe("preflight command", () => {
  function seedFullSetup(ses: ReturnType<typeof createMockSesService>) {
    return Promise.all([
      ses.createContactList(TEST_CONFIG.contactListName, TEST_CONFIG.topicName),
      ses.createTemplate("weekly", { subject: "Hello", html: "<p>Hi</p>" }),
    ]).then(() =>
      ses.createContact(TEST_CONFIG.contactListName, "a@example.com", TEST_CONFIG.topicName)
    );
  }

  it("all checks pass", async () => {
    const ses = createMockSesService({
      seedIdentities: [{ name: "test@example.com" }],
    });
    await seedFullSetup(ses);

    const { stdout, exitCode } = await runCommand(ses, ["preflight", "weekly"]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("PASS");
    expect(stdout).not.toContain("FAIL");
  });

  it("fails when identity not verified", async () => {
    const ses = createMockSesService({
      seedIdentities: [{ name: "test@example.com", verifiedForSending: false, verificationStatus: "PENDING" }],
    });
    await seedFullSetup(ses);

    const { stdout, exitCode } = await runCommand(ses, ["preflight", "weekly"]);

    expect(exitCode).toBe(1);
    expect(stdout).toContain("FAIL");
    expect(stdout).toContain("not verified");
  });

  it("fails when template not found", async () => {
    const ses = createMockSesService({
      seedIdentities: [{ name: "test@example.com" }],
    });
    await ses.createContactList(TEST_CONFIG.contactListName, TEST_CONFIG.topicName);
    await ses.createContact(TEST_CONFIG.contactListName, "a@example.com", TEST_CONFIG.topicName);

    const { stdout, exitCode } = await runCommand(ses, ["preflight", "nonexistent"]);

    expect(exitCode).toBe(1);
    expect(stdout).toContain("FAIL");
    expect(stdout).toContain("not found");
  });

  it("warns on suppression overlap", async () => {
    const ses = createMockSesService({
      seedIdentities: [{ name: "test@example.com" }],
    });
    await seedFullSetup(ses);
    await ses.createContact(TEST_CONFIG.contactListName, "bounced@example.com", TEST_CONFIG.topicName);
    await ses.putSuppressedDestination("bounced@example.com", "BOUNCE");

    const { stdout, exitCode } = await runCommand(ses, ["preflight", "weekly"]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("WARN");
    expect(stdout).toContain("1");
    expect(stdout).toContain("suppres");
  });

  it("warns when no contacts", async () => {
    const ses = createMockSesService({
      seedIdentities: [{ name: "test@example.com" }],
    });
    await ses.createContactList(TEST_CONFIG.contactListName, TEST_CONFIG.topicName);
    await ses.createTemplate("weekly", { subject: "Hello", html: "<p>Hi</p>" });

    const { stdout } = await runCommand(ses, ["preflight", "weekly"]);

    expect(stdout).toContain("WARN");
    expect(stdout).toContain("0");
  });

  it("reports quota headroom warning", async () => {
    const ses = createMockSesService({
      seedIdentities: [{ name: "test@example.com" }],
      accountInfo: { sentLast24Hours: 49998, max24HourSend: 50000 },
    });
    await seedFullSetup(ses);
    await ses.createContact(TEST_CONFIG.contactListName, "b@example.com", TEST_CONFIG.topicName);
    await ses.createContact(TEST_CONFIG.contactListName, "c@example.com", TEST_CONFIG.topicName);

    const { stdout } = await runCommand(ses, ["preflight", "weekly"]);

    expect(stdout).toContain("WARN");
    expect(stdout).toContain("quota");
  });

  it("template render with --data succeeds", async () => {
    const ses = createMockSesService({
      seedIdentities: [{ name: "test@example.com" }],
    });
    await ses.createContactList(TEST_CONFIG.contactListName, TEST_CONFIG.topicName);
    await ses.createContact(TEST_CONFIG.contactListName, "a@example.com", TEST_CONFIG.topicName);
    await ses.createTemplate("weekly", { subject: "Hello {{name}}", html: "<p>Hi {{name}}</p>" });

    const { stdout, exitCode } = await runCommand(ses, [
      "preflight",
      "weekly",
      "--data",
      '{"name":"World"}',
    ]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("PASS");
  });

  it("fails when sending disabled", async () => {
    const ses = createMockSesService({
      seedIdentities: [{ name: "test@example.com" }],
      accountInfo: { sendingEnabled: false },
    });
    await seedFullSetup(ses);

    const { stdout, exitCode } = await runCommand(ses, ["preflight", "weekly"]);

    expect(exitCode).toBe(1);
    expect(stdout).toContain("FAIL");
    expect(stdout).toContain("disabled");
  });
});
