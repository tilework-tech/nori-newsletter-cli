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
      "Supports adding, importing, listing, updating, and removing contacts. " +
      "Use 'status' to view a contact's subscription details. " +
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
      "List contacts in the newsletter. " +
        "Shows opted-in subscribers by default. " +
        "Use --unsubscribed to show contacts who have opted out."
    )
    .option("--unsubscribed", "Show unsubscribed contacts instead of subscribed")
    .action(async (options: { unsubscribed?: boolean }) => {
      const config = getConfig();

      const contacts = options.unsubscribed
        ? await ses.listUnsubscribedContacts(config.contactListName, config.topicName)
        : await ses.listContacts(config.contactListName, config.topicName);
      const label = options.unsubscribed ? "unsubscribed" : "subscribers";

      out.write(`${contacts.length} ${label}:\n`);
      for (const contact of contacts) {
        out.write(`  ${contact.email}\n`);
      }
    });

  cmd
    .command("status")
    .description(
      "Show detailed status for a contact. " +
        "Displays subscription status, topic preferences, and attributes."
    )
    .argument("<email>", "Email address to check")
    .action(async (email: string) => {
      const config = getConfig();
      const contact = await ses.getContact(config.contactListName, email);

      if (!contact) {
        out.error(`Error: Contact '${email}' not found.\n`);
        out.setExitCode(1);
        return;
      }

      out.write(`Contact: ${contact.email}\n`);
      out.write(`Unsubscribe all: ${contact.unsubscribeAll}\n`);

      if (contact.topicPreferences.length > 0) {
        out.write("Topics:\n");
        for (const tp of contact.topicPreferences) {
          out.write(`  ${tp.topicName}: ${tp.status}\n`);
        }
      }

      if (contact.attributes && Object.keys(contact.attributes).length > 0) {
        out.write("Attributes:\n");
        for (const [key, value] of Object.entries(contact.attributes)) {
          out.write(`  ${key}: ${value}\n`);
        }
      }
    });

  cmd
    .command("update")
    .description(
      "Update a contact's attributes or subscription status. " +
        "Use --resubscribe to opt a contact back in. " +
        "Use --name and --company to update metadata."
    )
    .argument("<email>", "Email address to update")
    .option("--name <name>", "Update subscriber name")
    .option("--company <company>", "Update subscriber company")
    .option("--resubscribe", "Resubscribe an opted-out contact")
    .action(
      async (
        email: string,
        options: { name?: string; company?: string; resubscribe?: boolean }
      ) => {
        const config = getConfig();

        const contact = await ses.getContact(config.contactListName, email);
        if (!contact) {
          out.error(`Error: Contact '${email}' not found.\n`);
          out.setExitCode(1);
          return;
        }

        const updateOptions: {
          topicPreferences?: Array<{ topicName: string; status: string }>;
          unsubscribeAll?: boolean;
          attributes?: Record<string, string>;
        } = {};

        if (options.resubscribe) {
          updateOptions.topicPreferences = contact.topicPreferences.map((tp) =>
            tp.topicName === config.topicName
              ? { topicName: tp.topicName, status: "OPT_IN" }
              : tp
          );
          updateOptions.unsubscribeAll = false;
        }

        const attrs: Record<string, string> = {};
        if (options.name) attrs.name = options.name;
        if (options.company) attrs.company = options.company;
        if (Object.keys(attrs).length > 0) {
          updateOptions.attributes = attrs;
        }

        try {
          await ses.updateContact(config.contactListName, email, updateOptions);
        } catch (err: unknown) {
          if (err instanceof Error && err.name === "NotFoundException") {
            out.error(`Error: Contact '${email}' not found.\n`);
            out.setExitCode(1);
            return;
          }
          throw err;
        }

        if (options.resubscribe) {
          out.write(`Contact '${email}' has been resubscribed.\n`);
        } else {
          out.write(`Updated contact '${email}'.\n`);
        }
      }
    );

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
