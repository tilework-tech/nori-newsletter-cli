import { describe, it, expect, beforeEach } from "vitest";
import {
  createMockSesService,
  runCommand,
  type MockSesService,
  TEST_CONFIG,
} from "../helpers.js";

describe("validate command", () => {
  let ses: MockSesService;

  beforeEach(() => {
    ses = createMockSesService();
  });

  describe("check", () => {
    it("displays validation results for a valid email", async () => {
      const { stdout, exitCode } = await runCommand(ses, [
        "validate",
        "check",
        "user@example.com",
      ]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("user@example.com");
      expect(stdout).toContain("Overall: HIGH");
      expect(stdout).toContain("Syntax: HIGH");
      expect(stdout).toContain("DNS Records: HIGH");
      expect(stdout).toContain("Mailbox Exists: HIGH");
      expect(stdout).toContain("Role Address: LOW");
      expect(stdout).toContain("Disposable: LOW");
      expect(stdout).toContain("Random Input: LOW");
    });

    it("displays results for an email with invalid syntax", async () => {
      ses = createMockSesService({
        validateBehavior: () => ({
          isValid: "LOW",
          evaluations: {
            hasValidSyntax: "LOW",
            hasValidDnsRecords: "LOW",
            mailboxExists: "LOW",
            isRoleAddress: "LOW",
            isDisposable: "LOW",
            isRandomInput: "LOW",
          },
        }),
      });

      const { stdout, exitCode } = await runCommand(ses, [
        "validate",
        "check",
        "not-an-email",
      ]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("Overall: LOW");
      expect(stdout).toContain("Syntax: LOW");
    });

    it("displays results for a disposable email", async () => {
      ses = createMockSesService({
        validateBehavior: () => ({
          isValid: "MEDIUM",
          evaluations: {
            hasValidSyntax: "HIGH",
            hasValidDnsRecords: "HIGH",
            mailboxExists: "MEDIUM",
            isRoleAddress: "LOW",
            isDisposable: "HIGH",
            isRandomInput: "LOW",
          },
        }),
      });

      const { stdout, exitCode } = await runCommand(ses, [
        "validate",
        "check",
        "temp@throwaway.com",
      ]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("Overall: MEDIUM");
      expect(stdout).toContain("Disposable: HIGH");
    });

    it("displays results for a role address", async () => {
      ses = createMockSesService({
        validateBehavior: () => ({
          isValid: "MEDIUM",
          evaluations: {
            hasValidSyntax: "HIGH",
            hasValidDnsRecords: "HIGH",
            mailboxExists: "HIGH",
            isRoleAddress: "HIGH",
            isDisposable: "LOW",
            isRandomInput: "LOW",
          },
        }),
      });

      const { stdout, exitCode } = await runCommand(ses, [
        "validate",
        "check",
        "admin@example.com",
      ]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("Role Address: HIGH");
    });

    it("handles BadRequestException for malformed input", async () => {
      ses = createMockSesService({
        validateBehavior: () => {
          const error = new Error("Invalid email address");
          error.name = "BadRequestException";
          throw error;
        },
      });

      const { stderr, exitCode } = await runCommand(ses, [
        "validate",
        "check",
        "!!!",
      ]);

      expect(exitCode).toBe(1);
      expect(stderr).toContain("Error");
    });
  });

  describe("list", () => {
    it("reports no contacts when list is empty", async () => {
      const { stdout, exitCode } = await runCommand(ses, ["validate", "list"]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("No contacts to validate");
    });

    it("validates all contacts and shows per-contact results", async () => {
      await ses.createContactList(TEST_CONFIG.contactListName, TEST_CONFIG.topicName);
      await ses.createContact(
        TEST_CONFIG.contactListName,
        "alice@example.com",
        TEST_CONFIG.topicName
      );
      await ses.createContact(
        TEST_CONFIG.contactListName,
        "bob@example.com",
        TEST_CONFIG.topicName
      );

      const { stdout, exitCode } = await runCommand(ses, ["validate", "list"]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("alice@example.com");
      expect(stdout).toContain("bob@example.com");
      expect(stdout).toContain("Validating 2 contacts");
    });

    it("shows summary counts for mixed validation results", async () => {
      ses = createMockSesService({
        validateBehavior: (email: string) => {
          if (email === "bad@example.com") {
            return {
              isValid: "LOW",
              evaluations: {
                hasValidSyntax: "LOW",
                hasValidDnsRecords: "LOW",
                mailboxExists: "LOW",
                isRoleAddress: "LOW",
                isDisposable: "LOW",
                isRandomInput: "LOW",
              },
            };
          }
          if (email === "meh@example.com") {
            return {
              isValid: "MEDIUM",
              evaluations: {
                hasValidSyntax: "HIGH",
                hasValidDnsRecords: "HIGH",
                mailboxExists: "MEDIUM",
                isRoleAddress: "LOW",
                isDisposable: "LOW",
                isRandomInput: "LOW",
              },
            };
          }
          return {
            isValid: "HIGH",
            evaluations: {
              hasValidSyntax: "HIGH",
              hasValidDnsRecords: "HIGH",
              mailboxExists: "HIGH",
              isRoleAddress: "LOW",
              isDisposable: "LOW",
              isRandomInput: "LOW",
            },
          };
        },
      });

      await ses.createContactList(TEST_CONFIG.contactListName, TEST_CONFIG.topicName);
      await ses.createContact(
        TEST_CONFIG.contactListName,
        "good@example.com",
        TEST_CONFIG.topicName
      );
      await ses.createContact(
        TEST_CONFIG.contactListName,
        "bad@example.com",
        TEST_CONFIG.topicName
      );
      await ses.createContact(
        TEST_CONFIG.contactListName,
        "meh@example.com",
        TEST_CONFIG.topicName
      );

      const { stdout, exitCode } = await runCommand(ses, ["validate", "list"]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("1 valid");
      expect(stdout).toContain("1 uncertain");
      expect(stdout).toContain("1 invalid");
    });

    it("handles per-contact validation failures gracefully", async () => {
      ses = createMockSesService({
        validateBehavior: (email: string) => {
          if (email === "broken@example.com") {
            const error = new Error("TooManyRequests");
            error.name = "TooManyRequestsException";
            throw error;
          }
          return {
            isValid: "HIGH",
            evaluations: {
              hasValidSyntax: "HIGH",
              hasValidDnsRecords: "HIGH",
              mailboxExists: "HIGH",
              isRoleAddress: "LOW",
              isDisposable: "LOW",
              isRandomInput: "LOW",
            },
          };
        },
      });

      await ses.createContactList(TEST_CONFIG.contactListName, TEST_CONFIG.topicName);
      await ses.createContact(
        TEST_CONFIG.contactListName,
        "good@example.com",
        TEST_CONFIG.topicName
      );
      await ses.createContact(
        TEST_CONFIG.contactListName,
        "broken@example.com",
        TEST_CONFIG.topicName
      );

      const { stdout, exitCode } = await runCommand(ses, ["validate", "list"]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("good@example.com");
      expect(stdout).toContain("1 failed to validate");
      expect(stdout).toContain("1 valid");
    });
  });
});
