import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Small pixel-sprite flame for terminal startup output, an explicit color
// grid rendered with true-color ANSI half-blocks rather than freehand ASCII
// line art. Terminal characters are roughly twice as tall as wide, so each
// printed line packs two pixel-rows (top via foreground, bottom via
// background) to keep the shape from stretching vertically.
const ESC = String.fromCharCode(27);
const RESET = `${ESC}[0m`;
const UPPER_HALF = "▀";
const LOWER_HALF = "▄";

const HOT = "#FFE066";
const MID = "#FF8C1A";
const EDGE = "#E8380D";

type Cell = null | typeof HOT | typeof MID | typeof EDGE;

// Pixel rows, top to bottom. Two rows render per printed line.
const PIXELS: Cell[][] = [
  [null, null, HOT, null, null],
  [null, HOT, HOT, HOT, null],
  [null, MID, HOT, MID, null],
  [null, MID, MID, MID, null],
  [MID, MID, MID, MID, MID],
  [EDGE, MID, MID, MID, EDGE],
  [EDGE, EDGE, MID, EDGE, EDGE],
  [null, EDGE, EDGE, EDGE, null],
];

function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function fg(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  return `${ESC}[38;2;${r};${g};${b}m`;
}

function bg(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  return `${ESC}[48;2;${r};${g};${b}m`;
}

function colorEnabled(): boolean {
  return Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
}

export function printFlame(): void {
  const color = colorEnabled();
  for (let i = 0; i < PIXELS.length; i += 2) {
    const top = PIXELS[i];
    if (!top) continue;
    const bottom = PIXELS[i + 1] ?? top.map(() => null);
    let line = "";
    for (let col = 0; col < top.length; col++) {
      const t = top[col];
      const b = bottom[col];
      if (!t && !b) {
        line += " ";
        continue;
      }
      if (!color) {
        line += "#";
        continue;
      }
      if (t && b) {
        line += `${fg(t)}${bg(b)}${UPPER_HALF}${RESET}`;
      } else if (t) {
        line += `${fg(t)}${UPPER_HALF}${RESET}`;
      } else if (b) {
        line += `${fg(b)}${LOWER_HALF}${RESET}`;
      }
    }
    console.log(line);
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
