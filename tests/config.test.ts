import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "nori-config-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("loads a valid config file", () => {
    writeFileSync(
      join(tempDir, "newsletter.config.json"),
      JSON.stringify({
        contactListName: "my-list",
        topicName: "my-topic",
        fromAddress: "News <news@example.com>",
        replyTo: "reply@example.com",
      })
    );

    const config = loadConfig(tempDir);

    expect(config.contactListName).toBe("my-list");
    expect(config.topicName).toBe("my-topic");
    expect(config.fromAddress).toBe("News <news@example.com>");
    expect(config.replyTo).toBe("reply@example.com");
  });

  it("throws when config file does not exist", () => {
    expect(() => loadConfig(tempDir)).toThrow("newsletter.config.json");
  });

  it("throws when JSON is invalid", () => {
    writeFileSync(join(tempDir, "newsletter.config.json"), "not json {{{");

    expect(() => loadConfig(tempDir)).toThrow();
  });

  it("throws when required fields are missing", () => {
    writeFileSync(
      join(tempDir, "newsletter.config.json"),
      JSON.stringify({ contactListName: "my-list" })
    );

    expect(() => loadConfig(tempDir)).toThrow();
  });
});
