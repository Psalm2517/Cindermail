// Small flame for terminal startup output. Shared across entrypoints now,
// and ready to reuse for a CLI later without redrawing it.
const ESC = String.fromCharCode(27);
const YELLOW = `${ESC}[38;5;226m`;
const ORANGE = `${ESC}[38;5;208m`;
const RED = `${ESC}[38;5;196m`;
const DARK_RED = `${ESC}[38;5;160m`;
const RESET = `${ESC}[0m`;

const FLAME_LINES: [string, string][] = [
  [YELLOW, "     ."],
  [YELLOW, "    (@)"],
  [ORANGE, "   (@@@)"],
  [ORANGE, "  (@@@@@)"],
  [RED, "   (@@@)"],
  [RED, "    (@)"],
  [DARK_RED, "     `"],
];

// Respects the NO_COLOR convention (https://no-color.org) and only colors
// output when stdout is an actual terminal, not a file or a log collector
// that won't interpret the escape codes and would otherwise just show them
// as literal garbage.
function colorEnabled(): boolean {
  return Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
}

export function printBanner(subtitle: string): void {
  if (colorEnabled()) {
    for (const [color, line] of FLAME_LINES) {
      console.log(color + line + RESET);
    }
  } else {
    for (const [, line] of FLAME_LINES) {
      console.log(line);
    }
  }
  console.log(`Cindermail  ${subtitle}`);
}
