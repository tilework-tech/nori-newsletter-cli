import { describe, it, expect, beforeAll } from "vitest";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");

function getPackedFiles(): string[] {
  execSync("npm run build", { cwd: ROOT, stdio: "pipe" });
  const output = execSync("npm pack --dry-run --json", {
    cwd: ROOT,
    encoding: "utf-8",
  });
  const [result] = JSON.parse(output);
  return result.files.map((f: { path: string }) => f.path);
}

describe("npm package contents", () => {
  let files: string[];

  beforeAll(() => {
    files = getPackedFiles();
  });

  it("includes compiled dist files", () => {
    const distFiles = files.filter((f) => f.startsWith("dist/"));
    expect(distFiles.length).toBeGreaterThan(0);
    expect(distFiles).toContain("dist/index.js");
  });

  it("includes source files", () => {
    const srcFiles = files.filter((f) => f.startsWith("src/"));
    expect(srcFiles.length).toBeGreaterThan(0);
    expect(srcFiles).toContain("src/index.ts");
  });

  it("includes LICENSE and README", () => {
    expect(files).toContain("LICENSE");
    expect(files).toContain("README.md");
  });

  it("does not include test files or dev artifacts", () => {
    const unwanted = files.filter(
      (f) =>
        f.startsWith("tests/") ||
        f.startsWith("node_modules/") ||
        f.startsWith(".claude/") ||
        f === ".env"
    );
    expect(unwanted).toEqual([]);
  });

  it("bin entry points to a file with a shebang", () => {
    const pkg = JSON.parse(
      readFileSync(join(ROOT, "package.json"), "utf-8")
    );
    const binPath = Object.values(pkg.bin)[0] as string;
    const content = readFileSync(join(ROOT, binPath), "utf-8");
    expect(content.startsWith("#!/usr/bin/env node")).toBe(true);
  });
});
