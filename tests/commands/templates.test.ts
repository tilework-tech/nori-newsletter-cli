import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createMockSesService, runCommand } from "../helpers.js";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("templates command", () => {
  let ses: ReturnType<typeof createMockSesService>;
  let tempDir: string;

  const sampleHtml = "<html><body><h1>Hello {{name}}</h1></body></html>";
  const sampleText = "Hello {{name}}";

  beforeEach(() => {
    ses = createMockSesService();
    tempDir = mkdtempSync(join(tmpdir(), "nori-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe("create", () => {
    it("creates a template from HTML and text files", async () => {
      const htmlPath = join(tempDir, "template.html");
      const textPath = join(tempDir, "template.txt");
      writeFileSync(htmlPath, sampleHtml);
      writeFileSync(textPath, sampleText);

      const { exitCode, stdout } = await runCommand(ses, [
        "templates",
        "create",
        "my-template",
        "--subject",
        "Hello {{name}}",
        "--html",
        htmlPath,
        "--text",
        textPath,
      ]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("my-template");
    });

    it("reports error when template name already exists", async () => {
      const htmlPath = join(tempDir, "template.html");
      writeFileSync(htmlPath, sampleHtml);

      await runCommand(ses, [
        "templates",
        "create",
        "duplicate",
        "--subject",
        "Test",
        "--html",
        htmlPath,
      ]);

      const { exitCode, stderr } = await runCommand(ses, [
        "templates",
        "create",
        "duplicate",
        "--subject",
        "Test",
        "--html",
        htmlPath,
      ]);

      expect(exitCode).toBe(1);
      expect(stderr).toContain("already exists");
    });

    it("reports error when HTML file does not exist", async () => {
      const { exitCode, stderr } = await runCommand(ses, [
        "templates",
        "create",
        "my-template",
        "--subject",
        "Test",
        "--html",
        "/nonexistent/template.html",
      ]);

      expect(exitCode).toBe(1);
      expect(stderr).toContain("Could not read");
    });
  });

  describe("list", () => {
    it("lists templates with names and creation dates", async () => {
      const htmlPath = join(tempDir, "template.html");
      writeFileSync(htmlPath, sampleHtml);

      await runCommand(ses, [
        "templates",
        "create",
        "newsletter-weekly",
        "--subject",
        "Weekly",
        "--html",
        htmlPath,
      ]);
      await runCommand(ses, [
        "templates",
        "create",
        "newsletter-monthly",
        "--subject",
        "Monthly",
        "--html",
        htmlPath,
      ]);

      const { exitCode, stdout } = await runCommand(ses, [
        "templates",
        "list",
      ]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("2 templates");
      expect(stdout).toContain("newsletter-weekly");
      expect(stdout).toContain("newsletter-monthly");
    });

    it("shows zero templates when none exist", async () => {
      const { exitCode, stdout } = await runCommand(ses, [
        "templates",
        "list",
      ]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("0 templates");
    });
  });

  describe("show", () => {
    it("displays template details", async () => {
      const htmlPath = join(tempDir, "template.html");
      const textPath = join(tempDir, "template.txt");
      writeFileSync(htmlPath, sampleHtml);
      writeFileSync(textPath, sampleText);

      await runCommand(ses, [
        "templates",
        "create",
        "my-template",
        "--subject",
        "Hello {{name}}",
        "--html",
        htmlPath,
        "--text",
        textPath,
      ]);

      const { exitCode, stdout } = await runCommand(ses, [
        "templates",
        "show",
        "my-template",
      ]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("my-template");
      expect(stdout).toContain("Hello {{name}}");
      expect(stdout).toContain(sampleHtml);
      expect(stdout).toContain(sampleText);
    });

    it("reports error when template not found", async () => {
      const { exitCode, stderr } = await runCommand(ses, [
        "templates",
        "show",
        "nonexistent",
      ]);

      expect(exitCode).toBe(1);
      expect(stderr).toContain("not found");
    });
  });

  describe("update", () => {
    it("updates template subject while preserving other fields", async () => {
      const htmlPath = join(tempDir, "template.html");
      writeFileSync(htmlPath, sampleHtml);

      await runCommand(ses, [
        "templates",
        "create",
        "my-template",
        "--subject",
        "Old Subject",
        "--html",
        htmlPath,
      ]);

      const { exitCode, stdout } = await runCommand(ses, [
        "templates",
        "update",
        "my-template",
        "--subject",
        "New Subject",
      ]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("Updated");

      const { stdout: showOutput } = await runCommand(ses, [
        "templates",
        "show",
        "my-template",
      ]);
      expect(showOutput).toContain("New Subject");
      expect(showOutput).toContain(sampleHtml);
    });

    it("updates HTML content from file while preserving subject", async () => {
      const htmlPath = join(tempDir, "template.html");
      writeFileSync(htmlPath, sampleHtml);

      await runCommand(ses, [
        "templates",
        "create",
        "my-template",
        "--subject",
        "My Subject",
        "--html",
        htmlPath,
      ]);

      const newHtmlPath = join(tempDir, "new-template.html");
      writeFileSync(newHtmlPath, "<html><body>Updated content</body></html>");

      const { exitCode } = await runCommand(ses, [
        "templates",
        "update",
        "my-template",
        "--html",
        newHtmlPath,
      ]);

      expect(exitCode).toBe(0);

      const { stdout: showOutput } = await runCommand(ses, [
        "templates",
        "show",
        "my-template",
      ]);
      expect(showOutput).toContain("My Subject");
      expect(showOutput).toContain("Updated content");
    });

    it("reports error when template not found", async () => {
      const { exitCode, stderr } = await runCommand(ses, [
        "templates",
        "update",
        "nonexistent",
        "--subject",
        "New",
      ]);

      expect(exitCode).toBe(1);
      expect(stderr).toContain("not found");
    });
  });

  describe("delete", () => {
    it("deletes a template", async () => {
      const htmlPath = join(tempDir, "template.html");
      writeFileSync(htmlPath, sampleHtml);

      await runCommand(ses, [
        "templates",
        "create",
        "my-template",
        "--subject",
        "Test",
        "--html",
        htmlPath,
      ]);

      const { exitCode, stdout } = await runCommand(ses, [
        "templates",
        "delete",
        "my-template",
      ]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("Deleted");

      const { stdout: listOutput } = await runCommand(ses, [
        "templates",
        "list",
      ]);
      expect(listOutput).toContain("0 templates");
    });

    it("reports error when template not found", async () => {
      const { exitCode, stderr } = await runCommand(ses, [
        "templates",
        "delete",
        "nonexistent",
      ]);

      expect(exitCode).toBe(1);
      expect(stderr).toContain("not found");
    });
  });

  describe("preview", () => {
    it("renders template with provided data", async () => {
      const htmlPath = join(tempDir, "template.html");
      writeFileSync(htmlPath, sampleHtml);

      await runCommand(ses, [
        "templates",
        "create",
        "my-template",
        "--subject",
        "Hello {{name}}",
        "--html",
        htmlPath,
      ]);

      const { exitCode, stdout } = await runCommand(ses, [
        "templates",
        "preview",
        "my-template",
        "--data",
        '{"name": "Alice"}',
      ]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("Hello Alice");
    });

    it("reports error when template not found", async () => {
      const { exitCode, stderr } = await runCommand(ses, [
        "templates",
        "preview",
        "nonexistent",
        "--data",
        '{"name": "Alice"}',
      ]);

      expect(exitCode).toBe(1);
      expect(stderr).toContain("not found");
    });

    it("reports error when data is invalid JSON", async () => {
      const htmlPath = join(tempDir, "template.html");
      writeFileSync(htmlPath, sampleHtml);

      await runCommand(ses, [
        "templates",
        "create",
        "my-template",
        "--subject",
        "Test",
        "--html",
        htmlPath,
      ]);

      const { exitCode, stderr } = await runCommand(ses, [
        "templates",
        "preview",
        "my-template",
        "--data",
        "not valid json",
      ]);

      expect(exitCode).toBe(1);
      expect(stderr).toContain("Invalid JSON");
    });
  });
});
