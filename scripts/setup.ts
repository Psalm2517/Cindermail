import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

import { printBanner } from "../src/banner.ts";

const rl = createInterface({ input: stdin, output: stdout });

async function ask(question: string, fallback = ""): Promise<string> {
  const suffix = fallback ? ` [${fallback}]` : "";
  const answer = (await rl.question(`${question}${suffix}: `)).trim();
  return answer || fallback;
}

async function confirm(question: string): Promise<boolean> {
  const answer = (await rl.question(`${question} [y/N]: `)).trim().toLowerCase();
  return answer === "y" || answer === "yes";
}

function setEnvValue(content: string, key: string, value: string): string {
  const pattern = new RegExp(`^#?\\s*${key}=.*$`, "m");
  const line = `${key}=${value}`;
  return pattern.test(content) ? content.replace(pattern, line) : `${content.trimEnd()}\n${line}\n`;
}

async function writeGuarded(path: string, content: string): Promise<boolean> {
  if (existsSync(path) && !(await confirm(`${path} already exists. Overwrite it?`))) {
    console.log(`Left ${path} alone. Nothing written.`);
    return false;
  }
  writeFileSync(path, content);
  console.log(`Wrote ${path}`);
  return true;
}

async function askDiscordCredentials(): Promise<Record<string, string>> {
  console.log("\nDiscord credentials, from discord.com/developers/applications.");
  console.log("Leave any blank to skip and fill them into .env yourself later.");
  return {
    DISCORD_TOKEN: await ask("  Bot token"),
    DISCORD_PUBLIC_KEY: await ask("  Public key"),
    DISCORD_APPLICATION_ID: await ask("  Application ID"),
  };
}

async function askLimits(): Promise<Record<string, string>> {
  if (!(await confirm("\nCustomize limits (active addresses per owner, address expiry)?"))) {
    return {};
  }
  const maxActive = await ask("  Max active addresses per owner", "5");
  const ttlDays = await ask("  Address expiry, in days", "10");
  console.log("  Rate limits (per-command call caps) aren't prompted here, the");
  console.log("  defaults are fine for almost everyone. See docs/configuration.md");
  console.log("  if you want to change those.");

  const result: Record<string, string> = {};
  if (maxActive) {
    result.MAX_ACTIVE_ADDRESSES = maxActive;
  }
  if (ttlDays) {
    result.ADDRESS_TTL_SECONDS = String(Number(ttlDays) * 86400);
  }
  return result;
}

// Only the self-hosted path writes .env now. Both Cloudflare modes (domain
// and mail.tm) configure wrangler.jsonc instead, see setupCloudflare.
async function setupSelfHost(): Promise<void> {
  let content = readFileSync(".env.example", "utf8");

  const domain = await ask("\nDomain addresses get generated on (e.g. yourdomain.com)");
  if (domain) {
    content = setEnvValue(content, "DISPOSABLE_DOMAIN", domain);
  }

  for (const [key, value] of Object.entries(await askDiscordCredentials())) {
    if (value) {
      content = setEnvValue(content, key, value);
    }
  }

  for (const [key, value] of Object.entries(await askLimits())) {
    content = setEnvValue(content, key, value);
  }

  if (!(await writeGuarded(".env", content))) {
    return;
  }

  console.log("\nNext:");
  console.log("  1. Point your domain's DNS at this machine: an A record for a mail");
  console.log("     hostname, then an MX record for the domain pointing at it.");
  console.log("     Full walkthrough: docs/deploy-selfhost.md");
  console.log("  2. npm start");
  console.log("  Then finish the Discord side: docs/discord-adapter.md");
}

