import { describe, it, expect, beforeEach } from "vitest";
import {
  createMockSesService,
  runCommand,
  type MockSesService,
} from "../helpers.js";

describe("config-sets", () => {
  let ses: MockSesService;

  beforeEach(() => {
    ses = createMockSesService();
  });

  describe("list", () => {
    it("shows zero count when no config sets exist", async () => {
      const { stdout, exitCode } = await runCommand(ses, [
        "config-sets",
        "list",
      ]);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("0 configuration sets");
    });

    it("lists config sets with names", async () => {
      await runCommand(ses, ["config-sets", "create", "my-set"]);
      await runCommand(ses, ["config-sets", "create", "other-set"]);
      const { stdout, exitCode } = await runCommand(ses, [
        "config-sets",
        "list",
      ]);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("2 configuration sets");
      expect(stdout).toContain("my-set");
      expect(stdout).toContain("other-set");
    });

    it("uses singular label for one config set", async () => {
      await runCommand(ses, ["config-sets", "create", "single"]);
      const { stdout } = await runCommand(ses, ["config-sets", "list"]);
      expect(stdout).toContain("1 configuration set:");
    });
  });

  describe("create", () => {
    it("creates a config set with default options", async () => {
      const { stdout, exitCode } = await runCommand(ses, [
        "config-sets",
        "create",
        "my-set",
      ]);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("Created configuration set 'my-set'");
    });

    it("creates a config set with TLS policy", async () => {
      await runCommand(ses, [
        "config-sets",
        "create",
        "tls-set",
        "--tls",
        "REQUIRE",
      ]);
      const { stdout } = await runCommand(ses, [
        "config-sets",
        "show",
        "tls-set",
      ]);
      expect(stdout).toContain("TLS policy: REQUIRE");
    });

    it("creates a config set with suppression reasons", async () => {
      await runCommand(ses, [
        "config-sets",
        "create",
        "sup-set",
        "--suppression-reasons",
        "BOUNCE,COMPLAINT",
      ]);
      const { stdout } = await runCommand(ses, [
        "config-sets",
        "show",
        "sup-set",
      ]);
      expect(stdout).toContain("BOUNCE");
      expect(stdout).toContain("COMPLAINT");
    });

    it("creates a config set with reputation metrics enabled", async () => {
      await runCommand(ses, [
        "config-sets",
        "create",
        "rep-set",
        "--reputation-metrics",
      ]);
      const { stdout } = await runCommand(ses, [
        "config-sets",
        "show",
        "rep-set",
      ]);
      expect(stdout).toContain("Reputation metrics: true");
    });

    it("rejects duplicate config set names", async () => {
      await runCommand(ses, ["config-sets", "create", "dup"]);
      const { stderr, exitCode } = await runCommand(ses, [
        "config-sets",
        "create",
        "dup",
      ]);
      expect(exitCode).toBe(1);
      expect(stderr).toContain("already exists");
    });
  });

  describe("show", () => {
    it("shows config set details", async () => {
      await runCommand(ses, [
        "config-sets",
        "create",
        "detail-set",
        "--tls",
        "REQUIRE",
        "--reputation-metrics",
        "--suppression-reasons",
        "BOUNCE",
      ]);
      const { stdout, exitCode } = await runCommand(ses, [
        "config-sets",
        "show",
        "detail-set",
      ]);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("detail-set");
      expect(stdout).toContain("TLS policy: REQUIRE");
      expect(stdout).toContain("Reputation metrics: true");
      expect(stdout).toContain("BOUNCE");
    });

    it("returns error for nonexistent config set", async () => {
      const { stderr, exitCode } = await runCommand(ses, [
        "config-sets",
        "show",
        "nope",
      ]);
      expect(exitCode).toBe(1);
      expect(stderr).toContain("not found");
    });
  });

  describe("delete", () => {
    it("deletes an existing config set", async () => {
      await runCommand(ses, ["config-sets", "create", "doomed"]);
      const { stdout, exitCode } = await runCommand(ses, [
        "config-sets",
        "delete",
        "doomed",
      ]);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("Deleted");
      const { stdout: listOut } = await runCommand(ses, [
        "config-sets",
        "list",
      ]);
      expect(listOut).toContain("0 configuration sets");
    });

    it("returns error for nonexistent config set", async () => {
      const { stderr, exitCode } = await runCommand(ses, [
        "config-sets",
        "delete",
        "nope",
      ]);
      expect(exitCode).toBe(1);
      expect(stderr).toContain("not found");
    });
  });

  describe("destinations", () => {
    it("shows zero count when no destinations exist", async () => {
      await runCommand(ses, ["config-sets", "create", "my-set"]);
      const { stdout, exitCode } = await runCommand(ses, [
        "config-sets",
        "destinations",
        "my-set",
      ]);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("0 event destinations");
    });

    it("returns error for nonexistent config set", async () => {
      const { stderr, exitCode } = await runCommand(ses, [
        "config-sets",
        "destinations",
        "nope",
      ]);
      expect(exitCode).toBe(1);
      expect(stderr).toContain("not found");
    });
  });

  describe("add-destination", () => {
    it("creates an SNS destination", async () => {
      await runCommand(ses, ["config-sets", "create", "my-set"]);
      const { stdout, exitCode } = await runCommand(ses, [
        "config-sets",
        "add-destination",
        "my-set",
        "bounce-notify",
        "--type",
        "sns",
        "--events",
        "BOUNCE,COMPLAINT",
        "--topic-arn",
        "arn:aws:sns:us-east-1:123456789:bounces",
      ]);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("Created event destination 'bounce-notify'");

      const { stdout: destOut } = await runCommand(ses, [
        "config-sets",
        "destinations",
        "my-set",
      ]);
      expect(destOut).toContain("bounce-notify");
      expect(destOut).toContain("SNS");
      expect(destOut).toContain("BOUNCE");
    });

    it("creates an EventBridge destination", async () => {
      await runCommand(ses, ["config-sets", "create", "my-set"]);
      const { stdout, exitCode } = await runCommand(ses, [
        "config-sets",
        "add-destination",
        "my-set",
        "events-bridge",
        "--type",
        "eventbridge",
        "--events",
        "SEND,DELIVERY",
        "--bus-arn",
        "arn:aws:events:us-east-1:123456789:event-bus/default",
      ]);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("Created event destination 'events-bridge'");
    });

    it("creates a Kinesis Firehose destination", async () => {
      await runCommand(ses, ["config-sets", "create", "my-set"]);
      const { stdout, exitCode } = await runCommand(ses, [
        "config-sets",
        "add-destination",
        "my-set",
        "firehose-dest",
        "--type",
        "firehose",
        "--events",
        "SEND,BOUNCE,COMPLAINT,DELIVERY",
        "--stream-arn",
        "arn:aws:firehose:us-east-1:123456789:deliverystream/ses-events",
        "--role-arn",
        "arn:aws:iam::123456789:role/ses-firehose",
      ]);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("Created event destination 'firehose-dest'");
    });

    it("creates a CloudWatch destination", async () => {
      await runCommand(ses, ["config-sets", "create", "my-set"]);
      const { stdout, exitCode } = await runCommand(ses, [
        "config-sets",
        "add-destination",
        "my-set",
        "cw-dest",
        "--type",
        "cloudwatch",
        "--events",
        "SEND,BOUNCE",
        "--dimension",
        "ses:MESSAGE_TAG:default-tag",
      ]);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("Created event destination 'cw-dest'");
    });

    it("rejects duplicate destination names", async () => {
      await runCommand(ses, ["config-sets", "create", "my-set"]);
      await runCommand(ses, [
        "config-sets",
        "add-destination",
        "my-set",
        "dup-dest",
        "--type",
        "sns",
        "--events",
        "SEND",
        "--topic-arn",
        "arn:aws:sns:us-east-1:123456789:test",
      ]);
      const { stderr, exitCode } = await runCommand(ses, [
        "config-sets",
        "add-destination",
        "my-set",
        "dup-dest",
        "--type",
        "sns",
        "--events",
        "SEND",
        "--topic-arn",
        "arn:aws:sns:us-east-1:123456789:test",
      ]);
      expect(exitCode).toBe(1);
      expect(stderr).toContain("already exists");
    });

    it("rejects adding to nonexistent config set", async () => {
      const { stderr, exitCode } = await runCommand(ses, [
        "config-sets",
        "add-destination",
        "nope",
        "dest",
        "--type",
        "sns",
        "--events",
        "SEND",
        "--topic-arn",
        "arn:aws:sns:us-east-1:123456789:test",
      ]);
      expect(exitCode).toBe(1);
      expect(stderr).toContain("not found");
    });

    it("requires SNS topic ARN when type is sns", async () => {
      await runCommand(ses, ["config-sets", "create", "my-set"]);
      const { stderr, exitCode } = await runCommand(ses, [
        "config-sets",
        "add-destination",
        "my-set",
        "bad-sns",
        "--type",
        "sns",
        "--events",
        "SEND",
      ]);
      expect(exitCode).toBe(1);
      expect(stderr).toContain("--topic-arn");
    });

    it("requires Firehose stream ARN and role ARN", async () => {
      await runCommand(ses, ["config-sets", "create", "my-set"]);
      const { stderr, exitCode } = await runCommand(ses, [
        "config-sets",
        "add-destination",
        "my-set",
        "bad-fh",
        "--type",
        "firehose",
        "--events",
        "SEND",
        "--stream-arn",
        "arn:aws:firehose:us-east-1:123456789:deliverystream/test",
      ]);
      expect(exitCode).toBe(1);
      expect(stderr).toContain("--role-arn");
    });
  });

  describe("remove-destination", () => {
    it("removes an existing destination", async () => {
      await runCommand(ses, ["config-sets", "create", "my-set"]);
      await runCommand(ses, [
        "config-sets",
        "add-destination",
        "my-set",
        "to-remove",
        "--type",
        "sns",
        "--events",
        "SEND",
        "--topic-arn",
        "arn:aws:sns:us-east-1:123456789:test",
      ]);
      const { stdout, exitCode } = await runCommand(ses, [
        "config-sets",
        "remove-destination",
        "my-set",
        "to-remove",
      ]);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("Deleted");

      const { stdout: destOut } = await runCommand(ses, [
        "config-sets",
        "destinations",
        "my-set",
      ]);
      expect(destOut).toContain("0 event destinations");
    });

    it("returns error for nonexistent destination", async () => {
      await runCommand(ses, ["config-sets", "create", "my-set"]);
      const { stderr, exitCode } = await runCommand(ses, [
        "config-sets",
        "remove-destination",
        "my-set",
        "nope",
      ]);
      expect(exitCode).toBe(1);
      expect(stderr).toContain("not found");
    });

    it("returns error for nonexistent config set", async () => {
      const { stderr, exitCode } = await runCommand(ses, [
        "config-sets",
        "remove-destination",
        "nope",
        "dest",
      ]);
      expect(exitCode).toBe(1);
      expect(stderr).toContain("not found");
    });
  });
});
