import { describe, it, expect, beforeEach } from "vitest";
import { createMockSesService, runCommand, type MockSesService } from "../helpers.js";

describe("lists", () => {
  let ses: MockSesService;

  beforeEach(() => {
    ses = createMockSesService();
  });

  describe("list", () => {
    it("shows zero contact lists when none exist", async () => {
      const { stdout, exitCode } = await runCommand(ses, ["lists", "list"]);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("0 contact lists");
    });

    it("lists contact lists with name and timestamp after creating some", async () => {
      await runCommand(ses, ["init"]);

      const { stdout, exitCode } = await runCommand(ses, ["lists", "list"]);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("1 contact list");
      expect(stdout).toContain("test-newsletter");
    });

    it("uses singular label for exactly one result", async () => {
      await runCommand(ses, ["init"]);

      const { stdout } = await runCommand(ses, ["lists", "list"]);
      expect(stdout).toContain("1 contact list:");
      expect(stdout).not.toContain("1 contact lists");
    });
  });

  describe("show", () => {
    it("shows full details for an existing list", async () => {
      await runCommand(ses, ["init"]);

      const { stdout, exitCode } = await runCommand(ses, ["lists", "show", "test-newsletter"]);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("test-newsletter");
      expect(stdout).toContain("Newsletter subscribers");
      expect(stdout).toContain("test-topic");
      expect(stdout).toContain("Weekly Newsletter");
      expect(stdout).toContain("OPT_IN");
    });

    it("returns error when list does not exist", async () => {
      const { stderr, exitCode } = await runCommand(ses, ["lists", "show", "nonexistent"]);
      expect(exitCode).toBe(1);
      expect(stderr).toContain("nonexistent");
      expect(stderr).toContain("not found");
    });

    it("shows list with no topics gracefully", async () => {
      await runCommand(ses, ["init"]);
      await runCommand(ses, ["lists", "update", "test-newsletter", "--remove-topic", "test-topic"]);

      const { stdout, exitCode } = await runCommand(ses, ["lists", "show", "test-newsletter"]);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("test-newsletter");
      expect(stdout).toContain("No topics");
    });
  });

  describe("update", () => {
    it("updates description", async () => {
      await runCommand(ses, ["init"]);

      const { stdout, exitCode } = await runCommand(ses, [
        "lists", "update", "test-newsletter", "--description", "Updated description",
      ]);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("Updated");

      const { stdout: showOut } = await runCommand(ses, ["lists", "show", "test-newsletter"]);
      expect(showOut).toContain("Updated description");
    });

    it("adds a topic", async () => {
      await runCommand(ses, ["init"]);

      const { stdout, exitCode } = await runCommand(ses, [
        "lists", "update", "test-newsletter",
        "--add-topic", "announcements:Announcements:OPT_OUT",
      ]);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("Updated");

      const { stdout: showOut } = await runCommand(ses, ["lists", "show", "test-newsletter"]);
      expect(showOut).toContain("announcements");
      expect(showOut).toContain("Announcements");
      expect(showOut).toContain("test-topic");
    });

    it("removes a topic", async () => {
      await runCommand(ses, ["init"]);

      const { exitCode } = await runCommand(ses, [
        "lists", "update", "test-newsletter", "--remove-topic", "test-topic",
      ]);
      expect(exitCode).toBe(0);

      const { stdout: showOut } = await runCommand(ses, ["lists", "show", "test-newsletter"]);
      expect(showOut).not.toContain("test-topic");
    });

    it("returns error when list does not exist", async () => {
      const { stderr, exitCode } = await runCommand(ses, [
        "lists", "update", "nonexistent", "--description", "new desc",
      ]);
      expect(exitCode).toBe(1);
      expect(stderr).toContain("nonexistent");
      expect(stderr).toContain("not found");
    });

    it("returns error when removing a non-existent topic", async () => {
      await runCommand(ses, ["init"]);

      const { stderr, exitCode } = await runCommand(ses, [
        "lists", "update", "test-newsletter", "--remove-topic", "no-such-topic",
      ]);
      expect(exitCode).toBe(1);
      expect(stderr).toContain("no-such-topic");
      expect(stderr).toContain("not found");
    });

    it("returns error for invalid add-topic format", async () => {
      await runCommand(ses, ["init"]);

      const { stderr, exitCode } = await runCommand(ses, [
        "lists", "update", "test-newsletter", "--add-topic", "missing-fields",
      ]);
      expect(exitCode).toBe(1);
      expect(stderr).toContain("Invalid topic format");
    });

    it("returns error for invalid add-topic subscription status", async () => {
      await runCommand(ses, ["init"]);

      const { stderr, exitCode } = await runCommand(ses, [
        "lists", "update", "test-newsletter", "--add-topic", "name:display:INVALID",
      ]);
      expect(exitCode).toBe(1);
      expect(stderr).toContain("Invalid default subscription status");
    });

    it("preserves existing topics when only updating description", async () => {
      await runCommand(ses, ["init"]);

      await runCommand(ses, [
        "lists", "update", "test-newsletter", "--description", "New desc",
      ]);

      const { stdout: showOut } = await runCommand(ses, ["lists", "show", "test-newsletter"]);
      expect(showOut).toContain("test-topic");
      expect(showOut).toContain("Weekly Newsletter");
      expect(showOut).toContain("New desc");
    });
  });

  describe("delete", () => {
    it("deletes an existing list", async () => {
      await runCommand(ses, ["init"]);

      const { stdout, exitCode } = await runCommand(ses, ["lists", "delete", "test-newsletter"]);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("Deleted");
      expect(stdout).toContain("test-newsletter");

      const { stdout: listOut } = await runCommand(ses, ["lists", "list"]);
      expect(listOut).toContain("0 contact lists");
    });

    it("returns error when list does not exist", async () => {
      const { stderr, exitCode } = await runCommand(ses, ["lists", "delete", "nonexistent"]);
      expect(exitCode).toBe(1);
      expect(stderr).toContain("nonexistent");
      expect(stderr).toContain("not found");
    });
  });
});
