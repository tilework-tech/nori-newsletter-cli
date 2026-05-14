import { Command } from "commander";
import type { SesService } from "../services/ses.js";
import type { Output } from "../output.js";
import type { NewsletterConfig } from "../config.js";

const DEFAULT_METRICS = ["SEND", "DELIVERY", "PERMANENT_BOUNCE", "COMPLAINT"];

export function createStatsCommand(
  ses: SesService,
  out: Output,
  getConfig: () => NewsletterConfig
): Command {
  const cmd = new Command("stats");

  cmd.description(
    "View sending statistics and account health. " +
      "Use 'account' to see quota usage and enforcement status, " +
      "or 'send' to see delivery metrics over time."
  );

  cmd
    .command("account")
    .description(
      "Show SES account health and sending quota. " +
        "Displays daily sending limit, current usage, send rate, " +
        "enforcement status, and whether the account is in sandbox or production mode."
    )
    .action(async () => {
      try {
        const info = await ses.getAccountInfo();

        out.write(`Sending quota: ${info.sentLast24Hours} / ${info.max24HourSend} (last 24h)\n`);
        out.write(`Send rate: ${info.maxSendRate} emails/second\n`);
        out.write(`Enforcement: ${info.enforcementStatus}\n`);
        out.write(`Access: ${info.productionAccessEnabled ? "Production" : "Sandbox"}\n`);
        out.write(`Sending: ${info.sendingEnabled ? "Enabled" : "Disabled"}\n`);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        out.error(`Error: Failed to retrieve account info: ${message}\n`);
        out.setExitCode(1);
      }
    });

  cmd
    .command("send")
    .description(
      "Show sending metrics over a time period. " +
        "Displays send, delivery, bounce, and complaint totals. " +
        "Requires VDM (Virtual Deliverability Manager) to be enabled on the SES account. " +
        "Data is retained for 60 days."
    )
    .option("--days <days>", "Number of days to look back (default: 7, max: 60)", "7")
    .option("--identity <identity>", "Filter by sending identity (email or domain)")
    .action(
      async (options: { days: string; identity?: string }) => {
        const days = Number(options.days);

        if (!Number.isInteger(days) || days <= 0) {
          out.error(`Error: --days must be a positive integer.\n`);
          out.setExitCode(1);
          return;
        }

        if (days > 60) {
          out.error(`Error: --days cannot exceed 60 (SES retains metric data for 60 days).\n`);
          out.setExitCode(1);
          return;
        }

        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        let results: Array<{ metric: string; timestamps: Date[]; values: number[] }>;
        let errors: Array<{ metric: string; message: string }>;

        try {
          const response = await ses.getMetrics({
            startDate,
            endDate,
            metrics: DEFAULT_METRICS,
            identity: options.identity,
          });
          results = response.results;
          errors = response.errors;
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          out.error(`Error: Failed to retrieve metrics: ${message}\n`);
          out.setExitCode(1);
          return;
        }

        if (errors.length > 0) {
          for (const err of errors) {
            out.error(`Error for ${err.metric}: ${err.message}\n`);
          }
          out.setExitCode(1);
        }

        if (results.length === 0 && errors.length === 0) {
          out.write(`No metric data available for the last ${days} days.\n`);
          return;
        }

        const header = options.identity
          ? `Metrics for ${options.identity} (last ${days} days):\n`
          : `Metrics (last ${days} days):\n`;
        out.write(header);

        for (const result of results) {
          const total = result.values.reduce((sum, v) => sum + v, 0);
          out.write(`  ${result.metric}: ${total}\n`);
        }
      }
    );

  return cmd;
}
