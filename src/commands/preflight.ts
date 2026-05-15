import { Command } from "commander";
import type { SesService } from "../services/ses.js";
import type { Output } from "../output.js";
import type { NewsletterConfig } from "../config.js";
import { extractEmail } from "../lib/email.js";

export function createPreflightCommand(
  ses: SesService,
  out: Output,
  getConfig: () => NewsletterConfig
): Command {
  const cmd = new Command("preflight");

  cmd
    .description(
      "Pre-send validation checks. " +
        "Verifies account status, identity, template, recipients, and suppression overlap " +
        "before sending a newsletter."
    )
    .argument("<template>", "Template name to validate")
    .option("--data <json>", "JSON template variable data for render test")
    .action(async (templateName: string, options: { data?: string }) => {
      const config = getConfig();
      let hasFailure = false;

      try {
        const account = await ses.getAccountInfo();

        if (!account.sendingEnabled) {
          out.write("[FAIL] Account: sending is disabled\n");
          hasFailure = true;
        } else {
          out.write("[PASS] Account: sending enabled\n");
        }

        if (account.enforcementStatus !== "HEALTHY") {
          out.write(`[WARN] Account: enforcement status is ${account.enforcementStatus}\n`);
        }

        if (!account.productionAccessEnabled) {
          out.write("[WARN] Account: running in Sandbox mode\n");
        }

        const bareEmail = extractEmail(config.fromAddress);
        const identity = await ses.getIdentity(bareEmail);

        if (!identity) {
          out.write(`[FAIL] Identity: ${bareEmail} not found in SES\n`);
          hasFailure = true;
        } else if (!identity.verifiedForSending) {
          out.write(`[FAIL] Identity: ${bareEmail} not verified (${identity.verificationStatus})\n`);
          hasFailure = true;
        } else {
          out.write(`[PASS] Identity: ${bareEmail} verified\n`);
        }

        const template = await ses.getTemplate(templateName);

        if (!template) {
          out.write(`[FAIL] Template: "${templateName}" not found\n`);
          hasFailure = true;
        } else {
          out.write(`[PASS] Template: "${templateName}" exists\n`);

          if (options.data) {
            try {
              await ses.testRenderTemplate(templateName, options.data);
              out.write("[PASS] Template render: successful\n");
            } catch (err: unknown) {
              const message = err instanceof Error ? err.message : String(err);
              out.write(`[FAIL] Template render: ${message}\n`);
              hasFailure = true;
            }
          }
        }

        const contacts = await ses.listContacts(config.contactListName, config.topicName);

        if (contacts.length === 0) {
          out.write("[WARN] Recipients: 0 subscribed contacts\n");
        } else {
          out.write(`[PASS] Recipients: ${contacts.length} subscribed contacts\n`);
        }

        const remaining = account.max24HourSend - account.sentLast24Hours;
        if (contacts.length > remaining) {
          out.write(
            `[WARN] Quota: ${contacts.length} recipients but only ${remaining} quota remaining\n`
          );
        }

        const suppressed = await ses.listSuppressedDestinations();
        const suppressedSet = new Set(suppressed.map((s) => s.email.toLowerCase()));
        const overlap = contacts.filter((c) => suppressedSet.has(c.email.toLowerCase()));

        if (overlap.length > 0) {
          out.write(
            `[WARN] Suppression: ${overlap.length} contacts are on the suppression list\n`
          );
        } else {
          out.write("[PASS] Suppression: no overlap with suppression list\n");
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        out.error(`Error: ${message}\n`);
        hasFailure = true;
      }

      if (hasFailure) {
        out.setExitCode(1);
      }
    });

  return cmd;
}
