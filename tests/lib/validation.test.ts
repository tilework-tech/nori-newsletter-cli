import { describe, it, expect } from "vitest";
import { isValidEmail } from "../../src/lib/validation.js";

describe("isValidEmail", () => {
  it("accepts a standard email", () => {
    expect(isValidEmail("user@example.com")).toBe(true);
  });

  it("accepts email with subdomain", () => {
    expect(isValidEmail("user@mail.example.com")).toBe(true);
  });

  it("accepts email with plus addressing", () => {
    expect(isValidEmail("user+tag@example.com")).toBe(true);
  });

  it("rejects empty string", () => {
    expect(isValidEmail("")).toBe(false);
  });

  it("rejects string without @", () => {
    expect(isValidEmail("userexample.com")).toBe(false);
  });

  it("rejects string without domain", () => {
    expect(isValidEmail("user@")).toBe(false);
  });

  it("rejects string without local part", () => {
    expect(isValidEmail("@example.com")).toBe(false);
  });
});
