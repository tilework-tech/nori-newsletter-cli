import pThrottle from "p-throttle";
import type { SesService } from "../services/ses.js";
import type { Output } from "../output.js";
import type { NewsletterConfig } from "../config.js";
import type { SendJournal } from "./send-journal.js";

export interface SendResult {
  sent: number;
  failed: string[];
}

// Shared send loop for `send` and `send-safe`. Sends one SES message per
// recipient at the account's throttled rate, emits per-recipient progress so an
// interrupted run shows how far it got, and records each success to the journal
// (when provided) so a re-run can resume without re-sending.
export async function runSend(
  ses: SesService,
  out: Output,
  config: NewsletterConfig,
  recipients: string[],
  subject: string,
  html: string,
  journal: SendJournal | null
): Promise<SendResult> {
  const maxRate = await ses.getMaxSendRate();
  const effectiveRate = Math.max(1, Math.floor(maxRate * 0.8));
  const throttle = pThrottle({ limit: effectiveRate, interval: 1000 });

  const total = recipients.length;
  let completed = 0;
  let sent = 0;
  const failed: string[] = [];

  const throttledSend = throttle((email: string) =>
    ses.sendEmail(
      config.fromAddress,
      email,
      subject,
      html,
      config.replyTo,
      config.contactListName,
      config.topicName
    )
  );

  await Promise.all(
    recipients.map((email) =>
      throttledSend(email).then(
        () => {
          journal?.record(email);
          sent++;
          completed++;
          out.write(`[${completed}/${total}] sent ${email}\n`);
        },
        (reason: unknown) => {
          completed++;
          const msg = reason instanceof Error ? reason.message : String(reason);
          failed.push(email);
          out.error(`[${completed}/${total}] FAILED ${email}: ${msg}\n`);
        }
      )
    )
  );

  return { sent, failed };
}
