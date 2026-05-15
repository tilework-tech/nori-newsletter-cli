import { describe, it, expect, beforeEach } from "vitest";
import {
  createMockSesService,
  runCommand,
  type MockSesService,
} from "../helpers.js";

describe("stats", () => {
  describe("account", () => {
    it("shows all account details for a healthy production account", async () => {
      const ses = createMockSesService({
        accountInfo: {
          sentLast24Hours: 4321,
          max24HourSend: 98765,
          maxSendRate: 42,
          enforcementStatus: "HEALTHY",
          productionAccessEnabled: true,
          sendingEnabled: true,
        },
      });
      const { stdout, exitCode } = await runCommand(ses, ["stats", "account"]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("4321");
      expect(stdout).toContain("98765");
      expect(stdout).toContain("42");
      expect(stdout).toContain("HEALTHY");
      expect(stdout).toContain("Production");
      expect(stdout).toContain("Enabled");
    });

    it("shows sandbox when not production", async () => {
      const ses = createMockSesService({
        accountInfo: { productionAccessEnabled: false },
      });
      const { stdout, exitCode } = await runCommand(ses, ["stats", "account"]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("Sandbox");
    });

    it("shows sending disabled when sending is off", async () => {
      const ses = createMockSesService({
        accountInfo: { sendingEnabled: false },
      });
      const { stdout, exitCode } = await runCommand(ses, ["stats", "account"]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("Disabled");
    });

    it("shows non-healthy enforcement status", async () => {
      const ses = createMockSesService({
        accountInfo: { enforcementStatus: "PROBATION" },
      });
      const { stdout, exitCode } = await runCommand(ses, ["stats", "account"]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("PROBATION");
    });
  });

  describe("send", () => {
    let ses: MockSesService;

    beforeEach(() => {
      ses = createMockSesService({
        metricsResults: [
          {
            metric: "SEND",
            timestamps: [new Date("2025-05-01"), new Date("2025-05-02")],
            values: [100, 200],
          },
          {
            metric: "DELIVERY",
            timestamps: [new Date("2025-05-01"), new Date("2025-05-02")],
            values: [95, 190],
          },
          {
            metric: "PERMANENT_BOUNCE",
            timestamps: [new Date("2025-05-01"), new Date("2025-05-02")],
            values: [3, 5],
          },
          {
            metric: "COMPLAINT",
            timestamps: [new Date("2025-05-01"), new Date("2025-05-02")],
            values: [1, 2],
          },
        ],
      });
    });

    it("shows metric totals", async () => {
      const { stdout, exitCode } = await runCommand(ses, ["stats", "send"]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("SEND: 300");
      expect(stdout).toContain("DELIVERY: 285");
      expect(stdout).toContain("PERMANENT_BOUNCE: 8");
      expect(stdout).toContain("COMPLAINT: 3");
    });

    it("accepts --days flag and reflects it in output", async () => {
      const { stdout, exitCode } = await runCommand(ses, [
        "stats",
        "send",
        "--days",
        "14",
      ]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("last 14 days");
    });

    it("accepts --identity flag and reflects it in output", async () => {
      const { stdout, exitCode } = await runCommand(ses, [
        "stats",
        "send",
        "--identity",
        "news@example.com",
      ]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("news@example.com");
    });

    it("rejects --days greater than 60", async () => {
      const { stderr, exitCode } = await runCommand(ses, [
        "stats",
        "send",
        "--days",
        "61",
      ]);

      expect(exitCode).toBe(1);
      expect(stderr).toContain("60");
    });

    it("rejects --days of zero", async () => {
      const { stderr, exitCode } = await runCommand(ses, [
        "stats",
        "send",
        "--days",
        "0",
      ]);

      expect(exitCode).toBe(1);
    });

    it("rejects negative --days", async () => {
      const { stderr, exitCode } = await runCommand(ses, [
        "stats",
        "send",
        "--days",
        "-5",
      ]);

      expect(exitCode).toBe(1);
    });

    it("rejects non-integer --days", async () => {
      const { stderr, exitCode } = await runCommand(ses, [
        "stats",
        "send",
        "--days",
        "3.5",
      ]);

      expect(exitCode).toBe(1);
    });

    it("shows message when no metric data available", async () => {
      ses = createMockSesService({ metricsResults: [] });
      const { stdout, exitCode } = await runCommand(ses, ["stats", "send"]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("No metric data");
    });

    it("shows errors from batch query", async () => {
      ses = createMockSesService({
        metricsResults: [],
        metricsErrors: [
          { metric: "SEND", message: "Access denied" },
        ],
      });
      const { stderr, exitCode } = await runCommand(ses, ["stats", "send"]);

      expect(exitCode).toBe(1);
      expect(stderr).toContain("SEND");
      expect(stderr).toContain("Access denied");
    });
  });
});
