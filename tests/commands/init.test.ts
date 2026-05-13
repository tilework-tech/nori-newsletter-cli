import { describe, it, expect, beforeEach } from "vitest";
import { createMockSesService, runCommand, TEST_CONFIG } from "../helpers.js";

describe("init command", () => {
  let ses: ReturnType<typeof createMockSesService>;

  beforeEach(() => {
    ses = createMockSesService();
  });

  it("creates the contact list", async () => {
    const { exitCode, stdout } = await runCommand(ses, ["init"]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain(TEST_CONFIG.contactListName);
  });

  it("succeeds when contact list already exists", async () => {
    await runCommand(ses, ["init"]);
    const { exitCode, stdout } = await runCommand(ses, ["init"]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("already exists");
  });
});
