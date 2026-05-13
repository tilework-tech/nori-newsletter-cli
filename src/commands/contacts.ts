import { Command } from "commander";
import { readFileSync } from "node:fs";
import type { SesService } from "../services/ses.js";
import type { Output } from "../output.js";
import type { NewsletterConfig } from "../config.js";
import { parseCsv } from "../lib/csv.js";
import { isValidEmail } from "../lib/validation.js";

export function createContactsCommand(
  ses: SesService,
  out: Output,
  getConfig: () => NewsletterConfig
): Command {
  const cmd = new Command("contacts");

  cmd.description(
    "Manage newsletter subscribers in the SES contact list. " +
      "Supports adding, importing, listing, and removing contacts. " +
      "The contact list must be initialized first with the 'init' command."
  );

  cmd
    .command("add")
    .description(
      "Add a single subscriber to the newsletter. " +
        "Requires a valid email address. Optionally accepts --name and --company metadata. " +
        "If the contact already exists, reports it and exits successfully."
    )
    .argument("<email>", "Email address to subscribe")
    .option("--name <name>", "Subscriber name")
    .option("--company <company>", "Subscriber company")
    .action(async (email: string, options: { name?: string; company?: string }) => {
      const config = getConfig();
      if (!isValidEmail(email)) {
        out.error(
          `Error: '${email}' is not a valid email address.\n` +
            "See src/lib/validation.ts for the validation logic.\n"
        );
        out.setExitCode(1);
        return;
      }

      const attributes: Record<string, string> = {};
      if (options.name) attributes.name = options.name;
      if (options.company) attributes.company = options.company;

      try {
        await ses.createContact(
          config.contactListName,
          email,
          config.topicName,
          Object.keys(attributes).length > 0 ? attributes : undefined
        );
        out.write(`Added '${email}' to the newsletter.\n`);
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AlreadyExistsException") {
          out.write(`Contact '${email}' already exists.\n`);
          return;
        }
        throw err;
      }
    });

  cmd
    .command("import")
    .description(
      "Import subscribers from a CSV file. " +
        "The CSV must have a header row with columns: email,name,company,added_date. " +
        "Skips rows with invalid email addresses and reports them. " +
        "Existing contacts are skipped gracefully."
    )
    .argument("<csv-file>", "Path to CSV file with subscriber data")
    .action(async (csvFile: string) => {
      const config = getConfig();
      let content: string;
      try {
        content = readFileSync(csvFile, "utf-8");
      } catch {
        out.error(
          `Error: Could not read file '${csvFile}'.\n` +
            "See src/commands/contacts.ts for details.\n"
        );
        out.setExitCode(1);
        return;
      }

      const contacts = parseCsv(content);
      let added = 0;
      let skipped = 0;
      const skippedEmails: string[] = [];

      for (const contact of contacts) {
        if (!isValidEmail(contact.email)) {
          skipped++;
          skippedEmails.push(contact.email);
          continue;
        }

        const attributes: Record<string, string> = {};
        if (contact.name) attributes.name = contact.name;
        if (contact.company) attributes.company = contact.company;
        if (contact.addedDate) attributes.addedDate = contact.addedDate;

        try {
          await ses.createContact(
            config.contactListName,
            contact.email,
            config.topicName,
            Object.keys(attributes).length > 0 ? attributes : undefined
          );
          added++;
        } catch (err: unknown) {
          if (err instanceof Error && err.name === "AlreadyExistsException") {
            skipped++;
            skippedEmails.push(contact.email);
            continue;
          }
          throw err;
        }
      }

      out.write(`Imported ${added} contacts.\n`);
      if (skipped > 0) {
        out.write(
          `Skipped ${skipped}: ${skippedEmails.join(", ")}\n`
        );
      }
    });

  cmd
    .command("list")
    .description(
      "List all subscribed contacts in the newsletter. " +
        "Shows email addresses of all opted-in subscribers."
    )
    .action(async () => {
      const config = getConfig();
      const contacts = await ses.listContacts(config.contactListName, config.topicName);

      out.write(`${contacts.length} subscribers:\n`);
      for (const contact of contacts) {
        out.write(`  ${contact.email}\n`);
      }
    });

  cmd
    .command("remove")
    .description(
      "Remove a subscriber from the newsletter. " +
        "Permanently deletes the contact from the SES contact list. " +
        "Fails if the contact does not exist."
    )
    .argument("<email>", "Email address to remove")
    .action(async (email: string) => {
      const config = getConfig();
      try {
        await ses.deleteContact(config.contactListName, email);
        out.write(`Removed '${email}' from the newsletter.\n`);
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "NotFoundException") {
          out.error(
            `Error: Contact '${email}' not found.\n` +
              "See src/commands/contacts.ts for details.\n"
          );
          out.setExitCode(1);
          return;
        }
        throw err;
      }
    });

  return cmd;
}
