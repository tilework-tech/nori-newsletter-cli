import { CommanderError } from "commander";
import type { SesService } from "../src/services/ses.js";
import type { Output } from "../src/output.js";
import type { NewsletterConfig } from "../src/config.js";
import { createProgram } from "../src/program.js";

interface MockContact {
  email: string;
  topicPreferences: Array<{ topicName: string; status: string }>;
  attributes?: Record<string, string>;
  unsubscribeAll: boolean;
}

interface SentEmail {
  from: string;
  to: string;
  subject: string;
  html: string;
  replyTo: string;
  listName: string;
  topicName: string;
}

export interface MockSesServiceOptions {
  sendEmailBehavior?: (to: string) => Promise<string> | string;
  sendBulkEmailBehavior?: (
    entries: Array<{ to: string; replacementData?: string }>
  ) => Array<{ status: string; messageId?: string; error?: string }>;
  maxSendRate?: number;
  accountInfo?: {
    sentLast24Hours?: number;
    max24HourSend?: number;
    maxSendRate?: number;
    enforcementStatus?: string;
    productionAccessEnabled?: boolean;
    sendingEnabled?: boolean;
  };
  metricsResults?: Array<{
    metric: string;
    timestamps: Date[];
    values: number[];
  }>;
  metricsErrors?: Array<{ metric: string; message: string }>;
}

interface SentBulkEmail {
  from: string;
  replyTo: string;
  templateName: string;
  defaultTemplateData?: string;
  entries: Array<{ to: string; replacementData?: string }>;
}

export interface MockSesService extends SesService {
  getSentEmails(): SentEmail[];
  getSentEmailCount(): number;
  getSentBulkEmails(): SentBulkEmail[];
  getSentBulkEmailCount(): number;
  getContactCount(): number;
  setContactUnsubscribed(email: string, topicName: string): void;
  getSuppressedCount(): number;
  getContactListCount(): number;
  getTemplateCount(): number;
  getIdentityCount(): number;
}

export const TEST_CONFIG: NewsletterConfig = {
  contactListName: "test-newsletter",
  topicName: "test-topic",
  fromAddress: "Test Newsletter <test@example.com>",
  replyTo: "reply@example.com",
};

interface MockSuppressedDestination {
  email: string;
  reason: string;
  lastUpdateTime: Date;
}

interface MockContactList {
  name: string;
  description?: string;
  topics: Array<{
    topicName: string;
    displayName: string;
    description?: string;
    defaultSubscriptionStatus: string;
  }>;
  createdTimestamp: Date;
  lastUpdatedTimestamp: Date;
  tags: Array<{ key: string; value: string }>;
}

interface MockTemplate {
  name: string;
  subject?: string;
  html?: string;
  text?: string;
  createdTimestamp: Date;
}

interface MockIdentity {
  name: string;
  type: string;
  verificationStatus: string;
  verifiedForSending: boolean;
  sendingEnabled: boolean;
  feedbackForwardingStatus: boolean;
  dkimStatus: string;
  dkimSigningEnabled: boolean;
  dkimTokens?: string[];
  dkimHostedZone?: string;
  dkimCurrentKeyLength?: string;
  mailFromDomain?: string;
  mailFromDomainStatus?: string;
  mailFromBehaviorOnMxFailure?: string;
}

