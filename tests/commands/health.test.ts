import { describe, it, expect } from "vitest";
import { createMockSesService, runCommand, TEST_CONFIG } from "../helpers.js";

describe("health command", () => {
  it("shows account health with all sections", async () => {
    const ses = createMockSesService({
      seedIdentities: [{ name: "test@example.com" }],
    });

    await ses.createContactList(TEST_CONFIG.contactListName, TEST_CONFIG.topicName);
    await ses.createContact(TEST_CONFIG.contactListName, "a@example.com", TEST_CONFIG.topicName);
    await ses.createContact(TEST_CONFIG.contactListName, "b@example.com", TEST_CONFIG.topicName);
    ses.setContactUnsubscribed("b@example.com", TEST_CONFIG.topicName);
    await ses.putSuppressedDestination("bounced@example.com", "BOUNCE");

    const { stdout, exitCode } = await runCommand(ses, ["health"]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("150 / 50000");
    expect(stdout).toContain("HEALTHY");
    expect(stdout).toContain("Production");
    expect(stdout).toContain("test@example.com");
    expect(stdout).toContain("Verified");
    expect(stdout).toContain("1 subscribed");
    expect(stdout).toContain("1 unsubscribed");
    expect(stdout).toContain("1 suppressed");
  });

  it("warns when from address identity not found", async () => {
    const ses = createMockSesService();

    const { stdout, exitCode } = await runCommand(ses, ["health"]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("not registered");
  });

  it("shows sandbox warning", async () => {
    const ses = createMockSesService({
      accountInfo: { productionAccessEnabled: false },
      seedIdentities: [{ name: "test@example.com" }],
    });

    const { stdout } = await runCommand(ses, ["health"]);

    expect(stdout).toContain("Sandbox");
  });

  it("works with zero contacts", async () => {
    const ses = createMockSesService({
      seedIdentities: [{ name: "test@example.com" }],
    });

    const { stdout, exitCode } = await runCommand(ses, ["health"]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("0 subscribed");
  });
});
