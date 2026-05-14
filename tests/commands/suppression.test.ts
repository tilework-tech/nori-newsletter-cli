import { describe, it, expect, beforeEach } from "vitest";
import { createMockSesService, runCommand, type MockSesService } from "../helpers.js";

describe("suppression", () => {
  let ses: MockSesService;

  beforeEach(() => {
    ses = createMockSesService();
  });

  describe("list", () => {
    it("shows zero suppressed addresses when list is empty", async () => {
      const { stdout, exitCode } = await runCommand(ses, ["suppression", "list"]);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("0 suppressed addresses");
    });

    it("lists suppressed addresses with email, reason, and date", async () => {
      await runCommand(ses, ["suppression", "add", "bounce@example.com", "--reason", "BOUNCE"]);
      await runCommand(ses, ["suppression", "add", "complaint@example.com", "--reason", "COMPLAINT"]);

      const { stdout, exitCode } = await runCommand(ses, ["suppression", "list"]);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("2 suppressed addresses");
      expect(stdout).toContain("bounce@example.com");
      expect(stdout).toContain("BOUNCE");
      expect(stdout).toContain("complaint@example.com");
      expect(stdout).toContain("COMPLAINT");
    });

    it("filters by --reason BOUNCE", async () => {
      await runCommand(ses, ["suppression", "add", "bounce@example.com", "--reason", "BOUNCE"]);
      await runCommand(ses, ["suppression", "add", "complaint@example.com", "--reason", "COMPLAINT"]);

      const { stdout, exitCode } = await runCommand(ses, ["suppression", "list", "--reason", "BOUNCE"]);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("1 suppressed address");
      expect(stdout).toContain("bounce@example.com");
      expect(stdout).not.toContain("complaint@example.com");
    });

    it("filters by --reason COMPLAINT", async () => {
      await runCommand(ses, ["suppression", "add", "bounce@example.com", "--reason", "BOUNCE"]);
      await runCommand(ses, ["suppression", "add", "complaint@example.com", "--reason", "COMPLAINT"]);

      const { stdout, exitCode } = await runCommand(ses, ["suppression", "list", "--reason", "COMPLAINT"]);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("1 suppressed address");
      expect(stdout).toContain("complaint@example.com");
      expect(stdout).not.toContain("bounce@example.com");
    });

    it("filters by --start-date", async () => {
      await runCommand(ses, ["suppression", "add", "old@example.com", "--reason", "BOUNCE"]);
      await runCommand(ses, ["suppression", "add", "new@example.com", "--reason", "BOUNCE"]);

      const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];
      const { stdout, exitCode } = await runCommand(ses, ["suppression", "list", "--start-date", tomorrow]);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("0 suppressed addresses");
    });

    it("filters by --end-date", async () => {
      await runCommand(ses, ["suppression", "add", "old@example.com", "--reason", "BOUNCE"]);

      const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
      const { stdout, exitCode } = await runCommand(ses, ["suppression", "list", "--end-date", yesterday]);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("0 suppressed addresses");
    });
  });

  describe("check", () => {
    it("shows details when address is suppressed", async () => {
      await runCommand(ses, ["suppression", "add", "bounce@example.com", "--reason", "BOUNCE"]);

      const { stdout, exitCode } = await runCommand(ses, ["suppression", "check", "bounce@example.com"]);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("bounce@example.com");
      expect(stdout).toContain("BOUNCE");
    });

    it("returns error when address is not suppressed", async () => {
      const { stderr, exitCode } = await runCommand(ses, ["suppression", "check", "clean@example.com"]);
      expect(exitCode).toBe(1);
      expect(stderr).toContain("not on the suppression list");
    });
  });

  describe("add", () => {
    it("adds address with BOUNCE reason", async () => {
      const { stdout, exitCode } = await runCommand(ses, ["suppression", "add", "bounce@example.com", "--reason", "BOUNCE"]);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("bounce@example.com");
      expect(stdout).toContain("suppression list");

      const { stdout: listOut } = await runCommand(ses, ["suppression", "list"]);
      expect(listOut).toContain("bounce@example.com");
    });

    it("adds address with COMPLAINT reason", async () => {
      const { stdout, exitCode } = await runCommand(ses, ["suppression", "add", "spam@example.com", "--reason", "COMPLAINT"]);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("spam@example.com");

      const { stdout: listOut } = await runCommand(ses, ["suppression", "list"]);
      expect(listOut).toContain("spam@example.com");
    });

    it("rejects invalid email", async () => {
      const { stderr, exitCode } = await runCommand(ses, ["suppression", "add", "not-an-email", "--reason", "BOUNCE"]);
      expect(exitCode).toBe(1);
      expect(stderr).toContain("not a valid email");
    });

    it("rejects invalid reason", async () => {
      const { stderr, exitCode } = await runCommand(ses, ["suppression", "add", "test@example.com", "--reason", "INVALID"]);
      expect(exitCode).toBe(1);
      expect(stderr).toContain("BOUNCE");
      expect(stderr).toContain("COMPLAINT");
    });

    it("updates reason when address is already suppressed", async () => {
      await runCommand(ses, ["suppression", "add", "test@example.com", "--reason", "BOUNCE"]);
      await runCommand(ses, ["suppression", "add", "test@example.com", "--reason", "COMPLAINT"]);

      const { stdout } = await runCommand(ses, ["suppression", "check", "test@example.com"]);
      expect(stdout).toContain("COMPLAINT");

      const { stdout: listOut } = await runCommand(ses, ["suppression", "list"]);
      expect(listOut).toContain("1 suppressed address");
    });
  });

  describe("remove", () => {
    it("removes a suppressed address", async () => {
      await runCommand(ses, ["suppression", "add", "bounce@example.com", "--reason", "BOUNCE"]);

      const { stdout, exitCode } = await runCommand(ses, ["suppression", "remove", "bounce@example.com"]);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("Removed");
      expect(stdout).toContain("bounce@example.com");

      const { stdout: listOut } = await runCommand(ses, ["suppression", "list"]);
      expect(listOut).toContain("0 suppressed addresses");
    });

    it("returns error when address is not suppressed", async () => {
      const { stderr, exitCode } = await runCommand(ses, ["suppression", "remove", "clean@example.com"]);
      expect(exitCode).toBe(1);
      expect(stderr).toContain("not on the suppression list");
    });
  });
});
