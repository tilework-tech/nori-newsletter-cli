import { Command } from "commander";
import type { SesService } from "../services/ses.js";
import type { Output } from "../output.js";
import type { NewsletterConfig } from "../config.js";
import type { DnsResolver } from "../lib/dns.js";
import { createDnsResolver } from "../lib/dns.js";
import { extractEmail } from "../lib/email.js";

export function createDomainCheckCommand(
  ses: SesService,
  out: Output,
  getConfig: () => NewsletterConfig,
  dnsResolver?: DnsResolver
): Command {
  const cmd = new Command("domain-check");

  cmd
    .description(
      "Check domain DNS configuration for email deliverability. " +
        "Verifies DKIM, SPF, DMARC, and MX records against SES identity data. " +
        "Reports PASS/WARN/FAIL for each check with actionable recommendations."
    )
    .option("--domain <domain>", "Domain to check (default: extracted from fromAddress)")
    .action(async (options: { domain?: string }) => {
      const dns = dnsResolver ?? createDnsResolver();
      const config = getConfig();
      let hasFail = false;

      try {
        const bareEmail = extractEmail(config.fromAddress);
        const domain = options.domain ?? bareEmail.split("@")[1];
        const domainOverridden = !!options.domain;

        const emailIdentity = domainOverridden ? null : await ses.getIdentity(bareEmail);
        const domainIdentity = await ses.getIdentity(domain);
        const identity = domainIdentity ?? emailIdentity;

        out.write(`=== Identity (${domain}) ===\n`);
        if (emailIdentity) {
          const label = emailIdentity.verifiedForSending ? "[PASS]" : "[WARN]";
          out.write(
            `${bareEmail}: ${emailIdentity.verifiedForSending ? "Verified" : "Not verified"} (${emailIdentity.verificationStatus}) ${label}\n`
          );
        }
        if (domainIdentity) {
          const label = domainIdentity.verifiedForSending ? "[PASS]" : "[WARN]";
          out.write(
            `${domain}: ${domainIdentity.verifiedForSending ? "Verified" : "Not verified"} (${domainIdentity.verificationStatus}) ${label}\n`
          );
        }
        if (!emailIdentity && !domainIdentity) {
          out.write(`${domain}: not registered in SES [FAIL]\n`);
          hasFail = true;
        }

        out.write(`\n=== DKIM ===\n`);
        const tokens = identity?.dkim.tokens;
        if (tokens && tokens.length > 0 && identity) {
          const hostedZone = identity.dkim.hostedZone ?? "dkim.amazonses.com";
          out.write(`SES DKIM: ${identity.dkim.status} (signing: ${identity.dkim.signingEnabled ? "enabled" : "disabled"})\n`);

          let allDkimOk = true;
          for (const token of tokens) {
            const hostname = `${token}._domainkey.${domain}`;
            try {
              const cnames = await dns.resolveCname(hostname);
              const expected = `${token}.${hostedZone}`;
              const match = cnames.find((c) => c === expected || c === `${expected}.`);
              if (match) {
                out.write(`  ${hostname}: ${match} [PASS]\n`);
              } else {
                out.write(`  ${hostname}: points to ${cnames[0]}, expected ${expected} [FAIL]\n`);
                allDkimOk = false;
              }
            } catch (err: unknown) {
              const code = getDnsErrorCode(err);
              if (code === "ETIMEOUT") {
                out.write(`  ${hostname}: DNS timeout [FAIL]\n`);
              } else {
                out.write(`  ${hostname}: not found [FAIL]\n`);
              }
              allDkimOk = false;
            }
          }
          if (!allDkimOk) hasFail = true;
        } else if (identity) {
          out.write(`No DKIM tokens (email identity — DKIM managed by domain) [PASS]\n`);
        } else {
          out.write(`Cannot check DKIM — identity not registered [FAIL]\n`);
          hasFail = true;
        }

        out.write(`\n=== SPF ===\n`);
        try {
          const txtRecords = await dns.resolveTxt(domain);
          const spfRecord = txtRecords
            .map((chunks) => chunks.join(""))
            .find((r) => r.startsWith("v=spf1"));

          if (!spfRecord) {
            out.write(`No SPF record found for ${domain} [WARN]\n`);
            out.write(`  Add a TXT record: v=spf1 include:amazonses.com ~all\n`);
          } else if (!spfRecord.includes("include:amazonses.com")) {
            out.write(`SPF: ${spfRecord} [WARN]\n`);
            out.write(`  Missing include:amazonses.com — add it to authorize SES\n`);
          } else {
            out.write(`SPF: ${spfRecord} [PASS]\n`);
          }
        } catch (err: unknown) {
          const code = getDnsErrorCode(err);
          if (code === "ETIMEOUT") {
            out.write(`SPF: DNS timeout [FAIL]\n`);
            hasFail = true;
          } else {
            out.write(`No SPF record found for ${domain} [WARN]\n`);
            out.write(`  Add a TXT record: v=spf1 include:amazonses.com ~all\n`);
          }
        }

        out.write(`\n=== DMARC ===\n`);
        try {
          const dmarcRecords = await dns.resolveTxt(`_dmarc.${domain}`);
          const dmarcRecord = dmarcRecords
            .map((chunks) => chunks.join(""))
            .find((r) => r.startsWith("v=DMARC1"));

          if (!dmarcRecord) {
            out.write(`No DMARC record found at _dmarc.${domain} [WARN]\n`);
            out.write(`  Add a TXT record: v=DMARC1; p=quarantine; rua=mailto:dmarc@${domain}\n`);
          } else {
            const policyMatch = dmarcRecord.match(/p=(\w+)/);
            const policy = policyMatch ? policyMatch[1] : "unknown";
            if (policy === "none") {
              out.write(`DMARC: ${dmarcRecord} [WARN]\n`);
              out.write(`  Policy p=none is monitor-only — consider p=quarantine or p=reject\n`);
            } else {
              out.write(`DMARC: ${dmarcRecord} [PASS]\n`);
            }
          }
        } catch (err: unknown) {
          const code = getDnsErrorCode(err);
          if (code === "ETIMEOUT") {
            out.write(`DMARC: DNS timeout [FAIL]\n`);
            hasFail = true;
          } else {
            out.write(`No DMARC record found at _dmarc.${domain} [WARN]\n`);
            out.write(`  Add a TXT record: v=DMARC1; p=quarantine; rua=mailto:dmarc@${domain}\n`);
          }
        }

        out.write(`\n=== MX ===\n`);
        try {
          const mxRecords = await dns.resolveMx(domain);
          if (mxRecords.length === 0) {
            out.write(`No MX records for ${domain} [WARN]\n`);
            out.write(`  Some receivers check that sending domains have MX records\n`);
          } else {
            const sorted = mxRecords.sort((a, b) => a.priority - b.priority);
            for (const mx of sorted) {
              out.write(`  ${mx.priority} ${mx.exchange}\n`);
            }
            out.write(`MX records found [PASS]\n`);
          }
        } catch (err: unknown) {
          const code = getDnsErrorCode(err);
          if (code === "ETIMEOUT") {
            out.write(`MX: DNS timeout [FAIL]\n`);
            hasFail = true;
          } else {
            out.write(`No MX records for ${domain} [WARN]\n`);
            out.write(`  Some receivers check that sending domains have MX records\n`);
          }
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        out.error(`Error: ${message}\n`);
        hasFail = true;
      }

      if (hasFail) {
        out.setExitCode(1);
      }
    });

  return cmd;
}

function getDnsErrorCode(err: unknown): string {
  if (err && typeof err === "object" && "code" in err) {
    return (err as { code: string }).code;
  }
  return "UNKNOWN";
}
