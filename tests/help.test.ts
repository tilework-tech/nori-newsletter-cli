import { describe, test, expect } from "vitest";
import { createMockSesService, TEST_CONFIG } from "./helpers.js";
import { createProgram } from "../src/program.js";

function captureHelp(subcommand?: string): string {
  const ses = createMockSesService();
  const out = {
    write() {},
    error() {},
    setExitCode() {},
  };
  const program = createProgram(ses, out, () => TEST_CONFIG);

  let captured = "";
  const outputConfig = {
    writeOut: (str: string) => {
      captured += str;
    },
    writeErr: (str: string) => {
      captured += str;
    },
  };

  if (subcommand) {
    const sub = program.commands.find((c) => c.name() === subcommand);
    if (sub) {
      sub.configureOutput(outputConfig);
      sub.outputHelp();
    }
  } else {
    program.configureOutput(outputConfig);
    program.outputHelp();
  }

  return captured;
}

describe("--help output", () => {
  test("root help documents config fields and shows an example", () => {
    const help = captureHelp();

    expect(help).toContain("newsletter.config.json");
    expect(help).toContain("contactListName");
    expect(help).toContain("topicName");
    expect(help).toContain("fromAddress");
    expect(help).toContain("replyTo");
    expect(help).toContain('"contactListName"');
  });

  test("root help documents required environment variables", () => {
    const help = captureHelp();

    expect(help).toContain("AWS_ACCESS_KEY_ID");
    expect(help).toContain("AWS_SECRET_ACCESS_KEY");
    expect(help).toContain("AWS_REGION");
  });

  test("root help uses correct program name matching bin", () => {
    const help = captureHelp();

    expect(help).toContain("Usage: nori-newsletter");
    expect(help).not.toContain("Usage: nori-newsletter-cli");
  });

  test("init help references actual config field names", () => {
    const help = captureHelp("init");

    expect(help).toContain("contactListName");
    expect(help).toContain("topicName");
  });
});
