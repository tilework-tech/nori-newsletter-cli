import { Command } from "commander";
import type { SesService } from "../services/ses.js";
import type { Output } from "../output.js";
import type { NewsletterConfig } from "../config.js";

export function createJobsCommand(
  ses: SesService,
  out: Output,
  getConfig: () => NewsletterConfig
): Command {
  const cmd = new Command("jobs").description(
    "Manage bulk import and export jobs via S3. " +
      "Use 'import-contacts' or 'import-suppression' to bulk-load data from S3, " +
      "'export-metrics' or 'export-insights' to export data, " +
      "'status' to check a job, and 'list' to see all jobs."
  );

  cmd
    .command("import-contacts")
    .description("Create a bulk contact list import job from an S3 file")
    .requiredOption("--s3-url <url>", "S3 URL of the import file (s3://bucket/key)")
    .requiredOption("--format <format>", "Data format: csv or json")
    .option("--action <action>", "Import action: put (add/update) or delete (remove)", "put")
    .option("--list <name>", "Contact list name (defaults to config contactListName)")
    .action(async (opts) => {
      if (!opts.s3Url.startsWith("s3://")) {
        out.error("Error: --s3-url must start with 's3://'.\n");
        out.setExitCode(1);
        return;
      }

      const format = opts.format.toUpperCase();
      if (format !== "CSV" && format !== "JSON") {
        out.error("Error: --format must be 'csv' or 'json'.\n");
        out.setExitCode(1);
        return;
      }

      const action = opts.action.toUpperCase();
      if (action !== "PUT" && action !== "DELETE") {
        out.error("Error: --action must be 'put' or 'delete'.\n");
        out.setExitCode(1);
        return;
      }

      const listName = opts.list ?? getConfig().contactListName;

      const result = await ses.createImportJob({
        destinationType: "CONTACT_LIST",
        action: action as "PUT" | "DELETE",
        s3Url: opts.s3Url,
        dataFormat: format as "CSV" | "JSON",
        contactListName: listName,
      });

      out.write(`Created CONTACT_LIST import job: ${result.jobId}\n`);
      out.write(`S3 source: ${opts.s3Url}\n`);
      out.write(`Action: ${action}, Format: ${format}\n`);
      out.write(`Contact list: ${listName}\n`);
    });

  cmd
    .command("import-suppression")
    .description("Create a bulk suppression list import job from an S3 file")
    .requiredOption("--s3-url <url>", "S3 URL of the import file (s3://bucket/key)")
    .requiredOption("--format <format>", "Data format: csv or json")
    .option("--action <action>", "Import action: put (add) or delete (remove)", "put")
    .action(async (opts) => {
      if (!opts.s3Url.startsWith("s3://")) {
        out.error("Error: --s3-url must start with 's3://'.\n");
        out.setExitCode(1);
        return;
      }

      const format = opts.format.toUpperCase();
      if (format !== "CSV" && format !== "JSON") {
        out.error("Error: --format must be 'csv' or 'json'.\n");
        out.setExitCode(1);
        return;
      }

      const action = opts.action.toUpperCase();
      if (action !== "PUT" && action !== "DELETE") {
        out.error("Error: --action must be 'put' or 'delete'.\n");
        out.setExitCode(1);
        return;
      }

      const result = await ses.createImportJob({
        destinationType: "SUPPRESSION_LIST",
        action: action as "PUT" | "DELETE",
        s3Url: opts.s3Url,
        dataFormat: format as "CSV" | "JSON",
      });

      out.write(`Created SUPPRESSION_LIST import job: ${result.jobId}\n`);
      out.write(`S3 source: ${opts.s3Url}\n`);
      out.write(`Action: ${action}, Format: ${format}\n`);
    });

  cmd
    .command("export-metrics")
    .description("Create a metrics data export job")
    .requiredOption("--start-date <date>", "Start date (ISO 8601)")
    .requiredOption("--end-date <date>", "End date (ISO 8601)")
    .requiredOption("--format <format>", "Output format: csv or json")
    .option("--metrics <metrics>", "Comma-separated metrics (default: SEND,DELIVERY,PERMANENT_BOUNCE,COMPLAINT)")
    .option("--identity <identity>", "Filter by sending identity")
    .action(async (opts) => {
      const format = opts.format.toUpperCase();
      if (format !== "CSV" && format !== "JSON") {
        out.error("Error: --format must be 'csv' or 'json'.\n");
        out.setExitCode(1);
        return;
      }

      const startDate = new Date(opts.startDate);
      const endDate = new Date(opts.endDate);
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        out.error("Error: --start-date and --end-date must be valid dates.\n");
        out.setExitCode(1);
        return;
      }

      const metrics = opts.metrics
        ? opts.metrics.split(",").map((m: string) => m.trim().toUpperCase())
        : undefined;

      const result = await ses.createExportJob({
        sourceType: "METRICS_DATA",
        dataFormat: format as "CSV" | "JSON",
        startDate,
        endDate,
        metrics,
        identity: opts.identity,
      });

      out.write(`Created METRICS_DATA export job: ${result.jobId}\n`);
      out.write(`Date range: ${opts.startDate} to ${opts.endDate}\n`);
      out.write(`Format: ${format}\n`);
    });

  cmd
    .command("export-insights")
    .description("Create a message insights export job")
    .requiredOption("--start-date <date>", "Start date (ISO 8601)")
    .requiredOption("--end-date <date>", "End date (ISO 8601)")
    .requiredOption("--format <format>", "Output format: csv or json")
    .option("--from <address>", "Filter by from email address")
    .option("--destination <address>", "Filter by destination email address")
    .action(async (opts) => {
      const format = opts.format.toUpperCase();
      if (format !== "CSV" && format !== "JSON") {
        out.error("Error: --format must be 'csv' or 'json'.\n");
        out.setExitCode(1);
        return;
      }

      const startDate = new Date(opts.startDate);
      const endDate = new Date(opts.endDate);
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        out.error("Error: --start-date and --end-date must be valid dates.\n");
        out.setExitCode(1);
        return;
      }

      const result = await ses.createExportJob({
        sourceType: "MESSAGE_INSIGHTS",
        dataFormat: format as "CSV" | "JSON",
        startDate,
        endDate,
        fromAddress: opts.from,
        destination: opts.destination,
      });

      out.write(`Created MESSAGE_INSIGHTS export job: ${result.jobId}\n`);
      out.write(`Date range: ${opts.startDate} to ${opts.endDate}\n`);
      out.write(`Format: ${format}\n`);
    });

  cmd
    .command("status")
    .description("Check the status of an import or export job")
    .argument("<job-id>", "Job ID to check")
    .action(async (jobId: string) => {
      const importJob = await ses.getImportJob(jobId);
      if (importJob) {
        out.write(`Job ID: ${importJob.jobId}\n`);
        out.write(`Type: Import (${importJob.destinationType})\n`);
        out.write(`Status: ${importJob.jobStatus}\n`);
        out.write(`Action: ${importJob.action}\n`);
        out.write(`S3 URL: ${importJob.s3Url}\n`);
        out.write(`Format: ${importJob.dataFormat}\n`);
        out.write(`Created: ${importJob.createdTimestamp.toISOString()}\n`);
        if (importJob.completedTimestamp) {
          out.write(`Completed: ${importJob.completedTimestamp.toISOString()}\n`);
        }
        if (importJob.processedRecordsCount !== undefined) {
          out.write(`Processed records: ${importJob.processedRecordsCount}\n`);
        }
        if (importJob.failedRecordsCount !== undefined) {
          out.write(`Failed records: ${importJob.failedRecordsCount}\n`);
        }
        if (importJob.failureMessage) {
          out.write(`Error: ${importJob.failureMessage}\n`);
        }
        if (importJob.failedRecordsS3Url) {
          out.write(`Failed records file: ${importJob.failedRecordsS3Url}\n`);
        }
        return;
      }

      const exportJob = await ses.getExportJob(jobId);
      if (exportJob) {
        out.write(`Job ID: ${exportJob.jobId}\n`);
        out.write(`Type: Export (${exportJob.sourceType})\n`);
        out.write(`Status: ${exportJob.jobStatus}\n`);
        out.write(`Format: ${exportJob.dataFormat}\n`);
        out.write(`Created: ${exportJob.createdTimestamp.toISOString()}\n`);
        if (exportJob.completedTimestamp) {
          out.write(`Completed: ${exportJob.completedTimestamp.toISOString()}\n`);
        }
        if (exportJob.s3Url) {
          out.write(`Download URL: ${exportJob.s3Url}\n`);
        }
        if (exportJob.processedRecordsCount !== undefined) {
          out.write(`Processed records: ${exportJob.processedRecordsCount}\n`);
        }
        if (exportJob.exportedRecordsCount !== undefined) {
          out.write(`Exported records: ${exportJob.exportedRecordsCount}\n`);
        }
        if (exportJob.failureMessage) {
          out.write(`Error: ${exportJob.failureMessage}\n`);
        }
        return;
      }

      out.error(`Error: job '${jobId}' not found.\n`);
      out.setExitCode(1);
    });

  cmd
    .command("list")
    .description("List import and export jobs")
    .option("--type <type>", "Filter by job type: import or export")
    .action(async (opts) => {
      if (opts.type && opts.type !== "import" && opts.type !== "export") {
        out.error(`Error: --type must be 'import' or 'export'.\n`);
        out.setExitCode(1);
        return;
      }

      const showImport = !opts.type || opts.type === "import";
      const showExport = !opts.type || opts.type === "export";

      const importJobs = showImport ? await ses.listImportJobs() : [];
      const exportJobs = showExport ? await ses.listExportJobs() : [];

      if (importJobs.length === 0 && exportJobs.length === 0) {
        out.write("No jobs found.\n");
        return;
      }

      for (const job of importJobs) {
        out.write(
          `${job.jobId}  Import (${job.destinationType})  ${job.jobStatus}  ${job.createdTimestamp.toISOString()}\n`
        );
      }

      for (const job of exportJobs) {
        out.write(
          `${job.jobId}  Export (${job.sourceType})  ${job.jobStatus}  ${job.createdTimestamp.toISOString()}\n`
        );
      }
    });

  return cmd;
}
