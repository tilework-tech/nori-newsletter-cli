import { Command } from "commander";
import type { SesService } from "./services/ses.js";
import type { Output } from "./output.js";
import type { NewsletterConfig } from "./config.js";
import { createInitCommand } from "./commands/init.js";
import { createContactsCommand } from "./commands/contacts.js";
import { createSendCommand } from "./commands/send.js";

export function createProgram(
  ses: SesService,
  out: Output,
  getConfig: () => NewsletterConfig
): Command {
  const program = new Command();

  program
    .name("nori-newsletter-cli")
    .version("1.0.0")
    .description(
      "CLI for managing and sending newsletters via AWS SES. " +
        "Use 'init' to set up the contact list, 'contacts' to manage subscribers, " +
        "and 'send' to deliver newsletters. Requires AWS credentials configured " +
        "via environment variables (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION) " +
        "and a newsletter.config.json file."
    )
    .showSuggestionAfterError(true)
    .showHelpAfterError("(use --help for usage information)")
    .configureOutput({
      getOutHasColors: () => false,
      getErrHasColors: () => false,
    });

  program.addCommand(createInitCommand(ses, out, getConfig));
  program.addCommand(createContactsCommand(ses, out, getConfig));
  program.addCommand(createSendCommand(ses, out, getConfig));

  return program;
}
