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
    .name("nori-newsletter")
    .version("1.0.0")
    .description(
      "CLI for managing and sending newsletters via AWS SES. " +
        "Use 'init' to set up the contact list, 'contacts' to manage subscribers, " +
        "and 'send' to deliver newsletters."
    )
    .showSuggestionAfterError(true)
    .showHelpAfterError("(use --help for usage information)")
    .configureOutput({
      getOutHasColors: () => false,
      getErrHasColors: () => false,
    })
    .addHelpText(
      "after",
      `
Configuration:
  Reads newsletter.config.json from the current directory.

  Required fields:
    contactListName   AWS SES contact list name
    topicName         Topic within the contact list
    fromAddress       Verified SES sender (e.g. "Name <email>")
    replyTo           Reply-to email address

  Example newsletter.config.json:
    {
      "contactListName": "my-newsletter",
      "topicName": "weekly-updates",
      "fromAddress": "My Newsletter <news@example.com>",
      "replyTo": "reply@example.com"
    }

Environment variables:
  AWS_ACCESS_KEY_ID       AWS credentials for SES access
  AWS_SECRET_ACCESS_KEY   AWS secret key
  AWS_REGION              AWS region (e.g. us-east-1)`
    );

  program.addCommand(createInitCommand(ses, out, getConfig));
  program.addCommand(createContactsCommand(ses, out, getConfig));
  program.addCommand(createSendCommand(ses, out, getConfig));

  return program;
}
