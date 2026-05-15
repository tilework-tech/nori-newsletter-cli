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

function makeMetrics(sends: number, bounces: number, complaints: number) {
  const ts = [new Date("2025-05-01"), new Date("2025-05-02")];
  const half = (n: number) => [Math.floor(n / 2), n - Math.floor(n / 2)];
  return [
    { metric: "SEND", timestamps: ts, values: half(sends) },
    { metric: "DELIVERY", timestamps: ts, values: half(sends - bounces) },
    { metric: "PERMANENT_BOUNCE", timestamps: ts, values: half(bounces) },
    { metric: "COMPLAINT", timestamps: ts, values: half(complaints) },
  ];
}

function fullDns(): MockDnsOptions {
  return {
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
  };
}

describe("audit command", () => {
  it("reports all checks passing for fully configured account", async () => {
    const ses = createMockSesService({
      seedIdentities: [{ name: "example.com", type: "DOMAIN" }],
      metricsResults: makeMetrics(1000, 10, 0),
      accountInfo: { sentLast24Hours: 150, max24HourSend: 50000 },
    });

    await ses.createContactList(TEST_CONFIG.contactListName, TEST_CONFIG.topicName);
    await ses.createContact(TEST_CONFIG.contactListName, "a@example.com", TEST_CONFIG.topicName);

    const dns = createMockDnsResolver(fullDns());
    const { stdout, exitCode } = await runCommand(ses, ["audit"], TEST_CONFIG, {
      dnsResolver: dns,
    });

    expect(exitCode).toBe(0);
    expect(stdout).toContain("Account");
    expect(stdout).toContain("Identity");
    expect(stdout).toContain("DNS");
    expect(stdout).toContain("Reputation");
    expect(stdout).toContain("Contacts");
    expect(stdout).toContain("Summary");
    expect(stdout).not.toContain("[FAIL]");
    expect(stdout).not.toContain("[CRITICAL]");
  });

  it("fails when account sending is disabled", async () => {
    const ses = createMockSesService({
      accountInfo: { sendingEnabled: false },
      seedIdentities: [{ name: "example.com", type: "DOMAIN" }],
      metricsResults: makeMetrics(1000, 10, 0),
    });

    await ses.createContactList(TEST_CONFIG.contactListName, TEST_CONFIG.topicName);

    const dns = createMockDnsResolver(fullDns());
    const { stdout, exitCode } = await runCommand(ses, ["audit"], TEST_CONFIG, {
      dnsResolver: dns,
    });

    expect(exitCode).toBe(1);
    expect(stdout).toContain("[FAIL]");
    expect(stdout).toMatch(/sending.*disabled/i);
  });

  it("warns when running in sandbox mode", async () => {
    const ses = createMockSesService({
      accountInfo: { productionAccessEnabled: false },
      seedIdentities: [{ name: "example.com", type: "DOMAIN" }],
      metricsResults: makeMetrics(1000, 10, 0),
    });

    await ses.createContactList(TEST_CONFIG.contactListName, TEST_CONFIG.topicName);
    await ses.createContact(TEST_CONFIG.contactListName, "a@example.com", TEST_CONFIG.topicName);

    const dns = createMockDnsResolver(fullDns());
    const { stdout, exitCode } = await runCommand(ses, ["audit"], TEST_CONFIG, {
      dnsResolver: dns,
    });

    expect(exitCode).toBe(0);
    expect(stdout).toContain("[WARN]");
    expect(stdout).toContain("Sandbox");
  });

  it("fails when from-address identity is not found in SES", async () => {
    const ses = createMockSesService({
      metricsResults: makeMetrics(1000, 10, 0),
    });

    await ses.createContactList(TEST_CONFIG.contactListName, TEST_CONFIG.topicName);

    const dns = createMockDnsResolver(fullDns());
    const { stdout, exitCode } = await runCommand(ses, ["audit"], TEST_CONFIG, {
      dnsResolver: dns,
    });

    expect(exitCode).toBe(1);
    expect(stdout).toContain("[FAIL]");
    expect(stdout).toMatch(/identity.*not found|not registered/i);
  });

  it("fails when identity exists but is not verified", async () => {
    const ses = createMockSesService({
      seedIdentities: [
        {
          name: "example.com",
          type: "DOMAIN",
          verifiedForSending: false,
          verificationStatus: "PENDING",
        },
      ],
      metricsResults: makeMetrics(1000, 10, 0),
    });

    await ses.createContactList(TEST_CONFIG.contactListName, TEST_CONFIG.topicName);

    const dns = createMockDnsResolver(fullDns());
    const { stdout, exitCode } = await runCommand(ses, ["audit"], TEST_CONFIG, {
      dnsResolver: dns,
    });

    expect(exitCode).toBe(1);
    expect(stdout).toContain("[FAIL]");
    expect(stdout).toMatch(/not verified/i);
  });

  it("warns when DNS records are missing (SPF, DMARC)", async () => {
    const ses = createMockSesService({
      seedIdentities: [{ name: "test@example.com" }],
      metricsResults: makeMetrics(1000, 10, 0),
    });

    await ses.createContactList(TEST_CONFIG.contactListName, TEST_CONFIG.topicName);
    await ses.createContact(TEST_CONFIG.contactListName, "a@example.com", TEST_CONFIG.topicName);

    const dns = createMockDnsResolver({
      mx: { "example.com": [{ priority: 10, exchange: "mail.example.com" }] },
      errors: {
        "txt:example.com": { code: "ENODATA" },
        "txt:_dmarc.example.com": { code: "ENODATA" },
      },
    });

    const { stdout, exitCode } = await runCommand(ses, ["audit"], TEST_CONFIG, {
      dnsResolver: dns,
    });

    expect(exitCode).toBe(0);
    expect(stdout).toContain("[WARN]");
    expect(stdout).toContain("SPF");
    expect(stdout).toContain("DMARC");
  });

  it("reports CRITICAL when bounce rate exceeds 5%", async () => {
    const ses = createMockSesService({
      seedIdentities: [{ name: "example.com", type: "DOMAIN" }],
      metricsResults: makeMetrics(1000, 60, 0),
    });

    await ses.createContactList(TEST_CONFIG.contactListName, TEST_CONFIG.topicName);
    await ses.createContact(TEST_CONFIG.contactListName, "a@example.com", TEST_CONFIG.topicName);

    const dns = createMockDnsResolver(fullDns());
    const { stdout, exitCode } = await runCommand(ses, ["audit"], TEST_CONFIG, {
      dnsResolver: dns,
    });

    expect(exitCode).toBe(1);
    expect(stdout).toContain("[CRITICAL]");
    expect(stdout).toMatch(/bounce/i);
  });

  it("reports CRITICAL when complaint rate exceeds 0.1%", async () => {
    const ses = createMockSesService({
      seedIdentities: [{ name: "example.com", type: "DOMAIN" }],
      metricsResults: makeMetrics(1000, 0, 2),
    });

    await ses.createContactList(TEST_CONFIG.contactListName, TEST_CONFIG.topicName);
    await ses.createContact(TEST_CONFIG.contactListName, "a@example.com", TEST_CONFIG.topicName);

    const dns = createMockDnsResolver(fullDns());
    const { stdout, exitCode } = await runCommand(ses, ["audit"], TEST_CONFIG, {
      dnsResolver: dns,
    });

    expect(exitCode).toBe(1);
    expect(stdout).toContain("[CRITICAL]");
    expect(stdout).toMatch(/complaint/i);
  });

  it("fails when contact list does not exist", async () => {
    const ses = createMockSesService({
      seedIdentities: [{ name: "example.com", type: "DOMAIN" }],
      metricsResults: makeMetrics(1000, 10, 0),
    });

    const dns = createMockDnsResolver(fullDns());
    const { stdout, exitCode } = await runCommand(ses, ["audit"], TEST_CONFIG, {
      dnsResolver: dns,
    });

    expect(exitCode).toBe(1);
    expect(stdout).toContain("[FAIL]");
    expect(stdout).toMatch(/contact list/i);
  });

  it("warns when contacts overlap with suppression list", async () => {
    const ses = createMockSesService({
      seedIdentities: [{ name: "example.com", type: "DOMAIN" }],
      metricsResults: makeMetrics(1000, 10, 0),
    });

    await ses.createContactList(TEST_CONFIG.contactListName, TEST_CONFIG.topicName);
    await ses.createContact(
      TEST_CONFIG.contactListName,
      "bounced@example.com",
      TEST_CONFIG.topicName
    );
    await ses.putSuppressedDestination("bounced@example.com", "BOUNCE");

    const dns = createMockDnsResolver(fullDns());
    const { stdout, exitCode } = await runCommand(ses, ["audit"], TEST_CONFIG, {
      dnsResolver: dns,
    });

    expect(exitCode).toBe(0);
    expect(stdout).toContain("[WARN]");
    expect(stdout).toMatch(/suppression.*overlap|overlap.*suppression/i);
  });

  it("handles VDM not enabled gracefully", async () => {
    const ses = createMockSesService({
      seedIdentities: [{ name: "example.com", type: "DOMAIN" }],
      metricsResults: [],
    });

    await ses.createContactList(TEST_CONFIG.contactListName, TEST_CONFIG.topicName);
    await ses.createContact(TEST_CONFIG.contactListName, "a@example.com", TEST_CONFIG.topicName);

    const dns = createMockDnsResolver(fullDns());
    const { stdout, exitCode } = await runCommand(ses, ["audit"], TEST_CONFIG, {
      dnsResolver: dns,
    });

    expect(exitCode).toBe(0);
    expect(stdout).toContain("Metrics unavailable");
  });

  it("shows accurate summary counts for mixed pass/warn/fail scenario", async () => {
    const ses = createMockSesService({
      accountInfo: { sendingEnabled: false, productionAccessEnabled: false },
      seedIdentities: [{ name: "example.com", type: "DOMAIN" }],
      metricsResults: makeMetrics(1000, 10, 0),
    });

    await ses.createContactList(TEST_CONFIG.contactListName, TEST_CONFIG.topicName);
    await ses.createContact(TEST_CONFIG.contactListName, "a@example.com", TEST_CONFIG.topicName);

    const dns = createMockDnsResolver(fullDns());
    const { stdout, exitCode } = await runCommand(ses, ["audit"], TEST_CONFIG, {
      dnsResolver: dns,
    });

    expect(exitCode).toBe(1);
    expect(stdout).toContain("Summary");
    expect(stdout).toMatch(/\d+ passed/);
    expect(stdout).toMatch(/\d+ warning/);
    expect(stdout).toMatch(/\d+ failure/);
  });
});
