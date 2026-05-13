import { Command } from "commander";
import type { SesService } from "../services/ses.js";
import type { Output } from "../output.js";
import type { NewsletterConfig } from "../config.js";

export function createInitCommand(
  ses: SesService,
  out: Output,
  getConfig: () => NewsletterConfig
): Command {
  const cmd = new Command("init");

  cmd
    .description(
      "Initialize the SES contact list for the newsletter. " +
        "Creates a contact list using contactListName and topicName from the config. " +
        "Safe to run multiple times; reports success if the list already exists."
    )
    .action(async () => {
      const config = getConfig();
      try {
        await ses.createContactList(config.contactListName, config.topicName);
        out.write(
          `Created contact list '${config.contactListName}' with topic '${config.topicName}'.\n`
        );
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AlreadyExistsException") {
          out.write(
            `Contact list '${config.contactListName}' already exists.\n`
          );
          return;
        }
        throw err;
      }
    });

  return cmd;
}
