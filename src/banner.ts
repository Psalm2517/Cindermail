// Small flame for terminal startup output. Shared across entrypoints now,
// and ready to reuse for a CLI later without redrawing it.
export const FLAME = [
  "    )",
  "   ) \\",
  "  (   )",
  "   \\ /",
  "    '",
].join("\n");

export function printBanner(subtitle: string): void {
  console.log(FLAME);
  console.log(`Cindermail  ${subtitle}`);
}
