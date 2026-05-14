import { Command } from "commander";
import type { SesService } from "../services/ses.js";
import type { Output } from "../output.js";
import type { NewsletterConfig } from "../config.js";
import { isValidEmail } from "../lib/validation.js";

const VALID_REASONS = ["BOUNCE", "COMPLAINT"];

export function createSuppressionCommand(
  ses: SesService,
  out: Output,
  getConfig: () => NewsletterConfig
): Command {
  const cmd = new Command("suppression");

  cmd.description(
    "Manage the SES account-level suppression list. " +
      "View and manage email addresses that have been suppressed due to bounces or complaints. " +
      "This is an account-level feature — it is not tied to a specific contact list."
  );

  cmd
    .command("list")
    .description(
      "List suppressed email addresses. " +
        "Optionally filter by reason (BOUNCE or COMPLAINT) and/or date range."
    )
    .option("--reason <reason>", "Filter by reason: BOUNCE or COMPLAINT")
    .option("--start-date <date>", "Show entries added on or after this date (YYYY-MM-DD)")
    .option("--end-date <date>", "Show entries added on or before this date (YYYY-MM-DD)")
    .action(
      async (options: {
        reason?: string;
        startDate?: string;
        endDate?: string;
      }) => {
        const filterOptions: {
          reasons?: string[];
          startDate?: Date;
          endDate?: Date;
        } = {};

        if (options.reason) {
          const reason = options.reason.toUpperCase();
          if (!VALID_REASONS.includes(reason)) {
            out.error(
              `Error: Invalid reason '${options.reason}'. Must be BOUNCE or COMPLAINT.\n`
            );
            out.setExitCode(1);
            return;
          }
          filterOptions.reasons = [reason];
        }

        if (options.startDate) {
          const date = new Date(options.startDate);
          if (isNaN(date.getTime())) {
            out.error(
              `Error: Invalid start date '${options.startDate}'. Use YYYY-MM-DD format.\n`
            );
            out.setExitCode(1);
            return;
          }
          filterOptions.startDate = date;
        }

        if (options.endDate) {
          const date = new Date(options.endDate);
          if (isNaN(date.getTime())) {
            out.error(
              `Error: Invalid end date '${options.endDate}'. Use YYYY-MM-DD format.\n`
            );
            out.setExitCode(1);
            return;
          }
          filterOptions.endDate = date;
        }

        const entries = await ses.listSuppressedDestinations(
          Object.keys(filterOptions).length > 0 ? filterOptions : undefined
        );

        const label =
          entries.length === 1 ? "suppressed address" : "suppressed addresses";
        out.write(`${entries.length} ${label}:\n`);
        for (const entry of entries) {
          out.write(
            `  ${entry.email} (${entry.reason}, ${entry.lastUpdateTime.toISOString()})\n`
          );
        }
      }
    );

  cmd
    .command("check")
    .description(
      "Check if an email address is on the suppression list. " +
        "Shows reason, date, and message details if suppressed."
    )
    .argument("<email>", "Email address to check")
    .action(async (email: string) => {
      const dest = await ses.getSuppressedDestination(email);

      if (!dest) {
        out.error(`Error: '${email}' is not on the suppression list.\n`);
        out.setExitCode(1);
        return;
      }

      out.write(`Email: ${dest.email}\n`);
      out.write(`Reason: ${dest.reason}\n`);
      out.write(`Suppressed: ${dest.lastUpdateTime.toISOString()}\n`);
      if (dest.messageId) {
        out.write(`Message ID: ${dest.messageId}\n`);
      }
      if (dest.feedbackId) {
        out.write(`Feedback ID: ${dest.feedbackId}\n`);
      }
    });

  cmd
    .command("add")
    .description(
      "Manually add an email address to the suppression list. " +
        "Requires --reason (BOUNCE or COMPLAINT). " +
        "If the address is already suppressed, updates the reason and timestamp."
    )
    .argument("<email>", "Email address to suppress")
    .requiredOption("--reason <reason>", "Suppression reason: BOUNCE or COMPLAINT")
    .action(async (email: string, options: { reason: string }) => {
      if (!isValidEmail(email)) {
        out.error(
          `Error: '${email}' is not a valid email address.\n`
        );
        out.setExitCode(1);
        return;
      }

      const reason = options.reason.toUpperCase();
      if (!VALID_REASONS.includes(reason)) {
        out.error(
          `Error: Invalid reason '${options.reason}'. Must be BOUNCE or COMPLAINT.\n`
        );
        out.setExitCode(1);
        return;
      }

      await ses.putSuppressedDestination(email, reason);
      out.write(`Added '${email}' to the suppression list (${reason}).\n`);
    });

  cmd
    .command("remove")
    .description(
      "Remove an email address from the suppression list. " +
        "Fails if the address is not currently suppressed."
    )
    .argument("<email>", "Email address to remove")
    .action(async (email: string) => {
      try {
        await ses.deleteSuppressedDestination(email);
        out.write(`Removed '${email}' from the suppression list.\n`);
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "NotFoundException") {
          out.error(`Error: '${email}' is not on the suppression list.\n`);
          out.setExitCode(1);
          return;
        }
        throw err;
      }
    });

  return cmd;
}
