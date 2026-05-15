import { describe, it, expect } from "vitest";
import { createMockSesService, runCommand, TEST_CONFIG } from "../helpers.js";
import type { DnsResolver } from "../../src/lib/dns.js";

interface MockDnsOptions {
  mx?: Record<string, Array<{ priority: number; exchange: string }>>;
  txt?: Record<string, string[][]>;
  cname?: Record<string, string[]>;
  errors?: Record<string, { code: string }>;
}

function createMockDnsResolver(opts: MockDnsOptions = {}): DnsResolver {
  return {
    async resolveMx(domain: string) {
      if (opts.errors?.[`mx:${domain}`]) {
        const err = new Error("DNS error");
        (err as any).code = opts.errors[`mx:${domain}`].code;
        throw err;
      }
      return opts.mx?.[domain] ?? [];
    },
    async resolveTxt(domain: string) {
      if (opts.errors?.[`txt:${domain}`]) {
        const err = new Error("DNS error");
        (err as any).code = opts.errors[`txt:${domain}`].code;
        throw err;
      }
      return opts.txt?.[domain] ?? [];
    },
    async resolveCname(hostname: string) {
      if (opts.errors?.[`cname:${hostname}`]) {
        const err = new Error("DNS error");
        (err as any).code = opts.errors[`cname:${hostname}`].code;
        throw err;
      }
      return opts.cname?.[hostname] ?? [];
    },
  };
}

