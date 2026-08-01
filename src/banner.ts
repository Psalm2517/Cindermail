import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Small pixel-art flame for terminal startup output, solid color blocks
// rather than punctuation line-art, matching how a terminal mascot usually
// reads at this size. Shared across entrypoints, ready to reuse for a CLI
// later without redrawing it.
const ESC = String.fromCharCode(27);
const YELLOW = `${ESC}[38;5;226m`;
const ORANGE = `${ESC}[38;5;208m`;
const RED = `${ESC}[38;5;196m`;
const RESET = `${ESC}[0m`;

const FLAME_LINES: [string, string][] = [
  [YELLOW, "   ▄▄   "],
  [YELLOW, "  ████  "],
  [ORANGE, " ██████ "],
  [ORANGE, " ██████ "],
  [RED, "████████"],
  [RED, "████████"],
  [RED, "████████"],
];

// Respects the NO_COLOR convention (https://no-color.org) and only colors
// output when stdout is an actual terminal, not a file or a log collector
// that won't interpret the escape codes and would otherwise just show them
// as literal garbage.
function colorEnabled(): boolean {
  return Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
}

export function printFlame(): void {
  if (colorEnabled()) {
    for (const [color, line] of FLAME_LINES) {
      console.log(color + line + RESET);
    }
  } else {
    for (const [, line] of FLAME_LINES) {
      console.log(line);
    }
  }
}

export function printBanner(subtitle: string): void {
  printFlame();
  console.log(`Cindermail  ${subtitle}`);
}

// Lets this file run standalone with zero config/env requirements:
//   node --experimental-strip-types src/banner.ts
// Useful to just look at the banner without needing a working .env first.
if (process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1])) {
  printFlame();
  console.log("Cindermail");
}
