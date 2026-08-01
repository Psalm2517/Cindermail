import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Small pixel-sprite flame for terminal startup output, an explicit color
// grid rendered with true-color ANSI rather than freehand ASCII line art.
// Shared across entrypoints, ready to reuse for a CLI later without
// redrawing it.
const ESC = String.fromCharCode(27);
const RESET = `${ESC}[0m`;

// A flame with a face sitting on an envelope, small enough for a startup line.
const HOT = "#FFE066";
const MID = "#FF8C1A";
const EYE = "#2A1204";
const PAPER = "#E8E4DA";

type Cell = null | typeof HOT | typeof MID | typeof EYE | typeof PAPER;

const GRID: Cell[][] = [
  [null, null, null, HOT, null, null, null],
  [null, null, HOT, HOT, HOT, null, null],
  [null, MID, EYE, MID, EYE, MID, null],
  [null, MID, MID, MID, MID, MID, null],
  [PAPER, PAPER, PAPER, PAPER, PAPER, PAPER, PAPER],
  [PAPER, null, null, null, null, null, PAPER],
  [PAPER, PAPER, PAPER, PAPER, PAPER, PAPER, PAPER],
];

function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function fg(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  return `${ESC}[38;2;${r};${g};${b}m`;
}

function colorEnabled(): boolean {
  return Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
}

export function printFlame(): void {
  const color = colorEnabled();
  for (const row of GRID) {
    let line = "";
    for (const cell of row) {
      if (!cell) {
        line += " ";
      } else if (color) {
        line += `${fg(cell)}█${RESET}`;
      } else {
        line += "#";
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
