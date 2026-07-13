import { Command } from "commander";
import { createHash } from "node:crypto";
import pThrottle from "p-throttle";
import type { SesService } from "../services/ses.js";
import type { Output } from "../output.js";
import type { NewsletterConfig } from "../config.js";
import { isValidEmail } from "../lib/validation.js";
import {
  journalPathForKey,
  openJournal,
  type SendJournal,
} from "../lib/send-journal.js";
import {
  announceDetachedSend,
  defaultDetachLauncher,
  type DetachLauncher,
} from "../lib/detach.js";

const BATCH_SIZE = 50;

// A bulk send is identified by its template, audience (contact list + topic), and
// default data, so a re-run of the same campaign resumes while a different
// audience or template starts fresh.
function bulkJournalKey(
  templateName: string,
  contactList: string,
  topic: string,
  data?: string
): string {
  return createHash("sha256")
    .update(`bulk\n${templateName}\n${contactList}\n${topic}\n${data ?? ""}`)
    .digest("hex")
    .slice(0, 32);
}

export function createBulkSendCommand(
  ses: SesService,
  out: Output,
  getConfig: () => NewsletterConfig,
  launchDetached: DetachLauncher = defaultDetachLauncher
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
    .option("--no-resume", "Ignore saved progress and send to every recipient")
    .option(
      "--state-file <path>",
      "Path to the send-progress journal (default: durable state dir, keyed by template + data)"
    )
    .option(
      "--detach",
      "Run the bulk send in a detached background process and return immediately"
    )
    .action(
      async (
        templateName: string,
        options: {
          data?: string;
          test?: string;
          dryRun?: boolean;
          resume?: boolean;
          stateFile?: string;
          detach?: boolean;
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

        // Detach before listing recipients or sending, so no bulk send is ever
        // held in the foreground.
        if (options.detach && !options.dryRun && !options.test) {
          announceDetachedSend(
            out,
            launchDetached,
            `bulk:${templateName}`,
            "background bulk send"
          );
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

        // Resume for full-list sends (not --test). Records each successful
        // recipient so a re-run after an interruption skips what already went out.
        let journal: SendJournal | null = null;
        if (!options.test && options.resume !== false) {
          const journalPath =
            options.stateFile ??
            journalPathForKey(
              bulkJournalKey(
                templateName,
                config.contactListName,
                config.topicName,
                options.data
              )
            );
          journal = openJournal(journalPath);
          const total = recipients.length;
          if (journal.alreadySent.size > 0) {
            recipients = recipients.filter(
              (email) => !journal!.alreadySent.has(email.toLowerCase())
            );
            const skipped = total - recipients.length;
            if (skipped > 0) {
              out.write(
                `Resuming previous send: ${skipped} already sent, ${recipients.length} remaining.\n`
              );
            }
          }
          if (recipients.length === 0) {
            out.write(
              `All ${total} recipients already sent. Use --no-resume to send again. (journal: ${journalPath})\n`
            );
            return;
          }
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
          (entries: Array<{ to: string }>) =>
            ses.sendBulkEmail({
              from: config.fromAddress,
              replyTo: config.replyTo,
              templateName,
              defaultTemplateData: options.data,
              entries,
            })
        );

        // Record each batch's successes as soon as that batch settles (not after
        // the whole run), so a kill/timeout mid-send keeps the progress already
        // made and a re-run resumes instead of re-sending the entire list.
        await Promise.all(
          batches.map((batch) =>
            throttledSendBatch(batch).then(
              (results) => {
                for (let i = 0; i < results.length; i++) {
                  if (results[i].status === "SUCCESS") {
                    totalSent++;
                    journal?.record(batch[i].to);
                  } else {
                    failures.push({
                      email: batch[i].to,
                      error: results[i].error ?? results[i].status,
                    });
                  }
                }
              },
              (reason: unknown) => {
                const msg =
                  reason instanceof Error ? reason.message : String(reason);
                for (const entry of batch) {
                  failures.push({ email: entry.to, error: msg });
                }
              }
            )
          )
        );

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