describe("domain-check command", () => {
  it("reports all checks passing when domain is fully configured", async () => {
    const ses = createMockSesService({
      seedIdentities: [{ name: "example.com", type: "DOMAIN" }],
    });

    const dns = createMockDnsResolver({
      mx: { "example.com": [{ priority: 10, exchange: "mail.example.com" }] },
      txt: {
        "example.com": [["v=spf1 include:amazonses.com ~all"]],
        "_dmarc.example.com": [["v=DMARC1; p=quarantine; rua=mailto:dmarc@example.com"]],
      },
      cname: {
        "token-1._domainkey.example.com": ["token-1.dkim.amazonses.com"],
        "token-2._domainkey.example.com": ["token-2.dkim.amazonses.com"],
        "token-3._domainkey.example.com": ["token-3.dkim.amazonses.com"],
      },
    });

    const { stdout, exitCode } = await runCommand(
      ses,
      ["domain-check"],
      TEST_CONFIG,
      { dnsResolver: dns }
    );

    expect(exitCode).toBe(0);
    expect(stdout).toContain("[PASS]");
    expect(stdout).toContain("Identity");
    expect(stdout).toContain("DKIM");
    expect(stdout).toContain("SPF");
    expect(stdout).toContain("DMARC");
    expect(stdout).toContain("MX");
    expect(stdout).not.toContain("[FAIL]");
    expect(stdout).not.toContain("[WARN]");
  });

  it("warns when identity exists but is not verified", async () => {
    const ses = createMockSesService({
      seedIdentities: [
        { name: "example.com", type: "DOMAIN", verifiedForSending: false, verificationStatus: "PENDING" },
      ],
    });

    const dns = createMockDnsResolver({
      mx: { "example.com": [{ priority: 10, exchange: "mail.example.com" }] },
      txt: {
        "example.com": [["v=spf1 include:amazonses.com ~all"]],
        "_dmarc.example.com": [["v=DMARC1; p=quarantine;"]],
      },
      cname: {
        "token-1._domainkey.example.com": ["token-1.dkim.amazonses.com"],
        "token-2._domainkey.example.com": ["token-2.dkim.amazonses.com"],
        "token-3._domainkey.example.com": ["token-3.dkim.amazonses.com"],
      },
    });

    const { stdout, exitCode } = await runCommand(
      ses,
      ["domain-check"],
      TEST_CONFIG,
      { dnsResolver: dns }
    );

    expect(exitCode).toBe(0);
    expect(stdout).toContain("[WARN]");
    expect(stdout).toContain("Not verified");
    expect(stdout).toContain("PENDING");
  });

  it("fails when domain identity is not registered in SES", async () => {
    const ses = createMockSesService();

    const dns = createMockDnsResolver({
      mx: { "example.com": [{ priority: 10, exchange: "mail.example.com" }] },
    });

    const { stdout, exitCode } = await runCommand(
      ses,
      ["domain-check"],
      TEST_CONFIG,
      { dnsResolver: dns }
    );

    expect(exitCode).toBe(1);
    expect(stdout).toContain("[FAIL]");
    expect(stdout).toContain("not registered");
  });

  it("fails when DKIM DNS records are missing", async () => {
    const ses = createMockSesService({
      seedIdentities: [{ name: "example.com", type: "DOMAIN" }],
    });

    const dns = createMockDnsResolver({
      mx: { "example.com": [{ priority: 10, exchange: "mail.example.com" }] },
      txt: {
        "example.com": [["v=spf1 include:amazonses.com ~all"]],
        "_dmarc.example.com": [["v=DMARC1; p=quarantine;"]],
      },
      errors: {
        "cname:token-1._domainkey.example.com": { code: "ENODATA" },
        "cname:token-2._domainkey.example.com": { code: "ENODATA" },
        "cname:token-3._domainkey.example.com": { code: "ENODATA" },
      },
    });

    const { stdout, exitCode } = await runCommand(
      ses,
      ["domain-check"],
      TEST_CONFIG,
      { dnsResolver: dns }
    );

    expect(exitCode).toBe(1);
    expect(stdout).toContain("[FAIL]");
    expect(stdout).toContain("DKIM");
  });

  it("warns when SPF record is missing", async () => {
    const ses = createMockSesService({
      seedIdentities: [{ name: "example.com", type: "DOMAIN" }],
    });

    const dns = createMockDnsResolver({
      mx: { "example.com": [{ priority: 10, exchange: "mail.example.com" }] },
      txt: {
        "example.com": [["some-other-txt-record"]],
        "_dmarc.example.com": [["v=DMARC1; p=quarantine;"]],
      },
      cname: {
        "token-1._domainkey.example.com": ["token-1.dkim.amazonses.com"],
        "token-2._domainkey.example.com": ["token-2.dkim.amazonses.com"],
        "token-3._domainkey.example.com": ["token-3.dkim.amazonses.com"],
      },
    });

    const { stdout, exitCode } = await runCommand(
      ses,
      ["domain-check"],
      TEST_CONFIG,
      { dnsResolver: dns }
    );

    expect(exitCode).toBe(0);
    expect(stdout).toContain("[WARN]");
    expect(stdout).toContain("SPF");
  });

  it("warns when SPF record exists but missing SES include", async () => {
    const ses = createMockSesService({
      seedIdentities: [{ name: "example.com", type: "DOMAIN" }],
    });

    const dns = createMockDnsResolver({
      mx: { "example.com": [{ priority: 10, exchange: "mail.example.com" }] },
      txt: {
        "example.com": [["v=spf1 include:otherprovider.com ~all"]],
        "_dmarc.example.com": [["v=DMARC1; p=quarantine;"]],
      },
      cname: {
        "token-1._domainkey.example.com": ["token-1.dkim.amazonses.com"],
        "token-2._domainkey.example.com": ["token-2.dkim.amazonses.com"],
        "token-3._domainkey.example.com": ["token-3.dkim.amazonses.com"],
      },
    });

    const { stdout, exitCode } = await runCommand(
      ses,
      ["domain-check"],
      TEST_CONFIG,
      { dnsResolver: dns }
    );

    expect(exitCode).toBe(0);
    expect(stdout).toContain("[WARN]");
    expect(stdout).toContain("amazonses.com");
  });

  it("warns when DMARC record is missing", async () => {
    const ses = createMockSesService({
      seedIdentities: [{ name: "example.com", type: "DOMAIN" }],
    });

    const dns = createMockDnsResolver({
      mx: { "example.com": [{ priority: 10, exchange: "mail.example.com" }] },
      txt: {
        "example.com": [["v=spf1 include:amazonses.com ~all"]],
      },
      errors: {
        "txt:_dmarc.example.com": { code: "ENODATA" },
      },
      cname: {
        "token-1._domainkey.example.com": ["token-1.dkim.amazonses.com"],
        "token-2._domainkey.example.com": ["token-2.dkim.amazonses.com"],
        "token-3._domainkey.example.com": ["token-3.dkim.amazonses.com"],
      },
    });

    const { stdout, exitCode } = await runCommand(
      ses,
      ["domain-check"],
      TEST_CONFIG,
      { dnsResolver: dns }
    );

    expect(exitCode).toBe(0);
    expect(stdout).toContain("[WARN]");
    expect(stdout).toContain("DMARC");
  });

  it("warns when DMARC policy is none", async () => {
    const ses = createMockSesService({
      seedIdentities: [{ name: "example.com", type: "DOMAIN" }],
    });

    const dns = createMockDnsResolver({
      mx: { "example.com": [{ priority: 10, exchange: "mail.example.com" }] },
      txt: {
        "example.com": [["v=spf1 include:amazonses.com ~all"]],
        "_dmarc.example.com": [["v=DMARC1; p=none;"]],
      },
      cname: {
        "token-1._domainkey.example.com": ["token-1.dkim.amazonses.com"],
        "token-2._domainkey.example.com": ["token-2.dkim.amazonses.com"],
        "token-3._domainkey.example.com": ["token-3.dkim.amazonses.com"],
      },
    });

    const { stdout, exitCode } = await runCommand(
      ses,
      ["domain-check"],
      TEST_CONFIG,
      { dnsResolver: dns }
    );

    expect(exitCode).toBe(0);
    expect(stdout).toContain("[WARN]");
    expect(stdout).toContain("p=none");
  });

  it("warns when MX records are missing", async () => {
    const ses = createMockSesService({
      seedIdentities: [{ name: "example.com", type: "DOMAIN" }],
    });

    const dns = createMockDnsResolver({
      errors: {
        "mx:example.com": { code: "ENODATA" },
      },
      txt: {
        "example.com": [["v=spf1 include:amazonses.com ~all"]],
        "_dmarc.example.com": [["v=DMARC1; p=quarantine;"]],
      },
      cname: {
        "token-1._domainkey.example.com": ["token-1.dkim.amazonses.com"],
        "token-2._domainkey.example.com": ["token-2.dkim.amazonses.com"],
        "token-3._domainkey.example.com": ["token-3.dkim.amazonses.com"],
      },
    });

    const { stdout, exitCode } = await runCommand(
      ses,
      ["domain-check"],
      TEST_CONFIG,
      { dnsResolver: dns }
    );

    expect(exitCode).toBe(0);
    expect(stdout).toContain("[WARN]");
    expect(stdout).toContain("MX");
  });

  it("uses --domain flag to override configured domain", async () => {
    const ses = createMockSesService({
      seedIdentities: [{ name: "other.com", type: "DOMAIN" }],
    });

    const dns = createMockDnsResolver({
      mx: { "other.com": [{ priority: 10, exchange: "mail.other.com" }] },
      txt: {
        "other.com": [["v=spf1 include:amazonses.com ~all"]],
        "_dmarc.other.com": [["v=DMARC1; p=quarantine;"]],
      },
      cname: {
        "token-1._domainkey.other.com": ["token-1.dkim.amazonses.com"],
        "token-2._domainkey.other.com": ["token-2.dkim.amazonses.com"],
        "token-3._domainkey.other.com": ["token-3.dkim.amazonses.com"],
      },
    });

    const { stdout, exitCode } = await runCommand(
      ses,
      ["domain-check", "--domain", "other.com"],
      TEST_CONFIG,
      { dnsResolver: dns }
    );

    expect(exitCode).toBe(0);
    expect(stdout).toContain("other.com");
    expect(stdout).not.toContain("[FAIL]");
  });

  it("checks email identity and runs DNS checks on domain part", async () => {
    const ses = createMockSesService({
      seedIdentities: [{ name: "test@example.com", type: "EMAIL_ADDRESS" }],
    });

    const dns = createMockDnsResolver({
      mx: { "example.com": [{ priority: 10, exchange: "mail.example.com" }] },
      txt: {
        "example.com": [["v=spf1 include:amazonses.com ~all"]],
        "_dmarc.example.com": [["v=DMARC1; p=quarantine;"]],
      },
    });

    const { stdout, exitCode } = await runCommand(
      ses,
      ["domain-check"],
      TEST_CONFIG,
      { dnsResolver: dns }
    );

    expect(exitCode).toBe(0);
    expect(stdout).toContain("test@example.com");
    expect(stdout).toContain("Verified");
    expect(stdout).toContain("SPF");
    expect(stdout).toContain("MX");
  });

  it("handles DNS timeout gracefully", async () => {
    const ses = createMockSesService({
      seedIdentities: [{ name: "example.com", type: "DOMAIN" }],
    });

    const dns = createMockDnsResolver({
      errors: {
        "mx:example.com": { code: "ETIMEOUT" },
        "txt:example.com": { code: "ETIMEOUT" },
        "txt:_dmarc.example.com": { code: "ETIMEOUT" },
        "cname:token-1._domainkey.example.com": { code: "ETIMEOUT" },
        "cname:token-2._domainkey.example.com": { code: "ETIMEOUT" },
        "cname:token-3._domainkey.example.com": { code: "ETIMEOUT" },
      },
    });

    const { stdout, exitCode } = await runCommand(
      ses,
      ["domain-check"],
      TEST_CONFIG,
      { dnsResolver: dns }
    );

    expect(exitCode).toBe(1);
    expect(stdout).toContain("timeout");
  });
});
