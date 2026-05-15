import { Command } from "commander";
import type { SesService } from "../services/ses.js";
import type { Output } from "../output.js";
import type { NewsletterConfig } from "../config.js";
import { extractEmail } from "../lib/email.js";

export function createSetupCommand(
  ses: SesService,
  out: Output,
  getConfig: () => NewsletterConfig
): Command {
  const cmd = new Command("setup");

  cmd.description(
    "Set up SES infrastructure for newsletter sending. " +
      "Use 'check' to audit the current configuration, " +
      "or 'run' to create missing infrastructure."
  );

  cmd
    .command("check")
    .description(
      "Audit SES configuration. " +
        "Reports OK, MISSING, PENDING, WARN, or FAIL for account, identity, and contact list."
    )
    .action(async () => {
      const config = getConfig();
      let hasFailure = false;

      try {
        const bareEmail = extractEmail(config.fromAddress);
        const [account, identity, contactList] = await Promise.all([
          ses.getAccountInfo(),
          ses.getIdentity(bareEmail),
          ses.getContactList(config.contactListName),
        ]);

        if (!account.sendingEnabled) {
          out.write("[FAIL] Account: sending is disabled\n");
          hasFailure = true;
        } else {
          out.write("[OK] Account: sending enabled\n");
        }

        if (!account.productionAccessEnabled) {
          out.write("[WARN] Account: running in Sandbox mode\n");
        }

        if (!identity) {
          out.write(`[MISSING] Identity: ${bareEmail} not found in SES\n`);
          hasFailure = true;
        } else if (!identity.verifiedForSending) {
          out.write(`[PENDING] Identity: ${bareEmail} verification in progress (${identity.verificationStatus})\n`);
          hasFailure = true;
        } else {
          out.write(`[OK] Identity: ${bareEmail} verified\n`);
        }

        if (!contactList) {
          out.write(`[MISSING] Contact list: '${config.contactListName}' not found\n`);
          hasFailure = true;
        } else {
          out.write(`[OK] Contact list: '${config.contactListName}' exists\n`);
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        out.error(`Error: ${message}\n`);
        hasFailure = true;
      }

      if (hasFailure) {
        out.setExitCode(1);
      }
    });

  cmd
    .command("run")
    .description(
      "Create missing SES infrastructure. " +
        "Verifies the from-address identity and creates the contact list. " +
        "Safe to run multiple times; skips resources that already exist."
    )
    .action(async () => {
      const config = getConfig();
      const bareEmail = extractEmail(config.fromAddress);

      try {
        const existingIdentity = await ses.getIdentity(bareEmail);
        if (existingIdentity) {
          out.write(`Identity '${bareEmail}' already exists (${existingIdentity.verificationStatus}).\n`);
        } else {
          try {
            const result = await ses.createIdentity(bareEmail);
            out.write(`Created identity '${bareEmail}' (${result.type}).\n`);

            if (result.dkimTokens && result.dkimTokens.length > 0 && result.dkimHostedZone) {
              out.write("\nDKIM DNS records to add:\n");
              for (const token of result.dkimTokens) {
                out.write(`  CNAME: ${token}._domainkey.${bareEmail} -> ${token}.${result.dkimHostedZone}\n`);
              }
              out.write("\n");
            } else if (result.type === "EMAIL_ADDRESS") {
              out.write(`A verification email has been sent to '${bareEmail}'. Click the link to complete verification.\n`);
            }
          } catch (err: unknown) {
            if (err instanceof Error && err.name === "AlreadyExistsException") {
              out.write(`Identity '${bareEmail}' already exists.\n`);
            } else {
              throw err;
            }
          }
        }

        try {
          await ses.createContactList(config.contactListName, config.topicName);
          out.write(`Created contact list '${config.contactListName}' with topic '${config.topicName}'.\n`);
        } catch (err: unknown) {
          if (err instanceof Error && err.name === "AlreadyExistsException") {
            out.write(`Contact list '${config.contactListName}' already exists.\n`);
          } else {
            throw err;
          }
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        out.error(`Error: ${message}\n`);
        out.setExitCode(1);
      }
    });

  return cmd;
}
