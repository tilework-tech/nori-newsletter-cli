import { Command } from "commander";
import type { SesService } from "../services/ses.js";
import type { Output } from "../output.js";
import type { NewsletterConfig } from "../config.js";
import type { DnsResolver } from "../lib/dns.js";
import { createDnsResolver } from "../lib/dns.js";
import { extractEmail } from "../lib/email.js";

export function createAuditCommand(
  ses: SesService,
  out: Output,
  getConfig: () => NewsletterConfig,
  dnsResolver?: DnsResolver
): Command {
  const cmd = new Command("audit");

  cmd
    .description(
      "Comprehensive SES account readiness audit. " +
        "Checks account status, identity verification, DNS configuration, " +
        "sending reputation, and contact list health in a single report. " +
        "Exit code 1 if any check fails."
    )
    .option("--days <days>", "Metrics lookback period in days (1-60)", "7")
    .option("--domain <domain>", "Domain to check (default: extracted from fromAddress)")
    .action(async (options: { days: string; domain?: string }) => {
      const dns = dnsResolver ?? createDnsResolver();
      const config = getConfig();
      let passCount = 0;
      let warnCount = 0;
      let failCount = 0;

      function pass(msg: string) {
        out.write(`[PASS] ${msg}\n`);
        passCount++;
      }
      function warn(msg: string) {
        out.write(`[WARN] ${msg}\n`);
        warnCount++;
      }
      function fail(msg: string) {
        out.write(`[FAIL] ${msg}\n`);
        failCount++;
      }
      function critical(msg: string) {
        out.write(`[CRITICAL] ${msg}\n`);
        failCount++;
      }

      try {
        const days = Number(options.days);
        if (!Number.isInteger(days) || days < 1 || days > 60) {
          out.error("Error: --days must be an integer between 1 and 60\n");
          out.setExitCode(1);
          return;
        }

        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const bareEmail = extractEmail(config.fromAddress);
        const domain = options.domain ?? bareEmail.split("@")[1];

        const [account, contactList, contacts, suppressed, metricsResponse, identity, domainIdentity] =
          await Promise.all([
            ses.getAccountInfo(),
            ses.getContactList(config.contactListName),
            ses.listContacts(config.contactListName, config.topicName).catch(() => []),
            ses.listSuppressedDestinations(),
            ses.getMetrics({
              startDate,
              endDate,
              metrics: ["SEND", "DELIVERY", "PERMANENT_BOUNCE", "COMPLAINT"],
            }),
            ses.getIdentity(bareEmail),
            ses.getIdentity(domain),
          ]);

        const effectiveIdentity = domainIdentity ?? identity;

        if (metricsResponse.errors.length > 0) {
          for (const err of metricsResponse.errors) {
            out.error(`Metrics error (${err.metric}): ${err.message}\n`);
          }
        }

        // === Account ===
        out.write("=== Account ===\n");
        if (!account.sendingEnabled) {
          fail("Sending is disabled");
        } else {
          pass("Sending enabled");
        }

        if (account.enforcementStatus === "HEALTHY") {
          pass(`Enforcement: ${account.enforcementStatus}`);
        } else if (account.enforcementStatus === "SHUTDOWN") {
          critical(`Enforcement: ${account.enforcementStatus}`);
        } else {
          warn(`Enforcement: ${account.enforcementStatus}`);
        }

        if (!account.productionAccessEnabled) {
          warn("Running in Sandbox mode");
        }

        // === Identity ===
        out.write("\n=== Identity ===\n");
        if (!identity && !domainIdentity) {
          fail(`Identity not found for ${bareEmail}`);
        } else if (effectiveIdentity && !effectiveIdentity.verifiedForSending) {
          fail(`${domain}: not verified (${effectiveIdentity.verificationStatus})`);
        } else if (effectiveIdentity) {
          pass(`${bareEmail}: Verified (${effectiveIdentity.verificationStatus})`);
          if (effectiveIdentity.dkim.status === "SUCCESS") {
            pass(`DKIM: ${effectiveIdentity.dkim.status} (signing ${effectiveIdentity.dkim.signingEnabled ? "enabled" : "disabled"})`);
          } else if (effectiveIdentity.dkim.status !== "NOT_STARTED") {
            warn(`DKIM: ${effectiveIdentity.dkim.status}`);
          }
        }

        // === DNS ===
        out.write(`\n=== DNS (${domain}) ===\n`);

        // SPF
        try {
          const txtRecords = await dns.resolveTxt(domain);
          const spfRecord = txtRecords
            .map((chunks) => chunks.join(""))
            .find((r) => r.startsWith("v=spf1"));

          if (!spfRecord) {
            warn("No SPF record found");
          } else if (!spfRecord.includes("include:amazonses.com")) {
            warn(`SPF: missing include:amazonses.com`);
          } else {
            pass(`SPF: ${spfRecord}`);
          }
        } catch (err: unknown) {
          const code = getDnsErrorCode(err);
          if (code === "ETIMEOUT") {
            fail("SPF: DNS timeout");
          } else {
            warn("No SPF record found");
          }
        }

        // DMARC
        try {
          const dmarcRecords = await dns.resolveTxt(`_dmarc.${domain}`);
          const dmarcRecord = dmarcRecords
            .map((chunks) => chunks.join(""))
            .find((r) => r.startsWith("v=DMARC1"));

          if (!dmarcRecord) {
            warn("No DMARC record found");
          } else {
            const policyMatch = dmarcRecord.match(/p=(\w+)/);
            const policy = policyMatch ? policyMatch[1] : "unknown";
            if (policy === "none") {
              warn(`DMARC: p=none is monitor-only`);
            } else {
              pass(`DMARC: ${dmarcRecord}`);
            }
          }
        } catch (err: unknown) {
          const code = getDnsErrorCode(err);
          if (code === "ETIMEOUT") {
            fail("DMARC: DNS timeout");
          } else {
            warn("No DMARC record found");
          }
        }

        // DKIM CNAMEs
        const tokens = effectiveIdentity?.dkim.tokens;
        if (tokens && tokens.length > 0 && effectiveIdentity) {
          const hostedZone = effectiveIdentity.dkim.hostedZone ?? "dkim.amazonses.com";
          let allOk = true;
          for (const token of tokens) {
            const hostname = `${token}._domainkey.${domain}`;
            try {
              const cnames = await dns.resolveCname(hostname);
              const expected = `${token}.${hostedZone}`;
              const match = cnames.find((c) => c === expected || c === `${expected}.`);
              if (!match) allOk = false;
            } catch {
              allOk = false;
            }
          }
          if (allOk) {
            pass(`DKIM: ${tokens.length}/${tokens.length} CNAME records correct`);
          } else {
            fail("DKIM: missing or incorrect CNAME records");
          }
        }

        // MX
        try {
          const mxRecords = await dns.resolveMx(domain);
          if (mxRecords.length === 0) {
            warn("No MX records found");
          } else {
            pass("MX records found");
          }
        } catch (err: unknown) {
          const code = getDnsErrorCode(err);
          if (code === "ETIMEOUT") {
            fail("MX: DNS timeout");
          } else {
            warn("No MX records found");
          }
        }

        // === Reputation ===
        out.write(`\n=== Reputation (last ${days} days) ===\n`);

        const totals = new Map<string, number>();
        for (const result of metricsResponse.results) {
          const sum = result.values.reduce((a: number, b: number) => a + b, 0);
          totals.set(result.metric, sum);
        }

        const sends = totals.get("SEND") ?? 0;
        const bounces = totals.get("PERMANENT_BOUNCE") ?? 0;
        const complaints = totals.get("COMPLAINT") ?? 0;

        if (sends === 0 && metricsResponse.results.length === 0) {
          out.write("Metrics unavailable (VDM may not be enabled)\n");
        } else if (sends === 0) {
          out.write("No sends in this period\n");
        } else {
          const bounceRate = (bounces / sends) * 100;
          const complaintRate = (complaints / sends) * 100;

          if (bounceRate >= 5) {
            critical(`Bounce rate: ${bounceRate.toFixed(2)}% (${bounces} / ${sends})`);
          } else if (bounceRate >= 2) {
            warn(`Bounce rate: ${bounceRate.toFixed(2)}%`);
          } else {
            pass(`Bounce rate: ${bounceRate.toFixed(2)}%`);
          }

          if (complaintRate >= 0.1) {
            critical(`Complaint rate: ${complaintRate.toFixed(3)}% (${complaints} / ${sends})`);
          } else if (complaintRate >= 0.05) {
            warn(`Complaint rate: ${complaintRate.toFixed(3)}%`);
          } else {
            pass(`Complaint rate: ${complaintRate.toFixed(3)}%`);
          }
        }

        // === Contacts ===
        out.write("\n=== Contacts ===\n");

        if (!contactList) {
          fail(`Contact list "${config.contactListName}" not found`);
        } else {
          pass(`Contact list "${config.contactListName}" exists`);
        }

        if (contacts.length > 0) {
          pass(`${contacts.length} subscribed contacts`);
        } else if (contactList) {
          warn("0 subscribed contacts");
        }

        const suppressedSet = new Set(suppressed.map((s) => s.email.toLowerCase()));
        const overlap = contacts.filter((c) => suppressedSet.has(c.email.toLowerCase()));
        if (overlap.length > 0) {
          warn(`${overlap.length} contacts overlap with suppression list`);
        } else if (contacts.length > 0) {
          pass("No suppression overlap");
        }

        // === Summary ===
        out.write("\n=== Summary ===\n");
        out.write(
          `${passCount} passed, ${warnCount} warning${warnCount !== 1 ? "s" : ""}, ${failCount} failure${failCount !== 1 ? "s" : ""}\n`
        );
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        out.error(`Error: ${message}\n`);
        failCount++;
      }

      if (failCount > 0) {
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
