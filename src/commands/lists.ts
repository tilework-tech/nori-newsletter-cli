import { Command } from "commander";
import type { SesService } from "../services/ses.js";
import type { Output } from "../output.js";
import type { NewsletterConfig } from "../config.js";

export function createListsCommand(
  ses: SesService,
  out: Output,
  getConfig: () => NewsletterConfig
): Command {
  const cmd = new Command("lists");

  cmd.description(
    "Manage SES contact lists. " +
      "View, update, and delete contact lists and their topics."
  );

  cmd
    .command("list")
    .description("List all contact lists in the SES account.")
    .action(async () => {
      const lists = await ses.listContactLists();

      const label = lists.length === 1 ? "contact list" : "contact lists";
      out.write(`${lists.length} ${label}:\n`);
      for (const list of lists) {
        out.write(
          `  ${list.name} (updated ${list.lastUpdatedTimestamp.toISOString()})\n`
        );
      }
    });

  cmd
    .command("show")
    .description(
      "Show details of a contact list including topics, description, and timestamps."
    )
    .argument("<name>", "Contact list name")
    .action(async (name: string) => {
      const list = await ses.getContactList(name);

      if (!list) {
        out.error(`Error: Contact list '${name}' not found.\n`);
        out.setExitCode(1);
        return;
      }

      out.write(`Name: ${list.name}\n`);
      if (list.description) {
        out.write(`Description: ${list.description}\n`);
      }
      if (list.createdTimestamp) {
        out.write(`Created: ${list.createdTimestamp.toISOString()}\n`);
      }
      if (list.lastUpdatedTimestamp) {
        out.write(`Updated: ${list.lastUpdatedTimestamp.toISOString()}\n`);
      }

      if (list.topics.length === 0) {
        out.write(`No topics.\n`);
      } else {
        out.write(`Topics:\n`);
        for (const topic of list.topics) {
          out.write(
            `  ${topic.topicName} — ${topic.displayName} (default: ${topic.defaultSubscriptionStatus})\n`
          );
          if (topic.description) {
            out.write(`    ${topic.description}\n`);
          }
        }
      }

      if (list.tags.length > 0) {
        out.write(`Tags:\n`);
        for (const tag of list.tags) {
          out.write(`  ${tag.key}: ${tag.value}\n`);
        }
      }
    });

  cmd
    .command("update")
    .description(
      "Update a contact list's description or topics. " +
        "Uses GET-then-PUT to preserve existing data. " +
        "Use --add-topic to add a topic (format: name:displayName:OPT_IN|OPT_OUT). " +
        "Use --remove-topic to remove a topic by name."
    )
    .argument("<name>", "Contact list name")
    .option("--description <text>", "New description for the contact list")
    .option(
      "--add-topic <spec>",
      "Add a topic (format: topicName:displayName:OPT_IN|OPT_OUT)"
    )
    .option("--remove-topic <topicName>", "Remove a topic by name")
    .action(
      async (
        name: string,
        options: {
          description?: string;
          addTopic?: string;
          removeTopic?: string;
        }
      ) => {
        const current = await ses.getContactList(name);

        if (!current) {
          out.error(`Error: Contact list '${name}' not found.\n`);
          out.setExitCode(1);
          return;
        }

        let topics = current.topics;

        if (options.removeTopic) {
          const exists = topics.some(
            (t) => t.topicName === options.removeTopic
          );
          if (!exists) {
            out.error(
              `Error: Topic '${options.removeTopic}' not found on list '${name}'.\n`
            );
            out.setExitCode(1);
            return;
          }
          topics = topics.filter((t) => t.topicName !== options.removeTopic);
        }

        if (options.addTopic) {
          const parts = options.addTopic.split(":");
          if (parts.length < 3) {
            out.error(
              `Error: Invalid topic format '${options.addTopic}'. Use topicName:displayName:OPT_IN|OPT_OUT.\n`
            );
            out.setExitCode(1);
            return;
          }
          const status = parts[parts.length - 1];
          if (status !== "OPT_IN" && status !== "OPT_OUT") {
            out.error(
              `Error: Invalid default subscription status '${status}'. Must be OPT_IN or OPT_OUT.\n`
            );
            out.setExitCode(1);
            return;
          }
          topics = [
            ...topics,
            {
              topicName: parts[0],
              displayName: parts.slice(1, -1).join(":"),
              defaultSubscriptionStatus: status,
            },
          ];
        }

        await ses.updateContactList(name, {
          description: options.description,
          topics,
        });

        out.write(`Updated contact list '${name}'.\n`);
      }
    );

  cmd
    .command("delete")
    .description(
      "Delete a contact list and all its contacts. This action cannot be undone."
    )
    .argument("<name>", "Contact list name")
    .action(async (name: string) => {
      try {
        await ses.deleteContactList(name);
        out.write(`Deleted contact list '${name}' and all its contacts.\n`);
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "NotFoundException") {
          out.error(`Error: Contact list '${name}' not found.\n`);
          out.setExitCode(1);
          return;
        }
        throw err;
      }
    });

  return cmd;
}
