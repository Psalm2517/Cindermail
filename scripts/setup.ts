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

// Commented-out in the example so mail.tm mode doesn't pick up a stale domain.
function commentOutEnvValue(content: string, key: string): string {
  return content.replace(new RegExp(`^${key}=.*$`, "m"), `# ${key}= (unused in mail.tm mode)`);
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

async function setupEnvPath(mode: "mailtm" | "selfhost"): Promise<void> {
  let content = readFileSync(".env.example", "utf8");

  if (mode === "selfhost") {
    const domain = await ask("\nDomain addresses get generated on (e.g. yourdomain.com)");
    if (domain) {
      content = setEnvValue(content, "DISPOSABLE_DOMAIN", domain);
    }
  } else {
    content = commentOutEnvValue(content, "DISPOSABLE_DOMAIN");
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
  if (mode === "selfhost") {
    console.log("  1. Point your domain's DNS at this machine: an A record for a mail");
    console.log("     hostname, then an MX record for the domain pointing at it.");
    console.log("     Full walkthrough: docs/deploy-selfhost.md");
    console.log("  2. npm start");
  } else {
    console.log("  npm run start:mailtm");
  }
  console.log("  Then finish the Discord side: docs/discord-adapter.md");
}

async function setupCloudflare(): Promise<void> {
  try {
    execFileSync("npx", ["wrangler", "--version"], { stdio: "ignore" });
  } catch {
    console.log("\nwrangler isn't available. Install it, then run this again:");
    console.log("  npm install -g wrangler");
    console.log("It needs Node.js 22 or newer.");
    return;
  }

  let content = readFileSync("wrangler.toml.example", "utf8");

  const domain = await ask("\nDomain addresses get generated on (e.g. yourdomain.com)");
  if (domain) {
    content = content.replace(/^DISPOSABLE_DOMAIN = .*$/m, `DISPOSABLE_DOMAIN = "${domain}"`);
  }

  for (const [key, value] of Object.entries(await askLimits())) {
    content = content.replace(/^(ADAPTERS = .*)$/m, `$1\n${key} = "${value}"`);
  }

  if (await confirm("\nRun `wrangler d1 create cinderbox` now?")) {
    try {
      const output = execFileSync("npx", ["wrangler", "d1", "create", "cinderbox"], { encoding: "utf8" });
      const id = output.match(/database_id\s*=\s*"([^"]+)"/)?.[1];
      if (id) {
        content = content.replace("REPLACE_WITH_D1_DATABASE_ID", id);
        console.log(`Found database_id ${id}`);
      } else {
        console.log("Couldn't find a database_id in wrangler's output. Copy it into");
        console.log("wrangler.toml yourself, it's printed above.");
      }
    } catch {
      console.log("`wrangler d1 create` failed. If it's an auth error, run `wrangler login`");
      console.log("first. Otherwise create the database yourself and put its database_id");
      console.log("into wrangler.toml.");
    }
  }

  if (!(await writeGuarded("wrangler.toml", content))) {
    return;
  }

  console.log("\nNext, the parts that can't be scripted:");
  console.log("  1. Check your domain's MX records point at Cloudflare Email Routing.");
  console.log("  2. npm run cf:db:init");
  console.log("  3. npm run cf:deploy");
  console.log("  4. Add a catch-all Email Routing rule whose action is this Worker.");
  console.log("  5. wrangler secret put DISCORD_TOKEN (and PUBLIC_KEY, APPLICATION_ID)");
  console.log("  Full walkthrough: docs/deploy-cloudflare.md, then docs/discord-adapter.md");
}

async function main(): Promise<void> {
  printBanner("setup");

  const major = Number(process.versions.node.split(".")[0]);
  if (major < 18) {
    console.log(`\nWarning: Node.js ${process.versions.node} is older than the supported v18.`);
  }

  console.log("\nHow should mail be received?\n");
  console.log("  1) mail.tm      quickest. No domain, no DNS, no server.");
  console.log("  2) Self-hosted  your domain, your machine, receives on port 25.");
  console.log("  3) Cloudflare   your domain, no server, Email Routing + D1.\n");

  const choice = await ask("Pick one", "1");
  switch (choice) {
    case "1":
      await setupEnvPath("mailtm");
      break;
    case "2":
      await setupEnvPath("selfhost");
      break;
    case "3":
      await setupCloudflare();
      break;
    default:
      console.log(`Not one of the options: ${choice}`);
  }
}

await main();
rl.close();
