import { Command } from "commander";
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import type { SesService } from "../services/ses.js";
import type { Output } from "../output.js";
import type { NewsletterConfig } from "../config.js";
import { extractSubject } from "../lib/html.js";
import { isValidEmail } from "../lib/validation.js";

export function createSendCommand(
  ses: SesService,
  out: Output,
  getConfig: () => NewsletterConfig
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
    .action(
      async (
        htmlFile: string,
        options: { test?: string; dryRun?: boolean }
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

        const subject =
          extractSubject(html) ?? basename(htmlFile, ".html");

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

        let sent = 0;
        const failed: string[] = [];
        for (const email of recipients) {
          try {
            await ses.sendEmail(
              config.fromAddress,
              email,
              subject,
              html,
              config.replyTo,
              config.contactListName,
              config.topicName
            );
            sent++;
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            out.error(`Failed to send to '${email}': ${msg}\n`);
            failed.push(email);
          }
        }

        out.write(`Sent '${subject}' to ${sent} recipients.\n`);
        if (failed.length > 0) {
          out.error(`Failed to send to ${failed.length}: ${failed.join(", ")}\n`);
          out.setExitCode(1);
        }
      }
    );

  return cmd;
}
