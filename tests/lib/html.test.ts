import { describe, it, expect } from "vitest";
import { extractSubject } from "../../src/lib/html.js";

describe("extractSubject", () => {
  it("extracts subject from a title tag", () => {
    const html = `<!DOCTYPE html>
<html><head><title>Weekly Update - March 2026</title></head>
<body><p>Hello</p></body></html>`;

    expect(extractSubject(html)).toBe("Weekly Update - March 2026");
  });

  it("returns null when there is no title tag", () => {
    const html = `<!DOCTYPE html>
<html><head></head><body><p>Hello</p></body></html>`;

    expect(extractSubject(html)).toBeNull();
  });

  it("returns null for empty title tag", () => {
    const html = `<html><head><title></title></head><body></body></html>`;

    expect(extractSubject(html)).toBeNull();
  });

  it("handles title with whitespace", () => {
    const html = `<html><head><title>  Nori Newsletter  </title></head></html>`;

    expect(extractSubject(html)).toBe("Nori Newsletter");
  });

  it("decodes named and numeric character references, since a subject is plain text", () => {
    const html = `<html><head><title>Agentics: It&rsquo;s R&amp;D &#8220;week&#x201D;&hellip;</title></head></html>`;

    expect(extractSubject(html)).toBe("Agentics: It\u2019s R&D \u201cweek\u201d\u2026");
  });

  it("decodes a double-escaped reference only once, as a browser shows it", () => {
    const html = `<html><head><title>It&amp;rsquo;s</title></head></html>`;

    expect(extractSubject(html)).toBe("It&rsquo;s");
  });
});