async function setupCloudflare(mode: "domain" | "mailtm"): Promise<void> {
  try {
    execFileSync("npx", ["wrangler", "--version"], { stdio: "ignore" });
  } catch {
    console.log("\nwrangler isn't available. Install it, then run this again:");
    console.log("  npm install -g wrangler");
    console.log("It needs Node.js 22 or newer.");
    return;
  }

  // wrangler.jsonc is committed (Workers Builds clones the repo and needs
  // the D1 binding present at build time), so this edits it in place rather
  // than writing a second config file. Wrangler picks .jsonc over .toml
  // silently, so a stray wrangler.toml would just be ignored.
  let content = readFileSync("wrangler.jsonc", "utf8");

  if (mode === "domain") {
    const domain = await ask("\nDomain addresses get generated on (e.g. yourdomain.com)");
    if (domain) {
      content = content.replace(/("DISPOSABLE_DOMAIN":\s*)"[^"]*"/, `$1"${domain}"`);
    }
  } else {
    // An empty DISPOSABLE_DOMAIN is what puts the Worker in mail.tm mode.
    // Emptied rather than removed so it's obvious what to fill in later to
    // switch over to a domain.
    content = content.replace(/("DISPOSABLE_DOMAIN":\s*)"[^"]*"/, `$1""`);
  }

  for (const [key, value] of Object.entries(await askLimits())) {
    content = content.replace(new RegExp(`("${key}":\\s*)"[^"]*"`), `$1"${value}"`);
    if (!content.includes(`"${key}"`)) {
      content = content.replace(/("ADAPTERS":\s*"[^"]*")/, `$1,\n    "${key}": "${value}"`);
    }
  }

  if (await confirm("\nRun `wrangler d1 create cinderbox` now?")) {
    try {
      const output = execFileSync("npx", ["wrangler", "d1", "create", "cinderbox"], { encoding: "utf8" });
      const id = output.match(/database_id\s*[=:]\s*"?([0-9a-f-]{36})"?/i)?.[1];
      if (id) {
        content = content.replace(/("database_id":\s*)"[^"]*"/, `$1"${id}"`);
        console.log(`Found database_id ${id}`);
      } else {
        console.log("Couldn't find a database_id in wrangler's output. Put it into");
        console.log("wrangler.jsonc yourself, it's printed above.");
      }
    } catch {
      console.log("`wrangler d1 create` failed. If it's an auth error, run `wrangler login`");
      console.log("first. Otherwise create the database yourself and put its database_id");
      console.log("into wrangler.jsonc.");
    }
  }

  const originalId = readFileSync("wrangler.jsonc", "utf8").match(/"database_id":\s*"([^"]*)"/)?.[1];
  const keptUpstreamId = originalId && content.includes(`"database_id": "${originalId}"`);

  if (!(await writeGuarded("wrangler.jsonc", content))) {
    return;
  }

  if (keptUpstreamId) {
    console.log("\n! wrangler.jsonc still has the database_id it shipped with, which");
    console.log("  points at someone else's D1 database. Replace it with your own");
    console.log("  before deploying: `npx wrangler d1 create cinderbox` prints one.");
  }

  console.log("\nNext, the parts that can't be scripted:");
  if (mode === "domain") {
    console.log("  1. Check your domain's MX records point at Cloudflare Email Routing.");
    console.log("  2. npm run cf:db:init");
    console.log("  3. wrangler secret put DISCORD_TOKEN (and PUBLIC_KEY, APPLICATION_ID)");
    console.log("  4. npm run cf:deploy");
    console.log("  5. Add a catch-all Email Routing rule whose action is this Worker.");
  } else {
    console.log("  1. npm run cf:db:init");
    console.log("  2. wrangler secret put DISCORD_TOKEN (and PUBLIC_KEY, APPLICATION_ID)");
    console.log("  3. npm run cf:deploy");
    console.log("  No DNS or Email Routing to set up, mail.tm handles receiving.");
  }
  console.log("  Full walkthrough: docs/deploy-cloudflare.md, then docs/discord-adapter.md");
}

async function main(): Promise<void> {
  printBanner("setup");

  const major = Number(process.versions.node.split(".")[0]);
  if (major < 18) {
    console.log(`\nWarning: Node.js ${process.versions.node} is older than the supported v18.`);
  }

  console.log("\nWhere should this run?\n");
  console.log("  1) Cloudflare, mail.tm mode   no domain, no server. Quickest.");
  console.log("  2) Cloudflare, your domain    no server. Needs a domain.");
  console.log("  3) Self-hosted                your domain, your machine, port 25.\n");
  console.log("  The two Cloudflare options are one Worker, switchable later.");
  console.log("  See README.md for the tradeoffs, mail.tm's domain is blocked");
  console.log("  by some signup forms.\n");

  const choice = await ask("Pick one", "1");
  switch (choice) {
    case "1":
      await setupCloudflare("mailtm");
      break;
    case "2":
      await setupCloudflare("domain");
      break;
    case "3":
      await setupSelfHost();
      break;
    default:
      console.log(`Not one of the options: ${choice}`);
  }
}

await main();
rl.close();
