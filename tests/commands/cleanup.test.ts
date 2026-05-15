import { describe, it, expect } from "vitest";
import { createMockSesService, runCommand, TEST_CONFIG } from "../helpers.js";

describe("cleanup command", () => {
  async function seedOverlap(ses: ReturnType<typeof createMockSesService>) {
    await ses.createContactList(TEST_CONFIG.contactListName, TEST_CONFIG.topicName);
    await ses.createContact(TEST_CONFIG.contactListName, "good@example.com", TEST_CONFIG.topicName);
    await ses.createContact(TEST_CONFIG.contactListName, "bounced@example.com", TEST_CONFIG.topicName);
    await ses.createContact(TEST_CONFIG.contactListName, "complained@example.com", TEST_CONFIG.topicName);
    await ses.putSuppressedDestination("bounced@example.com", "BOUNCE");
    await ses.putSuppressedDestination("complained@example.com", "COMPLAINT");
  }

  describe("report", () => {
    it("shows overlapping contacts with suppression reasons", async () => {
      const ses = createMockSesService();
      await seedOverlap(ses);

      const { stdout, exitCode } = await runCommand(ses, ["cleanup", "report"]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("bounced@example.com");
      expect(stdout).toContain("BOUNCE");
      expect(stdout).toContain("complained@example.com");
      expect(stdout).toContain("COMPLAINT");
      expect(stdout).toContain("2");
    });

    it("shows no overlap message when lists do not intersect", async () => {
      const ses = createMockSesService();
      await ses.createContactList(TEST_CONFIG.contactListName, TEST_CONFIG.topicName);
      await ses.createContact(TEST_CONFIG.contactListName, "good@example.com", TEST_CONFIG.topicName);
      await ses.putSuppressedDestination("other@example.com", "BOUNCE");

      const { stdout, exitCode } = await runCommand(ses, ["cleanup", "report"]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("No suppressed contacts");
    });

    it("handles case-insensitive matching", async () => {
      const ses = createMockSesService();
      await ses.createContactList(TEST_CONFIG.contactListName, TEST_CONFIG.topicName);
      await ses.createContact(TEST_CONFIG.contactListName, "User@Example.com", TEST_CONFIG.topicName);
      await ses.putSuppressedDestination("user@example.com", "BOUNCE");

      const { stdout } = await runCommand(ses, ["cleanup", "report"]);

      expect(stdout).toContain("User@Example.com");
      expect(stdout).toContain("1");
    });

    it("works with empty contact list", async () => {
      const ses = createMockSesService();
      await ses.putSuppressedDestination("bounced@example.com", "BOUNCE");

      const { stdout, exitCode } = await runCommand(ses, ["cleanup", "report"]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("No suppressed contacts");
    });
  });

  describe("run", () => {
    it("unsubscribes overlapping contacts by default with --confirm", async () => {
      const ses = createMockSesService();
      await seedOverlap(ses);

      const { stdout, exitCode } = await runCommand(ses, ["cleanup", "run", "--confirm"]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("2");
      expect(stdout).toContain("unsubscribed");

      const { stdout: report } = await runCommand(ses, ["cleanup", "report"]);
      expect(report).toContain("No suppressed contacts");
    });

    it("removes overlapping contacts with --action remove", async () => {
      const ses = createMockSesService();
      await seedOverlap(ses);

      const { stdout, exitCode } = await runCommand(ses, [
        "cleanup",
        "run",
        "--action",
        "remove",
        "--confirm",
      ]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("2");
      expect(stdout).toContain("removed");

      const { stdout: report } = await runCommand(ses, ["cleanup", "report"]);
      expect(report).toContain("No suppressed contacts");
    });

    it("refuses without --confirm", async () => {
      const ses = createMockSesService();
      await seedOverlap(ses);

      const { stderr, exitCode } = await runCommand(ses, ["cleanup", "run"]);

      expect(exitCode).toBe(1);
      expect(stderr).toContain("--confirm");
    });

    it("rejects invalid --action value", async () => {
      const ses = createMockSesService();
      await seedOverlap(ses);

      const { stderr, exitCode } = await runCommand(ses, [
        "cleanup",
        "run",
        "--action",
        "delete",
        "--confirm",
      ]);

      expect(exitCode).toBe(1);
      expect(stderr).toContain("Invalid action");
    });
  });
});
