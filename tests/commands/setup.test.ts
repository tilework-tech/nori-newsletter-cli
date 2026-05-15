import { describe, it, expect } from "vitest";
import { createMockSesService, runCommand, TEST_CONFIG } from "../helpers.js";

describe("setup command", () => {
  describe("check", () => {
    it("reports all OK when account, identity, and contact list are configured", async () => {
      const ses = createMockSesService({
        seedIdentities: [{ name: "test@example.com" }],
      });
      await ses.createContactList(TEST_CONFIG.contactListName, TEST_CONFIG.topicName);

      const { stdout, exitCode } = await runCommand(ses, ["setup", "check"]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("[OK]");
      expect(stdout).toContain("test@example.com");
      expect(stdout).toContain(TEST_CONFIG.contactListName);
    });

    it("reports MISSING when identity does not exist", async () => {
      const ses = createMockSesService();
      await ses.createContactList(TEST_CONFIG.contactListName, TEST_CONFIG.topicName);

      const { stdout, exitCode } = await runCommand(ses, ["setup", "check"]);

      expect(exitCode).toBe(1);
      expect(stdout).toContain("[MISSING]");
      expect(stdout).toContain("test@example.com");
    });

    it("reports PENDING when identity is not yet verified", async () => {
      const ses = createMockSesService({
        seedIdentities: [{
          name: "test@example.com",
          verificationStatus: "PENDING",
          verifiedForSending: false,
        }],
      });
      await ses.createContactList(TEST_CONFIG.contactListName, TEST_CONFIG.topicName);

      const { stdout, exitCode } = await runCommand(ses, ["setup", "check"]);

      expect(exitCode).toBe(1);
      expect(stdout).toContain("[PENDING]");
    });

    it("reports MISSING when contact list does not exist", async () => {
      const ses = createMockSesService({
        seedIdentities: [{ name: "test@example.com" }],
      });

      const { stdout, exitCode } = await runCommand(ses, ["setup", "check"]);

      expect(exitCode).toBe(1);
      expect(stdout).toContain("[MISSING]");
      expect(stdout).toContain(TEST_CONFIG.contactListName);
    });

    it("warns when account is in sandbox mode", async () => {
      const ses = createMockSesService({
        accountInfo: { productionAccessEnabled: false },
        seedIdentities: [{ name: "test@example.com" }],
      });
      await ses.createContactList(TEST_CONFIG.contactListName, TEST_CONFIG.topicName);

      const { stdout, exitCode } = await runCommand(ses, ["setup", "check"]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("[WARN]");
      expect(stdout).toContain("Sandbox");
    });

    it("reports FAIL when sending is disabled", async () => {
      const ses = createMockSesService({
        accountInfo: { sendingEnabled: false },
        seedIdentities: [{ name: "test@example.com" }],
      });
      await ses.createContactList(TEST_CONFIG.contactListName, TEST_CONFIG.topicName);

      const { stdout, exitCode } = await runCommand(ses, ["setup", "check"]);

      expect(exitCode).toBe(1);
      expect(stdout).toContain("[FAIL]");
    });
  });

  describe("run", () => {
    it("creates identity and contact list from scratch", async () => {
      const ses = createMockSesService();

      const { stdout, exitCode } = await runCommand(ses, ["setup", "run"]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("Created");

      const { stdout: checkOut } = await runCommand(ses, ["setup", "check"]);
      expect(checkOut).toContain("[OK]");
      expect(checkOut).not.toContain("[MISSING]");
    });

    it("skips existing identity and creates contact list", async () => {
      const ses = createMockSesService({
        seedIdentities: [{ name: "test@example.com" }],
      });

      const { stdout, exitCode } = await runCommand(ses, ["setup", "run"]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("already exists");

      const { stdout: checkOut } = await runCommand(ses, ["setup", "check"]);
      expect(checkOut).toContain("[OK]");
      expect(checkOut).not.toContain("[MISSING]");
    });

    it("skips existing contact list and creates identity", async () => {
      const ses = createMockSesService();
      await ses.createContactList(TEST_CONFIG.contactListName, TEST_CONFIG.topicName);

      const { stdout, exitCode } = await runCommand(ses, ["setup", "run"]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("already exists");

      const { stdout: checkOut } = await runCommand(ses, ["setup", "check"]);
      expect(checkOut).not.toContain("[MISSING]");
    });

    it("reports all exist when nothing needs to be created", async () => {
      const ses = createMockSesService({
        seedIdentities: [{ name: "test@example.com" }],
      });
      await ses.createContactList(TEST_CONFIG.contactListName, TEST_CONFIG.topicName);

      const { stdout, exitCode } = await runCommand(ses, ["setup", "run"]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("already exists");
    });

    it("shows DKIM records when creating a domain identity", async () => {
      const ses = createMockSesService();
      const domainConfig = {
        ...TEST_CONFIG,
        fromAddress: "example.com",
      };

      const { stdout, exitCode } = await runCommand(ses, ["setup", "run"], domainConfig);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("DKIM");
      expect(stdout).toContain("mock-token");
    });

    it("shows verification instructions when creating an email identity", async () => {
      const ses = createMockSesService();

      const { stdout, exitCode } = await runCommand(ses, ["setup", "run"]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("verification email");
      expect(stdout).toContain("test@example.com");
    });
  });
});
