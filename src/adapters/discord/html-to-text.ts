const ENTITIES: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  "#39": "'",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  mdash: "—",
  ndash: "–",
  hellip: "…",
  copy: "©",
  reg: "®",
  trade: "™",
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z0-9]+);/gi, (match, entity: string) => {
    if (entity[0] === "#") {
      const code = entity[1] === "x" || entity[1] === "X" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return ENTITIES[entity.toLowerCase()] ?? match;
  });
}

const BLOCK_CLOSE_TAGS = /<\/(p|div|tr|table|li|h[1-6]|blockquote|section|article|header|footer)>/gi;
const BREAK_TAGS = /<br\s*\/?>/gi;
const ANCHOR_TAG = /<a\b[^>]*\bhref\s*=\s*["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;

// Screen-reader-only accessibility text (e.g. Salesforce Marketing Cloud's
// pattern of a hidden <span> with a label like "Experian header logo" next to
// a logo/icon <img>) is visually hidden via CSS, not omitted from the HTML —
// so a naive tag-strip surfaces it as if it were real, visible link text.
const HIDDEN_ELEMENT =
  /<(span|div|td|p)\b(?=[^>]*\b(?:class\s*=\s*["'][^"']*(?:sr-only|screen-?reader|visually-?hidden|assistive)[^"']*["']|style\s*=\s*["'][^"']*(?:display\s*:\s*none|visibility\s*:\s*hidden|font-size\s*:\s*0)[^"']*["']))[^>]*>[\s\S]*?<\/\1>/gi;

export type LinkFormat = "plain" | "markdown";

// Placeholders standing in for the <> a markdown link's URL gets wrapped in
// (to suppress Discord's separate link-preview embed while keeping the
// masked link clickable). The generic tag-stripping pass later in the
// pipeline would otherwise mistake a literal "<url>" for an HTML tag and
// delete it, so real angle brackets are swapped in only as the final step.
const ANGLE_OPEN = "";
const ANGLE_CLOSE = "";

function formatLink(label: string, url: string, format: LinkFormat): string {
  return format === "markdown" ? `[${label}](${ANGLE_OPEN}${url}${ANGLE_CLOSE})` : `${label} (${url})`;
}

function replaceLinks(text: string, format: LinkFormat): string {
  const seenUrls = new Set<string>();

  return text.replace(ANCHOR_TAG, (match, href: string, inner: string) => {
    // Image-only links (logos, social icons, app-store badges, tracking pixels)
    // carry no readable content — alt text is for accessibility, not a summary,
    // and surfacing it just clutters the message with decorative noise. Only
    // links with real anchor text are kept.
    const label = inner.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (!label) {
      return "";
    }

    const url = href.trim();
    if (!url || url.startsWith("#") || url.toLowerCase().startsWith("javascript:")) {
      return label;
    }

    // Same destination linked more than once (e.g. a logo and a text CTA
    // pointing at the same tracking URL) — keep the first occurrence only.
    if (seenUrls.has(url)) {
      return label;
    }
    seenUrls.add(url);

    return formatLink(label, url, format);
  });
}

export function htmlToText(html: string, format: LinkFormat = "plain"): string {
  let text = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, "")
    .replace(HIDDEN_ELEMENT, "");

  text = replaceLinks(text, format);

  text = text
    .replace(BREAK_TAGS, "\n")
    .replace(BLOCK_CLOSE_TAGS, "\n")
    .replace(/<[^>]+>/g, "");

  text = decodeEntities(text);

  text = text.split(ANGLE_OPEN).join("<").split(ANGLE_CLOSE).join(">");

  return text
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter((line, i, lines) => line.length > 0 || (i > 0 && (lines[i - 1]?.length ?? 0) > 0))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
