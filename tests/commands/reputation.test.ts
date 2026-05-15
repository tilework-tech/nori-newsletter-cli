import { describe, it, expect } from "vitest";
import { createMockSesService, runCommand } from "../helpers.js";

function makeMetrics(sends: number, bounces: number, complaints: number, deliveries?: number) {
  const ts = [new Date("2025-05-01"), new Date("2025-05-02")];
  const half = (n: number) => [Math.floor(n / 2), n - Math.floor(n / 2)];
  return [
    { metric: "SEND", timestamps: ts, values: half(sends) },
    { metric: "DELIVERY", timestamps: ts, values: half(deliveries ?? sends - bounces) },
    { metric: "PERMANENT_BOUNCE", timestamps: ts, values: half(bounces) },
    { metric: "COMPLAINT", timestamps: ts, values: half(complaints) },
  ];
}

describe("reputation command", () => {
  it("shows OK status when all metrics are healthy", async () => {
    const ses = createMockSesService({
      metricsResults: makeMetrics(1000, 10, 0),
      accountInfo: { sentLast24Hours: 150, max24HourSend: 50000 },
    });

    const { stdout, exitCode } = await runCommand(ses, ["reputation"]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("[OK]");
    expect(stdout).not.toContain("[CRITICAL]");
  });

  it("shows WARN status when bounce rate is in warning range (2-5%)", async () => {
    const ses = createMockSesService({
      metricsResults: makeMetrics(1000, 30, 0),
    });

    const { stdout } = await runCommand(ses, ["reputation"]);

    expect(stdout).toMatch(/bounce.*\[WARN\]/i);
  });

  it("shows CRITICAL status when bounce rate exceeds review threshold (>=5%)", async () => {
    const ses = createMockSesService({
      metricsResults: makeMetrics(1000, 70, 0),
    });

    const { stdout, exitCode } = await runCommand(ses, ["reputation"]);

    expect(stdout).toMatch(/bounce.*\[CRITICAL\]/i);
    expect(exitCode).toBe(1);
  });

  it("shows WARN for complaint rate in warning range (0.05-0.1%)", async () => {
    const ses = createMockSesService({
      metricsResults: makeMetrics(10000, 0, 8),
    });

    const { stdout } = await runCommand(ses, ["reputation"]);

    expect(stdout).toMatch(/complaint.*\[WARN\]/i);
  });

  it("shows CRITICAL for complaint rate at review threshold (>=0.1%)", async () => {
    const ses = createMockSesService({
      metricsResults: makeMetrics(10000, 0, 20),
    });

    const { stdout, exitCode } = await runCommand(ses, ["reputation"]);

    expect(stdout).toMatch(/complaint.*\[CRITICAL\]/i);
    expect(exitCode).toBe(1);
  });

  it("shows enforcement status PROBATION as WARN", async () => {
    const ses = createMockSesService({
      metricsResults: makeMetrics(1000, 10, 0),
      accountInfo: { enforcementStatus: "PROBATION" },
    });

    const { stdout } = await runCommand(ses, ["reputation"]);

    expect(stdout).toMatch(/enforcement.*\[WARN\]/i);
  });

  it("shows enforcement status SHUTDOWN as CRITICAL", async () => {
    const ses = createMockSesService({
      metricsResults: makeMetrics(1000, 10, 0),
      accountInfo: { enforcementStatus: "SHUTDOWN", sendingEnabled: false },
    });

    const { stdout, exitCode } = await runCommand(ses, ["reputation"]);

    expect(stdout).toMatch(/enforcement.*\[CRITICAL\]/i);
    expect(exitCode).toBe(1);
  });

  it("falls back gracefully when VDM metrics unavailable", async () => {
    const ses = createMockSesService({
      metricsResults: [],
    });

    const { stdout, exitCode } = await runCommand(ses, ["reputation"]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("Metrics unavailable");
  });

  it("shows quota usage warning when approaching limit", async () => {
    const ses = createMockSesService({
      metricsResults: makeMetrics(1000, 10, 0),
      accountInfo: { sentLast24Hours: 42500, max24HourSend: 50000 },
    });

    const { stdout } = await runCommand(ses, ["reputation"]);

    expect(stdout).toMatch(/quota.*\[WARN\]/i);
  });

  it("shows suppression list count with breakdown", async () => {
    const ses = createMockSesService({
      metricsResults: makeMetrics(1000, 10, 0),
    });
    await ses.putSuppressedDestination("a@example.com", "BOUNCE");
    await ses.putSuppressedDestination("b@example.com", "BOUNCE");
    await ses.putSuppressedDestination("c@example.com", "COMPLAINT");

    const { stdout } = await runCommand(ses, ["reputation"]);

    expect(stdout).toContain("3 total");
    expect(stdout).toContain("2 bounces");
    expect(stdout).toContain("1 complaints");
  });

  it("supports --days flag", async () => {
    const ses = createMockSesService({
      metricsResults: makeMetrics(1000, 10, 0),
    });

    const { stdout, exitCode } = await runCommand(ses, ["reputation", "--days", "14"]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("last 14 days");
  });

  it("reports metrics errors from batch query", async () => {
    const ses = createMockSesService({
      metricsResults: [],
      metricsErrors: [{ metric: "SEND", message: "Access denied" }],
    });

    const { stderr } = await runCommand(ses, ["reputation"]);

    expect(stderr).toContain("SEND");
    expect(stderr).toContain("Access denied");
  });

  it("rejects --days greater than 60", async () => {
    const ses = createMockSesService();

    const { stderr, exitCode } = await runCommand(ses, ["reputation", "--days", "61"]);

    expect(exitCode).toBe(1);
    expect(stderr).toContain("60");
  });

  it("rejects --days of zero", async () => {
    const ses = createMockSesService();

    const { exitCode } = await runCommand(ses, ["reputation", "--days", "0"]);

    expect(exitCode).toBe(1);
  });

  it("rejects non-integer --days", async () => {
    const ses = createMockSesService();

    const { exitCode } = await runCommand(ses, ["reputation", "--days", "3.5"]);

    expect(exitCode).toBe(1);
  });
});