export function createMockSesService(options?: MockSesServiceOptions): MockSesService {
  const contactLists = new Map<string, MockContactList>();
  const contacts = new Map<string, MockContact>();
  const sentEmails: SentEmail[] = [];
  const sentBulkEmails: SentBulkEmail[] = [];
  const suppressedDestinations = new Map<string, MockSuppressedDestination>();
  const templates = new Map<string, MockTemplate>();
  const identities = new Map<string, MockIdentity>();

  return {
    getSentEmails() {
      return [...sentEmails];
    },

    getSentEmailCount() {
      return sentEmails.length;
    },

    getSentBulkEmails() {
      return [...sentBulkEmails];
    },

    getSentBulkEmailCount() {
      return sentBulkEmails.length;
    },

    getContactCount() {
      return contacts.size;
    },

    setContactUnsubscribed(email: string, topicName: string) {
      const contact = contacts.get(email);
      if (contact) {
        const pref = contact.topicPreferences.find((tp) => tp.topicName === topicName);
        if (pref) {
          pref.status = "OPT_OUT";
        }
      }
    },

    getContactListCount() {
      return contactLists.size;
    },

    getTemplateCount() {
      return templates.size;
    },

    getIdentityCount() {
      return identities.size;
    },

    async createContactList(name: string, topicName: string): Promise<void> {
      if (contactLists.has(name)) {
        const error = new Error("Contact list already exists");
        error.name = "AlreadyExistsException";
        throw error;
      }
      const now = new Date();
      contactLists.set(name, {
        name,
        description: "Newsletter subscribers",
        topics: [
          {
            topicName,
            displayName: "Weekly Newsletter",
            description: "Newsletter updates",
            defaultSubscriptionStatus: "OPT_IN",
          },
        ],
        createdTimestamp: now,
        lastUpdatedTimestamp: now,
        tags: [],
      });
    },

    async createContact(
      _listName: string,
      email: string,
      topic: string,
      attributes?: Record<string, string>
    ): Promise<void> {
      if (contacts.has(email)) {
        const error = new Error("Contact already exists");
        error.name = "AlreadyExistsException";
        throw error;
      }
      contacts.set(email, {
        email,
        topicPreferences: [{ topicName: topic, status: "OPT_IN" }],
        attributes,
        unsubscribeAll: false,
      });
    },

    async listContacts(
      _listName: string,
      topicName: string
    ): Promise<Array<{ email: string; unsubscribeAll: boolean }>> {
      return Array.from(contacts.values())
        .filter((c) => {
          if (c.unsubscribeAll) return false;
          const topicPref = c.topicPreferences.find((tp) => tp.topicName === topicName);
          return !topicPref || topicPref.status === "OPT_IN";
        })
        .map((c) => ({ email: c.email, unsubscribeAll: c.unsubscribeAll }));
    },

    async getContact(
      _listName: string,
      email: string
    ): Promise<{
      email: string;
      topicPreferences: Array<{ topicName: string; status: string }>;
      attributes?: Record<string, string>;
      unsubscribeAll: boolean;
    } | null> {
      const contact = contacts.get(email);
      if (!contact) return null;
      return {
        email: contact.email,
        topicPreferences: contact.topicPreferences.map((tp) => ({ ...tp })),
        attributes: contact.attributes ? { ...contact.attributes } : undefined,
        unsubscribeAll: contact.unsubscribeAll,
      };
    },

    async listUnsubscribedContacts(
      _listName: string,
      topicName: string
    ): Promise<Array<{ email: string; unsubscribeAll: boolean }>> {
      return Array.from(contacts.values())
        .filter((c) => {
          if (c.unsubscribeAll) return true;
          const topicPref = c.topicPreferences.find((tp) => tp.topicName === topicName);
          return topicPref?.status === "OPT_OUT";
        })
        .map((c) => ({ email: c.email, unsubscribeAll: c.unsubscribeAll }));
    },

    async updateContact(
      _listName: string,
      email: string,
      options: {
        topicPreferences?: Array<{ topicName: string; status: string }>;
        unsubscribeAll?: boolean;
        attributes?: Record<string, string>;
      }
    ): Promise<void> {
      const contact = contacts.get(email);
      if (!contact) {
        const error = new Error("Contact not found");
        error.name = "NotFoundException";
        throw error;
      }
      if (options.topicPreferences !== undefined) {
        contact.topicPreferences = options.topicPreferences;
      }
      if (options.unsubscribeAll !== undefined) {
        contact.unsubscribeAll = options.unsubscribeAll;
      }
      if (options.attributes !== undefined) {
        contact.attributes = { ...contact.attributes, ...options.attributes };
      }
    },

    async deleteContact(_listName: string, email: string): Promise<void> {
      if (!contacts.has(email)) {
        const error = new Error("Contact not found");
        error.name = "NotFoundException";
        throw error;
      }
      contacts.delete(email);
    },

    async sendEmail(
      from: string,
      to: string,
      subject: string,
      html: string,
      replyTo: string,
      listName: string,
      topic: string
    ): Promise<string> {
      if (options?.sendEmailBehavior) {
        const result = await options.sendEmailBehavior(to);
        sentEmails.push({ from, to, subject, html, replyTo, listName, topicName: topic });
        return result;
      }
      sentEmails.push({ from, to, subject, html, replyTo, listName, topicName: topic });
      return `mock-message-id-${sentEmails.length}`;
    },

    async getMaxSendRate(): Promise<number> {
      return options?.maxSendRate ?? 14;
    },

    getSuppressedCount() {
      return suppressedDestinations.size;
    },

    async listSuppressedDestinations(
      opts?: { reasons?: string[]; startDate?: Date; endDate?: Date }
    ): Promise<Array<{ email: string; reason: string; lastUpdateTime: Date }>> {
      let results = Array.from(suppressedDestinations.values());

      if (opts?.reasons && opts.reasons.length > 0) {
        results = results.filter((d) => opts.reasons!.includes(d.reason));
      }
      if (opts?.startDate) {
        results = results.filter((d) => d.lastUpdateTime >= opts.startDate!);
      }
      if (opts?.endDate) {
        results = results.filter((d) => d.lastUpdateTime <= opts.endDate!);
      }

      return results.map((d) => ({
        email: d.email,
        reason: d.reason,
        lastUpdateTime: d.lastUpdateTime,
      }));
    },

    async getSuppressedDestination(
      email: string
    ): Promise<{
      email: string;
      reason: string;
      lastUpdateTime: Date;
      messageId?: string;
      feedbackId?: string;
    } | null> {
      const dest = suppressedDestinations.get(email);
      if (!dest) return null;
      return {
        email: dest.email,
        reason: dest.reason,
        lastUpdateTime: dest.lastUpdateTime,
      };
    },

    async putSuppressedDestination(email: string, reason: string): Promise<void> {
      suppressedDestinations.set(email, {
        email,
        reason,
        lastUpdateTime: new Date(),
      });
    },

    async deleteSuppressedDestination(email: string): Promise<void> {
      if (!suppressedDestinations.has(email)) {
        const error = new Error("Address not on suppression list");
        error.name = "NotFoundException";
        throw error;
      }
      suppressedDestinations.delete(email);
    },

    async listContactLists() {
      return Array.from(contactLists.values()).map((cl) => ({
        name: cl.name,
        lastUpdatedTimestamp: cl.lastUpdatedTimestamp,
      }));
    },

    async getContactList(name: string) {
      const cl = contactLists.get(name);
      if (!cl) return null;
      return {
        name: cl.name,
        description: cl.description,
        topics: cl.topics.map((t) => ({ ...t })),
        createdTimestamp: cl.createdTimestamp,
        lastUpdatedTimestamp: cl.lastUpdatedTimestamp,
        tags: cl.tags.map((t) => ({ ...t })),
      };
    },

    async updateContactList(
      name: string,
      updateOptions: {
        description?: string;
        topics?: Array<{
          topicName: string;
          displayName: string;
          description?: string;
          defaultSubscriptionStatus: string;
        }>;
      }
    ) {
      const cl = contactLists.get(name);
      if (!cl) {
        const error = new Error("Contact list not found");
        error.name = "NotFoundException";
        throw error;
      }
      if (updateOptions.description !== undefined) {
        cl.description = updateOptions.description;
      }
      if (updateOptions.topics !== undefined) {
        cl.topics = updateOptions.topics;
      }
      cl.lastUpdatedTimestamp = new Date();
    },

    async deleteContactList(name: string) {
      if (!contactLists.has(name)) {
        const error = new Error("Contact list not found");
        error.name = "NotFoundException";
        throw error;
      }
      contactLists.delete(name);
    },

    async getAccountInfo() {
      const info = options?.accountInfo ?? {};
      return {
        sentLast24Hours: info.sentLast24Hours ?? 150,
        max24HourSend: info.max24HourSend ?? 50000,
        maxSendRate: info.maxSendRate ?? 14,
        enforcementStatus: info.enforcementStatus ?? "HEALTHY",
        productionAccessEnabled: info.productionAccessEnabled ?? true,
        sendingEnabled: info.sendingEnabled ?? true,
      };
    },

    async getMetrics(_options: {
      startDate: Date;
      endDate: Date;
      metrics: string[];
      identity?: string;
    }) {
      return {
        results: options?.metricsResults ?? [],
        errors: options?.metricsErrors ?? [],
      };
    },

    async createTemplate(
      name: string,
      content: { subject?: string; html?: string; text?: string }
    ): Promise<void> {
      if (templates.has(name)) {
        const error = new Error("Template already exists");
        error.name = "AlreadyExistsException";
        throw error;
      }
      templates.set(name, {
        name,
        subject: content.subject,
        html: content.html,
        text: content.text,
        createdTimestamp: new Date(),
      });
    },

    async getTemplate(name: string) {
      const t = templates.get(name);
      if (!t) return null;
      return {
        name: t.name,
        subject: t.subject,
        html: t.html,
        text: t.text,
      };
    },

    async listTemplates() {
      return Array.from(templates.values()).map((t) => ({
        name: t.name,
        createdTimestamp: t.createdTimestamp,
      }));
    },

    async updateTemplate(
      name: string,
      content: { subject?: string; html?: string; text?: string }
    ): Promise<void> {
      if (!templates.has(name)) {
        const error = new Error("Template not found");
        error.name = "NotFoundException";
        throw error;
      }
      const t = templates.get(name)!;
      t.subject = content.subject;
      t.html = content.html;
      t.text = content.text;
    },

    async deleteTemplate(name: string): Promise<void> {
      if (!templates.has(name)) {
        const error = new Error("Template not found");
        error.name = "NotFoundException";
        throw error;
      }
      templates.delete(name);
    },

    async testRenderTemplate(name: string, data: string): Promise<string> {
      const t = templates.get(name);
      if (!t) {
        const error = new Error("Template not found");
        error.name = "NotFoundException";
        throw error;
      }
      const vars = JSON.parse(data) as Record<string, string>;
      let rendered = t.html ?? t.text ?? "";
      for (const [key, value] of Object.entries(vars)) {
        rendered = rendered.replaceAll(`{{${key}}}`, value);
      }
      return rendered;
    },

    async sendBulkEmail(bulkOptions: {
      from: string;
      replyTo: string;
      templateName: string;
      defaultTemplateData?: string;
      entries: Array<{ to: string; replacementData?: string }>;
    }): Promise<Array<{ status: string; messageId?: string; error?: string }>> {
      if (options?.sendBulkEmailBehavior) {
        const result = options.sendBulkEmailBehavior(bulkOptions.entries);
        sentBulkEmails.push({
          from: bulkOptions.from,
          replyTo: bulkOptions.replyTo,
          templateName: bulkOptions.templateName,
          defaultTemplateData: bulkOptions.defaultTemplateData,
          entries: bulkOptions.entries,
        });
        return result;
      }

      sentBulkEmails.push({
        from: bulkOptions.from,
        replyTo: bulkOptions.replyTo,
        templateName: bulkOptions.templateName,
        defaultTemplateData: bulkOptions.defaultTemplateData,
        entries: bulkOptions.entries,
      });

      return bulkOptions.entries.map((_e, i) => ({
        status: "SUCCESS",
        messageId: `mock-bulk-msg-${sentBulkEmails.length}-${i}`,
      }));
    },

    async listIdentities() {
      return Array.from(identities.values()).map((id) => ({
        name: id.name,
        type: id.type,
        sendingEnabled: id.sendingEnabled,
        verificationStatus: id.verificationStatus,
      }));
    },

    async createIdentity(identity: string) {
      if (identities.has(identity)) {
        const error = new Error("Identity already exists");
        error.name = "AlreadyExistsException";
        throw error;
      }

      const isDomain = !identity.includes("@");
      const type = isDomain ? "DOMAIN" : "EMAIL_ADDRESS";
      const dkimTokens = isDomain
        ? ["mock-token-1", "mock-token-2", "mock-token-3"]
        : undefined;
      const dkimHostedZone = isDomain ? "dkim.amazonses.com" : undefined;

      identities.set(identity, {
        name: identity,
        type,
        verificationStatus: "PENDING",
        verifiedForSending: false,
        sendingEnabled: false,
        feedbackForwardingStatus: true,
        dkimStatus: isDomain ? "PENDING" : "NOT_STARTED",
        dkimSigningEnabled: isDomain,
        dkimTokens,
        dkimHostedZone,
        dkimCurrentKeyLength: isDomain ? "RSA_2048_BIT" : undefined,
      });

      return {
        type,
        verifiedForSending: false,
        dkimTokens,
        dkimHostedZone,
      };
    },

    async getIdentity(identity: string) {
      const id = identities.get(identity);
      if (!id) return null;

      return {
        name: id.name,
        type: id.type,
        verificationStatus: id.verificationStatus,
        verifiedForSending: id.verifiedForSending,
        feedbackForwardingStatus: id.feedbackForwardingStatus,
        dkim: {
          status: id.dkimStatus,
          signingEnabled: id.dkimSigningEnabled,
          tokens: id.dkimTokens,
          hostedZone: id.dkimHostedZone,
          currentKeyLength: id.dkimCurrentKeyLength,
        },
        mailFrom: id.mailFromDomain
          ? {
              domain: id.mailFromDomain,
              status: id.mailFromDomainStatus ?? "SUCCESS",
              behaviorOnMxFailure: id.mailFromBehaviorOnMxFailure ?? "USE_DEFAULT_VALUE",
            }
          : undefined,
      };
    },

    async deleteIdentity(identity: string) {
      if (!identities.has(identity)) {
        const error = new Error("Identity not found");
        error.name = "NotFoundException";
        throw error;
      }
      identities.delete(identity);
    },
  };
}

function createTestOutput(): Output & { stdout: string; stderr: string; exitCode: number } {
  const result = {
    stdout: "",
    stderr: "",
    exitCode: 0,
    write(msg: string) {
      result.stdout += msg;
    },
    error(msg: string) {
      result.stderr += msg;
    },
    setExitCode(code: number) {
      result.exitCode = code;
    },
  };
  return result;
}

export async function runCommand(
  ses: SesService,
  args: string[],
  config?: NewsletterConfig
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const out = createTestOutput();
  const program = createProgram(ses, out, () => config ?? TEST_CONFIG);

  program.exitOverride();

  try {
    await program.parseAsync(["node", "nori-newsletter", ...args]);
  } catch (err) {
    if (err instanceof CommanderError) {
      if (out.exitCode === 0) out.exitCode = err.exitCode;
    } else {
      throw err;
    }
  }

  return { stdout: out.stdout, stderr: out.stderr, exitCode: out.exitCode };
}
