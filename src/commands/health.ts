import { Command } from "commander";
import type { SesService } from "../services/ses.js";
import type { Output } from "../output.js";
import type { NewsletterConfig } from "../config.js";
import { extractEmail } from "../lib/email.js";

export function createHealthCommand(
  ses: SesService,
  out: Output,
  getConfig: () => NewsletterConfig
): Command {
  const cmd = new Command("health");

  cmd
    .description(
      "Show newsletter health dashboard. " +
        "Aggregates account status, identity verification, contact list health, " +
        "and suppression list statistics into a single view."
    )
    .action(async () => {
      const config = getConfig();

      try {
        const [account, contacts, unsubscribed, suppressed] = await Promise.all([
          ses.getAccountInfo(),
          ses.listContacts(config.contactListName, config.topicName),
          ses.listUnsubscribedContacts(config.contactListName, config.topicName),
          ses.listSuppressedDestinations(),
        ]);

        const bareEmail = extractEmail(config.fromAddress);
        const identity = await ses.getIdentity(bareEmail);

        out.write("=== Account ===\n");
        out.write(`Sending quota: ${account.sentLast24Hours} / ${account.max24HourSend} (last 24h)\n`);
        out.write(`Send rate: ${account.maxSendRate} emails/second\n`);
        out.write(`Enforcement: ${account.enforcementStatus}\n`);
        out.write(`Access: ${account.productionAccessEnabled ? "Production" : "Sandbox"}\n`);
        out.write(`Sending: ${account.sendingEnabled ? "Enabled" : "Disabled"}\n`);

        out.write("\n=== Identity ===\n");
        if (identity) {
          out.write(
            `${bareEmail}: ${identity.verifiedForSending ? "Verified" : "Not verified"} (${identity.verificationStatus})\n`
          );
          if (identity.dkim.status !== "NOT_STARTED") {
            out.write(`DKIM: ${identity.dkim.status}\n`);
          }
        } else {
          out.write(`${bareEmail}: not registered in SES\n`);
        }

        out.write("\n=== Contacts ===\n");
        out.write(`${contacts.length} subscribed, ${unsubscribed.length} unsubscribed\n`);

        const bounceCount = suppressed.filter((s) => s.reason === "BOUNCE").length;
        const complaintCount = suppressed.filter((s) => s.reason === "COMPLAINT").length;
        out.write("\n=== Suppression ===\n");
        out.write(`${suppressed.length} suppressed (${bounceCount} bounces, ${complaintCount} complaints)\n`);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        out.error(`Error: ${message}\n`);
        out.setExitCode(1);
      }
    });

  return cmd;
}
