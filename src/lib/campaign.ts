import { basename } from "node:path";

// SES message tags are far stricter than filenames: a tag name or value may
// contain ONLY ASCII letters, digits, hyphens and underscores, and must be
// 1-256 characters. An issue filename like
// "2026-08-05-how-to-build-an-agent.html" is usually close, but dots, spaces,
// apostrophes and non-ASCII characters are all common and all rejected by SES
// (the whole SendEmail call fails, not just the tag). Everything here exists to
// turn arbitrary input into something SES will accept.
const MAX_TAG_LENGTH = 256;

export function sanitizeTagValue(value: string): string {
  const sanitized = value
    .replace(/[^A-Za-z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_TAG_LENGTH);

  return sanitized === "" ? "unknown" : sanitized;
}

// Derives the campaign id used to attribute SES open/click events to a
// specific newsletter issue. The HTML filename is the only stable, per-issue
// identifier the CLI already has.
export function campaignIdFromFile(htmlFile: string): string {
  return sanitizeTagValue(basename(htmlFile, ".html"));
}

export interface SendTracking {
  configurationSetName?: string;
  emailTags?: Array<{ name: string; value: string }>;
}

export const NO_CONFIG_SET_WARNING =
  "Warning: no configurationSetName in newsletter.config.json - " +
  "SES will not emit open/click events for this send.\n";

// Without a configuration set SES emits no open/click events at all, so tags
// would have nothing to attribute. Send them together or not at all.
export function buildTracking(
  configurationSetName: string | undefined,
  campaignId: string
): SendTracking | undefined {
  if (!configurationSetName) return undefined;

  return {
    configurationSetName,
    emailTags: [
      { name: "campaign", value: campaignId },
      { name: "source", value: "newsletter" },
    ],
  };
}
