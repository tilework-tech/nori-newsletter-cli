import { Command } from "commander";
import type { SesService } from "../services/ses.js";
import type { Output } from "../output.js";
import type { NewsletterConfig } from "../config.js";

async function findOverlap(
  ses: SesService,
  config: { contactListName: string; topicName: string }
): Promise<Array<{ email: string; reason: string; lastUpdateTime: Date }>> {
  const [contacts, suppressed] = await Promise.all([
    ses.listContacts(config.contactListName, config.topicName),
    ses.listSuppressedDestinations(),
  ]);

  const suppressedMap = new Map(
    suppressed.map((s) => [s.email.toLowerCase(), s])
  );

  return contacts
    .filter((c) => suppressedMap.has(c.email.toLowerCase()))
    .map((c) => {
      const s = suppressedMap.get(c.email.toLowerCase())!;
      return { email: c.email, reason: s.reason, lastUpdateTime: s.lastUpdateTime };
    });
}

export function createCleanupCommand(
  ses: SesService,
  out: Output,
  getConfig: () => NewsletterConfig
): Command {
  const cmd = new Command("cleanup");

  cmd.description(
    "Cross-reference contacts with account suppression list. " +
      "Use 'report' to see which subscribed contacts have bounced or complained, " +
      "or 'run' to unsubscribe or remove them."
  );

  cmd
    .command("report")
    .description(
      "List subscribed contacts that are on the account suppression list."
    )
    .action(async () => {
      const config = getConfig();

      try {
        const overlap = await findOverlap(ses, config);

        if (overlap.length === 0) {
          out.write("No suppressed contacts found in the subscriber list.\n");
          return;
        }

        out.write(`Found ${overlap.length} subscribed contacts on the suppression list:\n\n`);
        for (const entry of overlap) {
          out.write(`  ${entry.email} — ${entry.reason} (${entry.lastUpdateTime.toISOString()})\n`);
        }
        out.write(`\nTotal: ${overlap.length}\n`);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        out.error(`Error: ${message}\n`);
        out.setExitCode(1);
      }
    });

  cmd
    .command("run")
    .description(
      "Remove or unsubscribe contacts that are on the suppression list."
    )
    .option(
      "--action <action>",
      "Action to take: 'unsubscribe' (set UnsubscribeAll) or 'remove' (delete contact)",
      "unsubscribe"
    )
    .option("--confirm", "Required flag to confirm bulk modification")
    .action(async (options: { action: string; confirm?: boolean }) => {
      const validActions = ["unsubscribe", "remove"];
      if (!validActions.includes(options.action)) {
        out.error(`Error: Invalid action '${options.action}'. Must be 'unsubscribe' or 'remove'.\n`);
        out.setExitCode(1);
        return;
      }

      if (!options.confirm) {
        out.error("Error: --confirm flag is required for bulk modifications.\n");
        out.setExitCode(1);
        return;
      }

      const config = getConfig();
      let processed = 0;

      try {
        const overlap = await findOverlap(ses, config);

        if (overlap.length === 0) {
          out.write("No suppressed contacts found in the subscriber list.\n");
          return;
        }

        for (const entry of overlap) {
          if (options.action === "remove") {
            await ses.deleteContact(config.contactListName, entry.email);
          } else {
            await ses.updateContact(config.contactListName, entry.email, {
              unsubscribeAll: true,
            });
          }
          processed++;
        }

        const actionWord = options.action === "remove" ? "removed" : "unsubscribed";
        out.write(`${processed} contacts ${actionWord}.\n`);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        out.error(`Error after processing ${processed} contacts: ${message}\n`);
        out.setExitCode(1);
      }
    });

  return cmd;
}
