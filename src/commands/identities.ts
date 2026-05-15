import { Command } from "commander";
import type { SesService } from "../services/ses.js";
import type { Output } from "../output.js";
import type { NewsletterConfig } from "../config.js";

export function createIdentitiesCommand(
  ses: SesService,
  out: Output,
  getConfig: () => NewsletterConfig
): Command {
  const cmd = new Command("identities");

  cmd.description(
    "Manage SES email and domain identities. " +
      "Verify new sending identities, check verification and DKIM status, " +
      "and delete identities you no longer need."
  );

  cmd
    .command("list")
    .description(
      "List all email and domain identities in the SES account " +
        "with their type and verification status."
    )
    .action(async () => {
      const identities = await ses.listIdentities();

      const label =
        identities.length === 1 ? "identity" : "identities";
      out.write(`${identities.length} ${label}:\n`);
      for (const id of identities) {
        out.write(
          `  ${id.name} (${id.type}, ${id.verificationStatus})\n`
        );
      }
    });

  cmd
    .command("verify")
    .description(
      "Verify a new email address or domain for sending. " +
        "For email addresses, sends a verification email with a confirmation link. " +
        "For domains, returns DKIM CNAME records to add to DNS."
    )
    .argument("<identity>", "Email address or domain to verify")
    .action(async (identity: string) => {
      try {
        const result = await ses.createIdentity(identity);

        if (result.type === "DOMAIN") {
          out.write(`Initiated verification for domain '${identity}'.\n`);
          if (result.dkimTokens && result.dkimHostedZone) {
            out.write(`\nAdd these CNAME records to your DNS:\n`);
            for (const token of result.dkimTokens) {
              out.write(
                `  ${token}._domainkey.${identity} -> ${token}.${result.dkimHostedZone}\n`
              );
            }
          }
          out.write(
            `\nSES will check DNS for up to 72 hours.\n`
          );
        } else {
          out.write(
            `A verification email has been sent to '${identity}'.\n` +
              `Click the link in the email to complete verification. The link expires in 24 hours.\n`
          );
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AlreadyExistsException") {
          out.error(`Error: Identity '${identity}' already exists.\n`);
          out.setExitCode(1);
          return;
        }
        throw err;
      }
    });

  cmd
    .command("show")
    .description(
      "Show details for an email or domain identity including " +
        "verification status, DKIM configuration, and MAIL FROM settings."
    )
    .argument("<identity>", "Email address or domain to inspect")
    .action(async (identity: string) => {
      const id = await ses.getIdentity(identity);

      if (!id) {
        out.error(`Error: Identity '${identity}' not found.\n`);
        out.setExitCode(1);
        return;
      }

      out.write(`Identity: ${id.name}\n`);
      out.write(`Type: ${id.type}\n`);
      out.write(`Verification: ${id.verificationStatus}\n`);
      out.write(`Verified for sending: ${id.verifiedForSending}\n`);
      out.write(`Feedback forwarding: ${id.feedbackForwardingStatus}\n`);
      out.write(`\nDKIM:\n`);
      out.write(`  Status: ${id.dkim.status}\n`);
      out.write(`  Signing enabled: ${id.dkim.signingEnabled}\n`);
      if (id.dkim.currentKeyLength) {
        out.write(`  Key length: ${id.dkim.currentKeyLength}\n`);
      }
      if (id.dkim.tokens && id.dkim.tokens.length > 0) {
        out.write(`  Tokens:\n`);
        for (const token of id.dkim.tokens) {
          if (id.dkim.hostedZone) {
            out.write(
              `    ${token}._domainkey.${id.name} -> ${token}.${id.dkim.hostedZone}\n`
            );
          } else {
            out.write(`    ${token}\n`);
          }
        }
      }
      if (id.mailFrom) {
        out.write(`\nMAIL FROM:\n`);
        out.write(`  Domain: ${id.mailFrom.domain}\n`);
        out.write(`  Status: ${id.mailFrom.status}\n`);
        out.write(`  On MX failure: ${id.mailFrom.behaviorOnMxFailure}\n`);
      }
    });

  cmd
    .command("delete")
    .description(
      "Delete an email or domain identity. " +
        "You will need to re-verify the identity to send from it again."
    )
    .argument("<identity>", "Email address or domain to delete")
    .action(async (identity: string) => {
      try {
        await ses.deleteIdentity(identity);
        out.write(`Deleted identity '${identity}'.\n`);
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "NotFoundException") {
          out.error(`Error: Identity '${identity}' not found.\n`);
          out.setExitCode(1);
          return;
        }
        throw err;
      }
    });

  return cmd;
}
