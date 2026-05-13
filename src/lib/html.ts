export function extractSubject(html: string): string | null {
  const match = html.match(/<title>(.*?)<\/title>/is);
  if (!match) return null;
  const trimmed = match[1].trim();
  return trimmed.length > 0 ? trimmed : null;
}
