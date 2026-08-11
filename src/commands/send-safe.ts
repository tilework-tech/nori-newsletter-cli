import { Command } from "commander";
import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import type { SesService } from "../services/ses.js";
import type { Output } from "../output.js";
import type { NewsletterConfig } from "../config.js";
import { extractSubject } from "../lib/html.js";
import { extractEmail } from "../lib/email.js";
import { isValidEmail } from "../lib/validation.js";
import { runSend } from "../lib/send-runner.js";
import {
  buildTracking,
  campaignIdFromFile,
  NO_CONFIG_SET_WARNING,
  type SendTracking,
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

export function createSendSafeCommand(
  ses: SesService,
  out: Output,
  getConfig: () => NewsletterConfig,
  launchDetached: DetachLauncher = defaultDetachLauncher
): Command {
  const cmd = new Command("send-safe");

  cmd
    .description(
      "Send a newsletter with built-in safety checks. " +
        "Runs preflight validation (account status, identity verification, quota headroom), " +
        "filters out suppressed contacts, then sends using SendEmail with automatic " +
        "unsubscribe link management (ListManagementOptions). " +
        "Use --test to send to specific recipients without preflight checks. " +
        "Use --dry-run to run all checks and preview recipients without sending."
    )
    .argument("<html-file>", "Path to the newsletter HTML file to send")
    .option(
      "--test <emails>",
      "Comma-separated test recipient emails (skips preflight checks)"
    )
    .option(
      "--dry-run",
      "Run all checks and show what would be sent without sending"
    )
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
            `Error: Could not read file '${htmlFile}'.\n`
          );
          out.setExitCode(1);
          return;
        }

        if (options.detach && !options.dryRun && !options.test) {
          announceDetachedSend(
            out,
            launchDetached,
            resolve(htmlFile),
            "background send"
          );
          return;
        }

        const subject = extractSubject(html) ?? basename(htmlFile, ".html");
        const campaignId = campaignIdFromFile(htmlFile);
        const tracking = buildTracking(config.configurationSetName, campaignId);

        if (options.test) {
          const recipients = options.test.split(",").map((e) => e.trim());
          const invalid = recipients.filter((e) => !isValidEmail(e));
          if (invalid.length > 0) {
            out.error(
              `Error: Invalid test email(s): ${invalid.join(", ")}\n`
            );
            out.setExitCode(1);
            return;
          }

          await sendEmails(
            ses,
            out,
            config,
            recipients,
            subject,
            html,
            null,
            tracking
          );
          return;
        }

        const bareEmail = extractEmail(config.fromAddress);
        let hasFailure = false;

        let account: Awaited<ReturnType<typeof ses.getAccountInfo>>;
        let identity: Awaited<ReturnType<typeof ses.getIdentity>>;
        let contacts: Awaited<ReturnType<typeof ses.listContacts>>;
        let suppressed: Awaited<ReturnType<typeof ses.listSuppressedDestinations>>;

        try {
          [account, identity, contacts, suppressed] = await Promise.all([
            ses.getAccountInfo(),
            ses.getIdentity(bareEmail),
            ses.listContacts(config.contactListName, config.topicName),
            ses.listSuppressedDestinations(),
          ]);
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          out.error(`Error: ${message}\n`);
          out.setExitCode(1);
          return;
        }

        if (!account.sendingEnabled) {
          out.write("[FAIL] Account: sending is disabled\n");
          hasFailure = true;
        } else {
          out.write("[PASS] Account: sending enabled\n");
        }

        if (account.enforcementStatus !== "HEALTHY") {
          out.write(
            `[WARN] Account: enforcement status is ${account.enforcementStatus}\n`
          );
        }

        if (!account.productionAccessEnabled) {
          out.write("[WARN] Account: running in Sandbox mode\n");
        }

        if (!identity) {
          out.write(`[FAIL] Identity: ${bareEmail} not found in SES\n`);
          hasFailure = true;
        } else if (!identity.verifiedForSending) {
          out.write(
            `[FAIL] Identity: ${bareEmail} not verified (${identity.verificationStatus})\n`
          );
          hasFailure = true;
        } else {
          out.write(`[PASS] Identity: ${bareEmail} verified\n`);
        }

        const suppressedSet = new Set(
          suppressed.map((s) => s.email.toLowerCase())
        );
        const filtered = contacts.filter(
          (c) => !suppressedSet.has(c.email.toLowerCase())
        );
        const filteredCount = contacts.length - filtered.length;

        if (filteredCount > 0) {
          out.write(
            `[WARN] Suppression: ${filteredCount} contacts filtered from suppression list\n`
          );
        } else if (contacts.length > 0) {
          out.write("[PASS] Suppression: no overlap with suppression list\n");
        }

        const remaining = account.max24HourSend - account.sentLast24Hours;
        if (filtered.length > remaining) {
          out.write(
            `[WARN] Quota: ${filtered.length} recipients but only ${remaining} quota remaining\n`
          );
        }

        if (hasFailure) {
          out.setExitCode(1);
          return;
        }

        let recipients = filtered.map((c) => c.email);

        if (recipients.length === 0) {
          if (filteredCount > 0) {
            out.write(
              `Sent to 0 recipients. All ${filteredCount} contacts were filtered by suppression list.\n`
            );
          } else {
            out.write("Sent to 0 recipients. No subscribers found.\n");
          }
          return;
        }

        if (options.dryRun) {
          out.write(
            `[dry run] Would send '${subject}' to ${recipients.length} recipients:\n`
          );
          out.write(`[dry run] Campaign: ${campaignId}\n`);
          for (const email of recipients) {
            out.write(`  ${email}\n`);
          }
          if (filteredCount > 0) {
            out.write(`Filtered ${filteredCount} suppressed contacts.\n`);
          }
          return;
        }

        // Resume is enabled for full-list sends (not --test). The journal
        // records each successful send so a re-run after an interruption skips
        // what already went out.
        let journal: SendJournal | null = null;
        if (options.resume !== false) {
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
            if (filteredCount > 0) {
              out.write(`Filtered ${filteredCount} suppressed contacts.\n`);
            }
            return;
          }
        }

        await sendEmails(
          ses,
          out,
          config,
          recipients,
          subject,
          html,
          journal,
          tracking
        );

        if (filteredCount > 0) {
          out.write(`Filtered ${filteredCount} suppressed contacts.\n`);
        }
      }
    );

  return cmd;
}

async function sendEmails(
  ses: SesService,
  out: Output,
  config: NewsletterConfig,
  recipients: string[],
  subject: string,
  html: string,
  journal: SendJournal | null,
  tracking?: SendTracking
): Promise<void> {
  // Once per run, not per recipient.
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
    out.error(
      `Failed to send to ${failed.length}: ${failed.join(", ")}\n`
    );
    out.setExitCode(1);
  }
}
