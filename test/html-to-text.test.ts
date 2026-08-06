import { test } from "node:test";
import assert from "node:assert/strict";
import { escapeMarkdown, htmlToText } from "../src/adapters/discord/html-to-text.ts";

// Everything an email carries is attacker-controlled: anyone who learns an
// address can send to it, and Discord renders markdown in bot messages. The
// headline risk is a masked link, `[label](url)`, arriving as a clickable
// link whose visible text lies about where it goes.
test("markdown escaping", async (t) => {
  await t.test("defuses a masked link in plain text", () => {
    const out = escapeMarkdown("Verify at [www.yourbank.com](https://evil.example/steal)");
    assert.match(out, /\\\[www\.yourbank\.com\\\]/);
  });

  await t.test("defuses a masked link written into an anchor's own label", () => {
    const out = htmlToText('<a href="https://real.example">[www.yourbank.com](https://evil.example)</a>');
    assert.match(out, /\\\[/);
    assert.ok(out.includes("(<https://real.example>)"), out);
  });

  await t.test("defuses brackets smuggled in as HTML entities", () => {
    // Entity decoding has to happen before escaping, or &#91; slips through
    // as a live bracket.
    assert.ok(htmlToText("<p>&#91;label&#93;(https://evil.example)</p>").includes("\\[label\\]"));
  });

  await t.test("escapes formatting characters", () => {
    assert.doesNotMatch(escapeMarkdown("**b** _i_ `c` ~s~ ||x||"), /(?<!\\)[*_`~|]/);
  });

  await t.test("a backslash cannot be used to undo the escaping", () => {
    assert.ok(escapeMarkdown("\\[x](y)").startsWith("\\\\\\["));
  });

  await t.test("leaves ordinary punctuation readable", () => {
    // Escaping these too would be correct but makes normal prose unreadable,
    // and they're cosmetic at worst: no link can be forged with them.
    const prose = "Order #123 (shipped) - 50% off > see details";
    assert.equal(escapeMarkdown(prose), prose);
  });
});

test("link rendering", async (t) => {
  await t.test("keeps the label and shows the real destination", () => {
    assert.equal(
      htmlToText('<a href="https://example.com/a?x=1&amp;y=2">Click here</a>'),
      "Click here (<https://example.com/a?x=1&y=2>)"
    );
  });

  await t.test("never escapes the URL itself", () => {
    // The URL is held out of the text while escaping runs; a mangled one
    // would be worse than useless.
    assert.doesNotMatch(htmlToText('<a href="https://ex.example/a_b_c">x</a>'), /\\/);
  });

  await t.test("keeps each URL with its own label", () => {
    const out = htmlToText('<a href="https://a.example">A</a><br><a href="https://b.example">B</a>');
    assert.ok(out.includes("A (<https://a.example>)"), out);
    assert.ok(out.includes("B (<https://b.example>)"), out);
  });

  await t.test("shows a repeated destination only once", () => {
    const out = htmlToText('<a href="https://x.example">One</a> <a href="https://x.example">Two</a>');
    assert.equal((out.match(/x\.example/g) ?? []).length, 1);
  });

  await t.test("drops javascript: URLs but keeps the text", () => {
    assert.equal(htmlToText('<a href="javascript:alert(1)">bad</a>'), "bad");
  });

  await t.test("drops image-only links entirely", () => {
    assert.equal(htmlToText('<a href="https://x.example"><img src="y"></a>'), "");
  });
});

test("content extraction", async (t) => {
  await t.test("strips scripts, styles and comments", () => {
    assert.equal(htmlToText("<style>p{color:red}</style><!--x--><p>Hi</p><script>x()</script>"), "Hi");
  });

  await t.test("strips invisible preheader padding", () => {
    assert.equal(htmlToText("<p>Hi​​­</p>"), "Hi");
  });

  await t.test("strips short screen-reader-only labels", () => {
    assert.equal(htmlToText('<span class="sr-only">Company logo</span><p>Real</p>'), "Real");
  });

  await t.test("keeps long hidden blocks, which are usually real content", () => {
    const long = "word ".repeat(100);
    assert.ok(htmlToText(`<div style="display:none">${long}</div>`).includes("word"));
  });
});
