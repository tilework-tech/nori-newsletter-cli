import { describe, it, expect } from "vitest";
import {
  buildTracking,
  campaignIdFromFile,
  sanitizeTagValue,
} from "../../src/lib/campaign.js";

describe("campaignIdFromFile", () => {
  it("derives a campaign id from a real issue filename", () => {
    expect(
      campaignIdFromFile(
        "2026-08-05-how-to-build-an-agent-to-automate-your-on-call.html"
      )
    ).toBe("2026-08-05-how-to-build-an-agent-to-automate-your-on-call");
  });

  it("strips directories and the .html extension", () => {
    expect(campaignIdFromFile("/tmp/issues/2026-08-05-launch.html")).toBe(
      "2026-08-05-launch"
    );
  });

  it("sanitizes dots left by other extensions", () => {
    expect(campaignIdFromFile("draft.v2.htm")).toBe("draft-v2-htm");
  });

  it("returns unknown for a filename with nothing usable", () => {
    expect(campaignIdFromFile("...html")).toBe("unknown");
  });
});

describe("sanitizeTagValue", () => {
  it("keeps letters, digits, hyphens and underscores", () => {
    expect(sanitizeTagValue("Issue_42-final")).toBe("Issue_42-final");
  });

  it("replaces dots and spaces", () => {
    expect(sanitizeTagValue("my issue.v1")).toBe("my-issue-v1");
  });

  it("replaces unicode", () => {
    expect(sanitizeTagValue("café–naïve")).toBe("caf-na-ve");
  });

  it("collapses repeated hyphens", () => {
    expect(sanitizeTagValue("a   b...c")).toBe("a-b-c");
  });

  it("trims leading and trailing hyphens", () => {
    expect(sanitizeTagValue("  spaced out  ")).toBe("spaced-out");
  });

  it("truncates at 256 characters", () => {
    const result = sanitizeTagValue("a".repeat(300));
    expect(result).toHaveLength(256);
  });

  it("returns unknown for an empty string", () => {
    expect(sanitizeTagValue("")).toBe("unknown");
  });

  it("returns unknown when every character is stripped", () => {
    expect(sanitizeTagValue("!!! ???")).toBe("unknown");
  });
});

describe("buildTracking", () => {
  it("returns a config set plus campaign and source tags when configured", () => {
    expect(buildTracking("newsletter-tracking", "2026-08-05-launch")).toEqual({
      configurationSetName: "newsletter-tracking",
      emailTags: [
        { name: "campaign", value: "2026-08-05-launch" },
        { name: "source", value: "newsletter" },
      ],
    });
  });

  it("returns undefined without a configuration set, since tags alone do nothing", () => {
    expect(buildTracking(undefined, "2026-08-05-launch")).toBeUndefined();
    expect(buildTracking("", "2026-08-05-launch")).toBeUndefined();
  });
});
