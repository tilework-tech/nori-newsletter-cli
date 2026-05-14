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
  maxSendRate?: number;
}

export interface MockSesService extends SesService {
  getSentEmails(): SentEmail[];
  getSentEmailCount(): number;
  getContactCount(): number;
  setContactUnsubscribed(email: string, topicName: string): void;
  getSuppressedCount(): number;
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

export function createMockSesService(options?: MockSesServiceOptions): MockSesService {
  let contactListCreated = false;
  const contacts = new Map<string, MockContact>();
  const sentEmails: SentEmail[] = [];
  const suppressedDestinations = new Map<string, MockSuppressedDestination>();

  return {
    getSentEmails() {
      return [...sentEmails];
    },

    getSentEmailCount() {
      return sentEmails.length;
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

    async createContactList(_name: string, _topic: string): Promise<void> {
      if (contactListCreated) {
        const error = new Error("Contact list already exists");
        error.name = "AlreadyExistsException";
        throw error;
      }
      contactListCreated = true;
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
