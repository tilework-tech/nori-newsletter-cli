import { describe, it, expect } from "vitest";
import { stripDetachFlag } from "../../src/lib/detach.js";

describe("stripDetachFlag", () => {
  it("removes --detach so the background process runs in the foreground", () => {
    expect(stripDetachFlag(["send", "issue.html", "--detach"])).toEqual([
      "send",
      "issue.html",
    ]);
  });

  it("removes every --detach regardless of position", () => {
    expect(
      stripDetachFlag(["send", "--detach", "issue.html", "--detach"])
    ).toEqual(["send", "issue.html"]);
  });

  it("leaves args untouched when --detach is absent", () => {
    expect(stripDetachFlag(["send", "issue.html"])).toEqual([
      "send",
      "issue.html",
    ]);
  });
});
