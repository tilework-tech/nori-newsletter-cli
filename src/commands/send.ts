import { Command } from "commander";
import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import type { SesService } from "../services/ses.js";
import type { Output } from "../output.js";
import type { NewsletterConfig } from "../config.js";
import { extractSubject } from "../lib/html.js";
import { isValidEmail } from "../lib/validation.js";
import { runSend } from "../lib/send-runner.js";
import {
  buildTracking,
  campaignIdFromFile,
  NO_CONFIG_SET_WARNING,
} from "../lib/campaign.js";
import {
  defaultJournalPath,
  openJournal,
  type SendJournal,
} from "../lib/send-journal.js";
import {
  announceDetachedSend,
  defaultDetachLauncher,
  type DetachLauncher,
} from "../lib/detach.js";

export function createSendCommand(
  ses: SesService,
  out: Output,
  getConfig: () => NewsletterConfig,
  launchDetached: DetachLauncher = defaultDetachLauncher
): Command {
  const cmd = new Command("send");

  cmd
    .description(
      "Send an HTML newsletter to all subscribed contacts. " +
        "Reads the specified HTML file, extracts the subject from the <title> tag, " +
        "and sends it individually to each opted-in subscriber via AWS SES. " +
        "Use --test to send only to specific test recipients. " +
        "Use --dry-run to preview what would be sent without actually sending."
    )
    .argument("<html-file>", "Path to the newsletter HTML file to send")
    .option(
      "--test <emails>",
      "Comma-separated test recipient emails (skips contact list)"
    )
    .option("--dry-run", "Show what would be sent without sending")
    .option(
      "--no-resume",
      "Ignore saved progress and send to every recipient"
    )
    .option(
      "--state-file <path>",
      "Path to the send-progress journal (default: durable state dir, keyed by file + content)"
    )
    .option(
      "--detach",
      "Run the send in a detached background process and return immediately"
    )
    .action(
      async (
        htmlFile: string,
        options: {
          test?: string;
          dryRun?: boolean;
          resume?: boolean;
          stateFile?: string;
          detach?: boolean;
        }
      ) => {
        const config = getConfig();

        let html: string;
        try {
          html = readFileSync(htmlFile, "utf-8");
        } catch {
          out.error(
            `Error: Could not read file '${htmlFile}'.\n` +
              "See src/commands/send.ts for details.\n"
          );
          out.setExitCode(1);
          return;
        }

        // Detach before doing any real work: never hold a long-running send in
        // the foreground (a foreground process can be killed by a caller's
        // timeout, and the resume journal is what makes a restart safe).
        if (options.detach && !options.dryRun && !options.test) {
          announceDetachedSend(
            out,
            launchDetached,
            resolve(htmlFile),
            "background send"
          );
          return;
        }

        const subject =
          extractSubject(html) ?? basename(htmlFile, ".html");
        const campaignId = campaignIdFromFile(htmlFile);
        const tracking = buildTracking(config.configurationSetName, campaignId);

        let recipients: string[];
        if (options.test) {
          recipients = options.test.split(",").map((e) => e.trim());
          const invalid = recipients.filter((e) => !isValidEmail(e));
          if (invalid.length > 0) {
            out.error(
              `Error: Invalid test email(s): ${invalid.join(", ")}\n` +
                "See src/lib/validation.ts for the validation logic.\n"
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
            `[dry run] Would send '${subject}' to ${recipients.length} recipients:\n`
          );
          out.write(`[dry run] Campaign: ${campaignId}\n`);
          for (const email of recipients) {
            out.write(`  ${email}\n`);
          }
          return;
        }

        if (recipients.length === 0) {
          out.write(
            `Sent to 0 recipients. No subscribers found.\n`
          );
          return;
        }

        // Resume is enabled for full-list sends (not --test, which is an
        // explicit one-off set). The journal records each successful send so a
        // re-run after an interruption skips what already went out.
        let journal: SendJournal | null = null;
        if (!options.test && options.resume !== false) {
          const journalPath =
            options.stateFile ?? defaultJournalPath(htmlFile, html);
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
          if (journal.alreadySent.size === 0) {
            out.write(
              `No saved progress found. Sending to ${recipients.length} recipients (journal: ${journalPath}).\n`
            );
          }
        }

        // Once per run, not per recipient: without a configuration set this
        // send is invisible to open/click reporting, but that is not fatal.
        if (!tracking) {
          out.error(NO_CONFIG_SET_WARNING);
        }

        const { sent, failed } = await runSend(
          ses,
          out,
          config,
          recipients,
          subject,
          html,
          journal,
          tracking
        );

        out.write(`Sent '${subject}' to ${sent} recipients.\n`);
        if (failed.length > 0) {
          out.error(`Failed to send to ${failed.length}: ${failed.join(", ")}\n`);
          out.setExitCode(1);
        }
      }
    );

  return cmd;
}
