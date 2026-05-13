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
}

export const TEST_CONFIG: NewsletterConfig = {
  contactListName: "test-newsletter",
  topicName: "test-topic",
  fromAddress: "Test Newsletter <test@example.com>",
  replyTo: "reply@example.com",
};

export function createMockSesService(options?: MockSesServiceOptions): MockSesService {
  let contactListCreated = false;
  const contacts = new Map<string, MockContact>();
  const sentEmails: SentEmail[] = [];

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
      _topic: string
    ): Promise<Array<{ email: string; unsubscribeAll: boolean }>> {
      return Array.from(contacts.values())
        .filter((c) => !c.unsubscribeAll)
        .map((c) => ({ email: c.email, unsubscribeAll: c.unsubscribeAll }));
    },

    async getContact(
      _listName: string,
      email: string
    ): Promise<{
      email: string;
      attributes?: Record<string, string>;
      unsubscribeAll: boolean;
    } | null> {
      const contact = contacts.get(email);
      if (!contact) return null;
      return {
        email: contact.email,
        attributes: contact.attributes,
        unsubscribeAll: contact.unsubscribeAll,
      };
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
