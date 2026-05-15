import { describe, it, expect } from "vitest";
import { extractEmail } from "../../src/lib/email.js";

describe("extractEmail", () => {
  it("extracts email from display name format", () => {
    expect(extractEmail("My Newsletter <news@example.com>")).toBe("news@example.com");
  });

  it("returns bare email unchanged", () => {
    expect(extractEmail("news@example.com")).toBe("news@example.com");
  });

  it("handles empty display name", () => {
    expect(extractEmail("<news@example.com>")).toBe("news@example.com");
  });
});
