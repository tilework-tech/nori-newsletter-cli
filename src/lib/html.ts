// Named entities that issue HTML uses in titles. Anything not listed here is
// left as written rather than guessed at.
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  sbquo: "‚",
  bdquo: "„",
  mdash: "—",
  ndash: "–",
  hellip: "…",
  middot: "·",
  bull: "•",
  copy: "©",
  reg: "®",
  trade: "™",
  deg: "°",
  times: "×",
  rarr: "→",
  larr: "←",
};

export function decodeEntities(text: string): string {
  return text.replace(
    /&(?:#(\d+)|#[xX]([0-9a-fA-F]+)|([a-zA-Z][a-zA-Z0-9]*));/g,
    (entity, dec?: string, hex?: string, name?: string) => {
      if (name !== undefined) return NAMED_ENTITIES[name] ?? entity;
      const code = dec !== undefined ? Number(dec) : parseInt(hex!, 16);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : entity;
    },
  );
}

// The subject is the <title> as a reader sees it: entities decoded and
// whitespace collapsed onto one line, because SES sends the header verbatim.
export function extractSubject(html: string): string | null {
  const match = html.match(/<title>(.*?)<\/title>/is);
  if (!match) return null;
  const subject = decodeEntities(match[1]).replace(/\s+/g, " ").trim();
  return subject.length > 0 ? subject : null;
}
