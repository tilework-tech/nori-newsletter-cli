import { describe, it, expect, beforeEach } from "vitest";
import {
  createMockSesService,
  runCommand,
  MockSesService,
} from "../helpers.js";

describe("identities command", () => {
  let ses: MockSesService;

  beforeEach(() => {
    ses = createMockSesService();
  });

  describe("list", () => {
    it("shows empty state when no identities exist", async () => {
      const { stdout, exitCode } = await runCommand(ses, [
        "identities",
        "list",
      ]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("0 identities");
    });

    it("shows singular label for one identity", async () => {
      await ses.createIdentity("test@example.com");

      const { stdout, exitCode } = await runCommand(ses, [
        "identities",
        "list",
      ]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("1 identity:");
    });

    it("lists identities with name, type, and verification status", async () => {
      await ses.createIdentity("test@example.com");
      await ses.createIdentity("example.com");

      const { stdout, exitCode } = await runCommand(ses, [
        "identities",
        "list",
      ]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("test@example.com");
      expect(stdout).toContain("EMAIL_ADDRESS");
      expect(stdout).toContain("example.com");
      expect(stdout).toContain("DOMAIN");
      expect(stdout).toContain("PENDING");
    });
  });

  describe("verify", () => {
    it("verifies an email address and shows verification email message", async () => {
      const { stdout, exitCode } = await runCommand(ses, [
        "identities",
        "verify",
        "test@example.com",
      ]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("test@example.com");
      expect(stdout).toContain("verification email");
      expect(ses.getIdentityCount()).toBe(1);
    });

    it("verifies a domain and shows DKIM CNAME records", async () => {
      const { stdout, exitCode } = await runCommand(ses, [
        "identities",
        "verify",
        "example.com",
      ]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("example.com");
      expect(stdout).toContain("CNAME");
      expect(stdout).toContain("_domainkey");
      expect(ses.getIdentityCount()).toBe(1);
    });

    it("fails when identity already exists", async () => {
      await ses.createIdentity("test@example.com");

      const { stderr, exitCode } = await runCommand(ses, [
        "identities",
        "verify",
        "test@example.com",
      ]);

      expect(exitCode).toBe(1);
      expect(stderr).toContain("already exists");
    });
  });

  describe("show", () => {
    it("shows details for an email identity", async () => {
      await ses.createIdentity("test@example.com");

      const { stdout, exitCode } = await runCommand(ses, [
        "identities",
        "show",
        "test@example.com",
      ]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("test@example.com");
      expect(stdout).toContain("EMAIL_ADDRESS");
      expect(stdout).toContain("PENDING");
    });

    it("shows details for a domain identity including DKIM info", async () => {
      await ses.createIdentity("example.com");

      const { stdout, exitCode } = await runCommand(ses, [
        "identities",
        "show",
        "example.com",
      ]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("example.com");
      expect(stdout).toContain("DOMAIN");
      expect(stdout).toContain("DKIM");
      expect(stdout).toContain("mock-token-1");
    });

    it("returns error for non-existent identity", async () => {
      const { stderr, exitCode } = await runCommand(ses, [
        "identities",
        "show",
        "nonexistent@example.com",
      ]);

      expect(exitCode).toBe(1);
      expect(stderr).toContain("not found");
    });
  });

  describe("delete", () => {
    it("deletes an existing identity", async () => {
      await ses.createIdentity("test@example.com");
      expect(ses.getIdentityCount()).toBe(1);

      const { stdout, exitCode } = await runCommand(ses, [
        "identities",
        "delete",
        "test@example.com",
      ]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("Deleted");
      expect(stdout).toContain("test@example.com");
      expect(ses.getIdentityCount()).toBe(0);
    });

    it("returns error for non-existent identity", async () => {
      const { stderr, exitCode } = await runCommand(ses, [
        "identities",
        "delete",
        "nonexistent@example.com",
      ]);

      expect(exitCode).toBe(1);
      expect(stderr).toContain("not found");
    });
  });
});
