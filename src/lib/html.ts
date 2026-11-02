import { decodeHTML } from "entities";

export function extractSubject(html: string): string | null {
  const match = html.match(/<title>(.*?)<\/title>/is);
  if (!match) return null;
  const subject = decodeHTML(match[1]).trim();
  return subject.length > 0 ? subject : null;
}
