import { Command } from "commander";
import { readFileSync } from "node:fs";
import type { SesService } from "../services/ses.js";
import type { Output } from "../output.js";
import type { NewsletterConfig } from "../config.js";

export function createTemplatesCommand(
  ses: SesService,
  out: Output,
  getConfig: () => NewsletterConfig
): Command {
  const cmd = new Command("templates");

  cmd.description(
    "Manage SES email templates. " +
      "Create, view, update, delete, and preview reusable email templates with Handlebars personalization."
  );

  cmd
    .command("create")
    .description(
      "Create a new email template from local HTML and/or text files."
    )
    .argument("<name>", "Template name")
    .option("--subject <subject>", "Email subject line (supports {{variables}})")
    .option("--html <path>", "Path to HTML template file")
    .option("--text <path>", "Path to plain text template file")
    .action(
      async (
        name: string,
        options: { subject?: string; html?: string; text?: string }
      ) => {
        if (!options.subject && !options.html && !options.text) {
          out.error(
            "Error: At least one of --subject, --html, or --text is required.\n"
          );
          out.setExitCode(1);
          return;
        }

        let htmlContent: string | undefined;
        let textContent: string | undefined;

        if (options.html) {
          try {
            htmlContent = readFileSync(options.html, "utf-8");
          } catch {
            out.error(`Error: Could not read file '${options.html}'.\n`);
            out.setExitCode(1);
            return;
          }
        }

        if (options.text) {
          try {
            textContent = readFileSync(options.text, "utf-8");
          } catch {
            out.error(`Error: Could not read file '${options.text}'.\n`);
            out.setExitCode(1);
            return;
          }
        }

        try {
          await ses.createTemplate(name, {
            subject: options.subject,
            html: htmlContent,
            text: textContent,
          });
          out.write(`Created template '${name}'.\n`);
        } catch (err: unknown) {
          if (err instanceof Error && err.name === "AlreadyExistsException") {
            out.error(`Error: Template '${name}' already exists.\n`);
            out.setExitCode(1);
            return;
          }
          throw err;
        }
      }
    );

  cmd
    .command("list")
    .description("List all email templates in the SES account.")
    .action(async () => {
      const templates = await ses.listTemplates();

      const label = templates.length === 1 ? "template" : "templates";
      out.write(`${templates.length} ${label}:\n`);
      for (const t of templates) {
        out.write(
          `  ${t.name} (created ${t.createdTimestamp.toISOString()})\n`
        );
      }
    });

  cmd
    .command("show")
    .description("Show details of an email template including content.")
    .argument("<name>", "Template name")
    .action(async (name: string) => {
      const template = await ses.getTemplate(name);

      if (!template) {
        out.error(`Error: Template '${name}' not found.\n`);
        out.setExitCode(1);
        return;
      }

      out.write(`Name: ${template.name}\n`);
      if (template.subject) {
        out.write(`Subject: ${template.subject}\n`);
      }
      if (template.html) {
        out.write(`\nHTML:\n${template.html}\n`);
      }
      if (template.text) {
        out.write(`\nText:\n${template.text}\n`);
      }
    });

  cmd
    .command("update")
    .description(
      "Update an email template. Only specified fields are changed; " +
        "unspecified fields are preserved (GET-then-PUT)."
    )
    .argument("<name>", "Template name")
    .option("--subject <subject>", "New subject line")
    .option("--html <path>", "Path to new HTML template file")
    .option("--text <path>", "Path to new plain text template file")
    .action(
      async (
        name: string,
        options: { subject?: string; html?: string; text?: string }
      ) => {
        const current = await ses.getTemplate(name);

        if (!current) {
          out.error(`Error: Template '${name}' not found.\n`);
          out.setExitCode(1);
          return;
        }

        let htmlContent: string | undefined;
        if (options.html) {
          try {
            htmlContent = readFileSync(options.html, "utf-8");
          } catch {
            out.error(`Error: Could not read file '${options.html}'.\n`);
            out.setExitCode(1);
            return;
          }
        }

        let textContent: string | undefined;
        if (options.text) {
          try {
            textContent = readFileSync(options.text, "utf-8");
          } catch {
            out.error(`Error: Could not read file '${options.text}'.\n`);
            out.setExitCode(1);
            return;
          }
        }

        await ses.updateTemplate(name, {
          subject: options.subject ?? current.subject,
          html: htmlContent ?? current.html,
          text: textContent ?? current.text,
        });

        out.write(`Updated template '${name}'.\n`);
      }
    );

  cmd
    .command("delete")
    .description("Delete an email template.")
    .argument("<name>", "Template name")
    .action(async (name: string) => {
      try {
        await ses.deleteTemplate(name);
        out.write(`Deleted template '${name}'.\n`);
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "NotFoundException") {
          out.error(`Error: Template '${name}' not found.\n`);
          out.setExitCode(1);
          return;
        }
        throw err;
      }
    });

  cmd
    .command("preview")
    .description(
      "Render an email template with test data and display the output."
    )
    .argument("<name>", "Template name")
    .requiredOption("--data <json>", "JSON string of template variables")
    .action(async (name: string, options: { data: string }) => {
      try {
        JSON.parse(options.data);
      } catch {
        out.error(`Error: Invalid JSON in --data: '${options.data}'.\n`);
        out.setExitCode(1);
        return;
      }

      try {
        const rendered = await ses.testRenderTemplate(name, options.data);
        out.write(rendered + "\n");
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "NotFoundException") {
          out.error(`Error: Template '${name}' not found.\n`);
          out.setExitCode(1);
          return;
        }
        throw err;
      }
    });

  return cmd;
}
