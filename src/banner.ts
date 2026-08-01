import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function printFlame(): void {
  console.log("🔥");
}

export function printBanner(subtitle: string): void {
  console.log(`🔥 Cindermail  ${subtitle}`);
}

// Lets this file run standalone with zero config/env requirements:
//   node --experimental-strip-types src/banner.ts
// Useful to just look at the banner without needing a working .env first.
if (process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1])) {
  console.log("🔥 Cindermail");
}
