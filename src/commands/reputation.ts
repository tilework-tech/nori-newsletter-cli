import { Command } from "commander";
import type { SesService } from "../services/ses.js";
import type { Output } from "../output.js";
import type { NewsletterConfig } from "../config.js";

export function createReputationCommand(
  ses: SesService,
  out: Output,
  _getConfig: () => NewsletterConfig
): Command {
  const cmd = new Command("reputation");

  cmd
    .description(
      "Analyze SES sending reputation. " +
        "Calculates bounce and complaint rates from VDM metrics, compares against " +
        "AWS enforcement thresholds, and reports OK/WARN/CRITICAL status per metric. " +
        "Use this to monitor reputation health and avoid account review or sending pause."
    )
    .option("--days <days>", "Metrics lookback period in days (1-60)", "7")
    .option("--identity <identity>", "Filter metrics by sending identity")
    .action(async (options: { days: string; identity?: string }) => {
      let hasCritical = false;

      try {
        const days = Number(options.days);
        if (!Number.isInteger(days) || days < 1 || days > 60) {
          out.error("Error: --days must be an integer between 1 and 60\n");
          out.setExitCode(1);
          return;
        }

        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const [account, suppressed, metricsResponse] = await Promise.all([
          ses.getAccountInfo(),
          ses.listSuppressedDestinations(),
          ses.getMetrics({
            startDate,
            endDate,
            metrics: ["SEND", "DELIVERY", "PERMANENT_BOUNCE", "COMPLAINT"],
            identity: options.identity,
          }),
        ]);

        if (metricsResponse.errors.length > 0) {
          for (const err of metricsResponse.errors) {
            out.error(`Metrics error (${err.metric}): ${err.message}\n`);
          }
        }

        out.write(`=== Reputation Report (last ${days} days) ===\n\n`);

        const enforcementLabel = getEnforcementLabel(account.enforcementStatus);
        out.write(`Enforcement: ${account.enforcementStatus} ${enforcementLabel}\n`);
        if (enforcementLabel === "[CRITICAL]") hasCritical = true;

        out.write(`Sending: ${account.sendingEnabled ? "Enabled" : "Disabled"}\n`);
        out.write(`Access: ${account.productionAccessEnabled ? "Production" : "Sandbox"}\n`);

        const quotaPercent =
          account.max24HourSend > 0
            ? (account.sentLast24Hours / account.max24HourSend) * 100
            : 0;
        const quotaLabel = getQuotaLabel(quotaPercent);
        out.write(
          `Quota usage: ${account.sentLast24Hours} / ${account.max24HourSend} (${quotaPercent.toFixed(1)}%) ${quotaLabel}\n`
        );
        if (quotaLabel === "[CRITICAL]") hasCritical = true;

        out.write("\n=== Sending Metrics ===\n");

        const totals = new Map<string, number>();
        for (const result of metricsResponse.results) {
          const sum = result.values.reduce((a: number, b: number) => a + b, 0);
          totals.set(result.metric, sum);
        }

        const sends = totals.get("SEND") ?? 0;
        const deliveries = totals.get("DELIVERY") ?? 0;
        const bounces = totals.get("PERMANENT_BOUNCE") ?? 0;
        const complaints = totals.get("COMPLAINT") ?? 0;

        const bounceRate = sends > 0 ? (bounces / sends) * 100 : 0;
        const complaintRate = sends > 0 ? (complaints / sends) * 100 : 0;

        if (sends === 0 && metricsResponse.results.length === 0) {
          out.write("Metrics unavailable (VDM may not be enabled)\n");
        } else if (sends === 0) {
          out.write("No sends in this period\n");
          out.write("  Bounce rate: N/A\n");
          out.write("  Complaint rate: N/A\n");
        } else {
          const deliveryRate = (deliveries / sends) * 100;
          const bounceLabel = getBounceLabel(bounceRate);
          const complaintLabel = getComplaintLabel(complaintRate);

          out.write(`  Sends: ${sends}\n`);
          out.write(`  Deliveries: ${deliveries} (${deliveryRate.toFixed(1)}%)\n`);
          out.write(
            `  Bounce rate: ${bounceRate.toFixed(2)}% (${bounces} bounces) ${bounceLabel}\n`
          );
          out.write(
            `  Complaint rate: ${complaintRate.toFixed(3)}% (${complaints} complaints) ${complaintLabel}\n`
          );

          if (bounceLabel === "[CRITICAL]") hasCritical = true;
          if (complaintLabel === "[CRITICAL]") hasCritical = true;
        }

        const bounceSupp = suppressed.filter((s) => s.reason === "BOUNCE").length;
        const complaintSupp = suppressed.filter((s) => s.reason === "COMPLAINT").length;
        out.write("\n=== Suppression List ===\n");
        out.write(
          `${suppressed.length} total (${bounceSupp} bounces, ${complaintSupp} complaints)\n`
        );

        const recommendations: string[] = [];
        if (hasCritical) {
          recommendations.push(
            "URGENT: One or more metrics are at critical levels. Review immediately."
          );
        }
        if (bounceRate >= 2) {
          recommendations.push(
            "Run 'cleanup report' to find contacts on the suppression list."
          );
          recommendations.push(
            "Run 'validate list' to check email address deliverability."
          );
        }
        if (complaintRate >= 0.05) {
          recommendations.push(
            "Review your unsubscribe flow — high complaint rates indicate recipients can't easily opt out."
          );
        }
        if (account.enforcementStatus === "PROBATION") {
          recommendations.push(
            "Account is under review. Fix bounce/complaint issues before the review period ends."
          );
        }

        if (recommendations.length > 0) {
          out.write("\n=== Recommendations ===\n");
          for (const rec of recommendations) {
            out.write(`- ${rec}\n`);
          }
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        out.error(`Error: ${message}\n`);
        hasCritical = true;
      }

      if (hasCritical) {
        out.setExitCode(1);
      }
    });

  return cmd;
}

function getEnforcementLabel(status: string): string {
  if (status === "HEALTHY") return "[OK]";
  if (status === "PROBATION") return "[WARN]";
  if (status === "SHUTDOWN") return "[CRITICAL]";
  return "[WARN]";
}

function getBounceLabel(rate: number): string {
  if (rate < 2) return "[OK]";
  if (rate < 5) return "[WARN]";
  return "[CRITICAL]";
}

function getComplaintLabel(rate: number): string {
  if (rate < 0.05) return "[OK]";
  if (rate < 0.1) return "[WARN]";
  return "[CRITICAL]";
}

function getQuotaLabel(percent: number): string {
  if (percent < 80) return "[OK]";
  if (percent < 95) return "[WARN]";
  return "[CRITICAL]";
}
