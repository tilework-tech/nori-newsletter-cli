import { Command } from "commander";
import pThrottle from "p-throttle";
import type { SesService } from "../services/ses.js";
import type { Output } from "../output.js";
import type { NewsletterConfig } from "../config.js";

export function createValidateCommand(
  ses: SesService,
  out: Output,
  getConfig: () => NewsletterConfig
): Command {
  const cmd = new Command("validate").description(
    "Validate email addresses using SES email address insights. " +
      "Use 'check' to validate a single address or 'list' to validate all contacts."
  );

  cmd
    .command("check")
    .description("Validate a single email address")
    .argument("<email>", "Email address to validate")
    .action(async (email: string) => {
      try {
        const result = await ses.getEmailAddressInsights(email);
        const e = result.evaluations;

        out.write(`Validation results for ${email}:\n`);
        out.write(`  Overall: ${result.isValid}\n`);
        out.write(`  Syntax: ${e.hasValidSyntax}\n`);
        out.write(`  DNS Records: ${e.hasValidDnsRecords}\n`);
        out.write(`  Mailbox Exists: ${e.mailboxExists}\n`);
        out.write(`  Role Address: ${e.isRoleAddress}\n`);
        out.write(`  Disposable: ${e.isDisposable}\n`);
        out.write(`  Random Input: ${e.isRandomInput}\n`);
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "BadRequestException") {
          out.error(`Error: Invalid email address '${email}'.\n`);
          out.setExitCode(1);
          return;
        }
        throw err;
      }
    });

  cmd
    .command("list")
    .description("Validate all contacts in the configured contact list")
    .action(async () => {
      const config = getConfig();
      const contacts = await ses.listContacts(
        config.contactListName,
        config.topicName
      );

      if (contacts.length === 0) {
        out.write("No contacts to validate.\n");
        return;
      }

      out.write(`Validating ${contacts.length} contacts...\n`);

      const throttle = pThrottle({ limit: 1, interval: 1000 });
      const throttledValidate = throttle((email: string) =>
        ses.getEmailAddressInsights(email)
      );

      let valid = 0;
      let uncertain = 0;
      let invalid = 0;
      const failed: string[] = [];

      const results = await Promise.allSettled(
        contacts.map((contact) =>
          throttledValidate(contact.email).then((result) => ({
            email: contact.email,
            result,
          }))
        )
      );

      for (const outcome of results) {
        if (outcome.status === "fulfilled") {
          const { email, result } = outcome.value;
          out.write(`  ${email}: ${result.isValid}\n`);

          if (result.isValid === "HIGH") valid++;
          else if (result.isValid === "MEDIUM") uncertain++;
          else invalid++;
        } else {
          const msg =
            outcome.reason instanceof Error
              ? outcome.reason.message
              : String(outcome.reason);
          failed.push(msg);
        }
      }

      if (failed.length > 0) {
        out.write(`  ${failed.length} failed to validate\n`);
      }

      out.write(
        `\nSummary: ${valid} valid, ${uncertain} uncertain, ${invalid} invalid out of ${contacts.length} contacts.\n`
      );
    });

  return cmd;
}
