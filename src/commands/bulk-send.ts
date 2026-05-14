import { Command } from "commander";
import pThrottle from "p-throttle";
import type { SesService } from "../services/ses.js";
import type { Output } from "../output.js";
import type { NewsletterConfig } from "../config.js";
import { isValidEmail } from "../lib/validation.js";

const BATCH_SIZE = 50;

export function createBulkSendCommand(
  ses: SesService,
  out: Output,
  getConfig: () => NewsletterConfig
): Command {
  const cmd = new Command("bulk-send");

  cmd
    .description(
      "Send a templated newsletter to multiple recipients using the SES bulk send API. " +
        "Uses SendBulkEmail to batch up to 50 recipients per API call. " +
        "Requires a pre-existing SES template (manage with 'templates' command). " +
        "Note: bulk send does not support automatic unsubscribe link management. " +
        "Use --test to send only to specific test recipients. " +
        "Use --dry-run to preview what would be sent without actually sending."
    )
    .argument("<template>", "Name of the SES email template to use")
    .option(
      "--data <json>",
      "Default template data as a JSON string (e.g. '{\"name\":\"friend\"}')"
    )
    .option(
      "--test <emails>",
      "Comma-separated test recipient emails (skips contact list)"
    )
    .option("--dry-run", "Show what would be sent without sending")
    .action(
      async (
        templateName: string,
        options: {
          data?: string;
          test?: string;
          dryRun?: boolean;
        }
      ) => {
        const config = getConfig();

        if (options.data) {
          try {
            JSON.parse(options.data);
          } catch {
            out.error(
              `Error: Invalid JSON for --data option.\n` +
                "Provide valid JSON, e.g. '{\"name\":\"value\"}'\n"
            );
            out.setExitCode(1);
            return;
          }
        }

        const template = await ses.getTemplate(templateName);
        if (!template) {
          out.error(
            `Error: Template '${templateName}' not found.\n` +
              "Use 'templates list' to see available templates.\n"
          );
          out.setExitCode(1);
          return;
        }

        let recipients: string[];
        if (options.test) {
          recipients = options.test.split(",").map((e) => e.trim());
          const invalid = recipients.filter((e) => !isValidEmail(e));
          if (invalid.length > 0) {
            out.error(
              `Error: Invalid test email(s): ${invalid.join(", ")}\n`
            );
            out.setExitCode(1);
            return;
          }
        } else {
          const contacts = await ses.listContacts(
            config.contactListName,
            config.topicName
          );
          recipients = contacts.map((c) => c.email);
        }

        if (options.dryRun) {
          out.write(
            `[dry run] Would bulk send template '${templateName}' to ${recipients.length} recipients:\n`
          );
          for (const email of recipients) {
            out.write(`  ${email}\n`);
          }
          return;
        }

        if (recipients.length === 0) {
          out.write(
            `Bulk sent to 0 recipients. No subscribers found.\n`
          );
          return;
        }

        const maxRate = await ses.getMaxSendRate();
        const effectiveRate = Math.max(1, Math.floor(maxRate * 0.8));
        const msPerBatch = Math.ceil((BATCH_SIZE / effectiveRate) * 1000);
        const throttle = pThrottle({
          limit: 1,
          interval: msPerBatch,
        });

        const batches: Array<Array<{ to: string }>> = [];
        for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
          batches.push(
            recipients.slice(i, i + BATCH_SIZE).map((email) => ({
              to: email,
            }))
          );
        }

        let totalSent = 0;
        const failures: Array<{ email: string; error: string }> = [];

        const throttledSendBatch = throttle(
          async (entries: Array<{ to: string }>) => {
            return ses.sendBulkEmail({
              from: config.fromAddress,
              replyTo: config.replyTo,
              templateName,
              defaultTemplateData: options.data,
              entries,
            });
          }
        );

        const batchResults = await Promise.allSettled(
          batches.map((batch) => throttledSendBatch(batch))
        );

        for (let batchIdx = 0; batchIdx < batchResults.length; batchIdx++) {
          const batchResult = batchResults[batchIdx];
          const batch = batches[batchIdx];

          if (batchResult.status === "rejected") {
            for (const entry of batch) {
              failures.push({
                email: entry.to,
                error:
                  batchResult.reason instanceof Error
                    ? batchResult.reason.message
                    : String(batchResult.reason),
              });
            }
            continue;
          }

          const results = batchResult.value;
          for (let i = 0; i < results.length; i++) {
            if (results[i].status === "SUCCESS") {
              totalSent++;
            } else {
              failures.push({
                email: batch[i].to,
                error: results[i].error ?? results[i].status,
              });
            }
          }
        }

        out.write(
          `Bulk sent template '${templateName}' to ${totalSent} recipients.\n`
        );

        if (failures.length > 0) {
          out.error(
            `Failed to send to ${failures.length}: ${failures.map((f) => f.email).join(", ")}\n`
          );
          for (const f of failures) {
            out.error(`  ${f.email}: ${f.error}\n`);
          }
          out.setExitCode(1);
        }
      }
    );

  return cmd;
}
