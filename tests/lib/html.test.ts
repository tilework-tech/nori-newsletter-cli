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

  it("decodes named HTML entities so the subject is plain text", () => {
    const html = `<html><head><title>Agentics: It&rsquo;s never been easier &mdash; &ldquo;Q&amp;A&rdquo;</title></head></html>`;

    expect(extractSubject(html)).toBe("Agentics: It\u2019s never been easier \u2014 \u201cQ&A\u201d");
  });

  it("decodes decimal and hex numeric entities", () => {
    const html = `<title>It&#8217;s &#x2014; &#39;done&#39;</title>`;

    expect(extractSubject(html)).toBe("It\u2019s \u2014 'done'");
  });

  it("leaves unknown entities and bare ampersands as written", () => {
    const html = `<title>R&D &notareal; &#xZZ;</title>`;

    expect(extractSubject(html)).toBe("R&D &notareal; &#xZZ;");
  });

  it("collapses line breaks in a wrapped title onto one line", () => {
    const html = `<title>Agentics:\n    a wrapped\ttitle</title>`;

    expect(extractSubject(html)).toBe("Agentics: a wrapped title");
  });
});
