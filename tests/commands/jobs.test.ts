import { describe, it, expect, beforeEach } from "vitest";
import {
  createMockSesService,
  runCommand,
  type MockSesService,
} from "../helpers.js";

describe("jobs command", () => {
  let ses: MockSesService;

  beforeEach(() => {
    ses = createMockSesService();
  });

  describe("import-contacts", () => {
    it("creates a contact list import job and outputs the job ID", async () => {
      const { stdout, exitCode } = await runCommand(ses, [
        "jobs",
        "import-contacts",
        "--s3-url",
        "s3://my-bucket/contacts.csv",
        "--format",
        "csv",
      ]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("import-job-");
      expect(stdout).toContain("CONTACT_LIST");
    });

    it("uses --action delete for removal imports", async () => {
      const { stdout, exitCode } = await runCommand(ses, [
        "jobs",
        "import-contacts",
        "--s3-url",
        "s3://my-bucket/remove.csv",
        "--format",
        "csv",
        "--action",
        "delete",
      ]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("import-job-");
      expect(stdout).toContain("DELETE");
    });
  });

  describe("import-suppression", () => {
    it("creates a suppression list import job and outputs the job ID", async () => {
      const { stdout, exitCode } = await runCommand(ses, [
        "jobs",
        "import-suppression",
        "--s3-url",
        "s3://my-bucket/suppression.csv",
        "--format",
        "csv",
      ]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("import-job-");
      expect(stdout).toContain("SUPPRESSION_LIST");
    });

    it("supports --action delete for suppression removal", async () => {
      const { stdout, exitCode } = await runCommand(ses, [
        "jobs",
        "import-suppression",
        "--s3-url",
        "s3://my-bucket/unsuppress.json",
        "--format",
        "json",
        "--action",
        "delete",
      ]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("import-job-");
      expect(stdout).toContain("DELETE");
      expect(stdout).toContain("JSON");
    });
  });

  describe("export-metrics", () => {
    it("creates a metrics export job and outputs the job ID", async () => {
      const { stdout, exitCode } = await runCommand(ses, [
        "jobs",
        "export-metrics",
        "--start-date",
        "2026-01-01",
        "--end-date",
        "2026-01-31",
        "--format",
        "csv",
      ]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("export-job-");
      expect(stdout).toContain("METRICS_DATA");
    });
  });

  describe("export-insights", () => {
    it("creates a message insights export job and outputs the job ID", async () => {
      const { stdout, exitCode } = await runCommand(ses, [
        "jobs",
        "export-insights",
        "--start-date",
        "2026-01-01",
        "--end-date",
        "2026-01-31",
        "--format",
        "csv",
      ]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("export-job-");
      expect(stdout).toContain("MESSAGE_INSIGHTS");
    });
  });

  describe("status", () => {
    it("shows job details for an import job", async () => {
      const { stdout: createOut } = await runCommand(ses, [
        "jobs",
        "import-contacts",
        "--s3-url",
        "s3://my-bucket/contacts.csv",
        "--format",
        "csv",
      ]);

      const jobId = createOut.match(/import-job-\d+/)?.[0];
      expect(jobId).toBeDefined();

      const { stdout, exitCode } = await runCommand(ses, [
        "jobs",
        "status",
        jobId!,
      ]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain(jobId!);
      expect(stdout).toContain("CREATED");
    });

    it("shows job details for an export job", async () => {
      const { stdout: createOut } = await runCommand(ses, [
        "jobs",
        "export-metrics",
        "--start-date",
        "2026-01-01",
        "--end-date",
        "2026-01-31",
        "--format",
        "csv",
      ]);

      const jobId = createOut.match(/export-job-\d+/)?.[0];
      expect(jobId).toBeDefined();

      const { stdout, exitCode } = await runCommand(ses, [
        "jobs",
        "status",
        jobId!,
      ]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain(jobId!);
      expect(stdout).toContain("Export");
      expect(stdout).toContain("METRICS_DATA");
    });

    it("reports error for non-existent job ID", async () => {
      const { stderr, exitCode } = await runCommand(ses, [
        "jobs",
        "status",
        "no-such-job",
      ]);

      expect(exitCode).toBe(1);
      expect(stderr).toContain("not found");
    });
  });

  describe("list", () => {
    it("lists all jobs", async () => {
      await runCommand(ses, [
        "jobs",
        "import-contacts",
        "--s3-url",
        "s3://my-bucket/contacts.csv",
        "--format",
        "csv",
      ]);
      await runCommand(ses, [
        "jobs",
        "export-metrics",
        "--start-date",
        "2026-01-01",
        "--end-date",
        "2026-01-31",
        "--format",
        "csv",
      ]);

      const { stdout, exitCode } = await runCommand(ses, ["jobs", "list"]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("import-job-");
      expect(stdout).toContain("export-job-");
    });

    it("filters by --type import", async () => {
      await runCommand(ses, [
        "jobs",
        "import-contacts",
        "--s3-url",
        "s3://my-bucket/contacts.csv",
        "--format",
        "csv",
      ]);
      await runCommand(ses, [
        "jobs",
        "export-metrics",
        "--start-date",
        "2026-01-01",
        "--end-date",
        "2026-01-31",
        "--format",
        "csv",
      ]);

      const { stdout, exitCode } = await runCommand(ses, [
        "jobs",
        "list",
        "--type",
        "import",
      ]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("import-job-");
      expect(stdout).not.toContain("export-job-");
    });

    it("shows message when no jobs exist", async () => {
      const { stdout, exitCode } = await runCommand(ses, ["jobs", "list"]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("No jobs found");
    });
  });
});
