// Standalone script, not part of the Worker bundle.
// Run with: DISCORD_TOKEN=... DISCORD_APPLICATION_ID=... node --experimental-strip-types src/adapters/discord/register-commands.ts

const token = process.env.DISCORD_TOKEN;
const applicationId = process.env.DISCORD_APPLICATION_ID;

if (!token || !applicationId) {
  console.error("DISCORD_TOKEN and DISCORD_APPLICATION_ID must be set in the environment.");
  process.exit(1);
}

const GUILD_AND_USER_INSTALL = [0, 1];
const ALL_CONTEXTS = [0, 1, 2];

// Discord option type 4 is INTEGER, 3 is STRING. min_value/max_value make
// Discord reject out-of-range input in its own UI before it ever reaches the
// Worker; interactions.ts validates again anyway.
const MAX_EXPIRY_DAYS = 3650;

const commands = [
  {
    name: "new",
    description: "Create a new disposable email address",
    integration_types: GUILD_AND_USER_INSTALL,
    contexts: ALL_CONTEXTS,
    options: [
      {
        type: 4,
        name: "expiry",
        description: "Days until it expires. Leave blank or use 0 for permanent.",
        required: false,
        min_value: 0,
        max_value: MAX_EXPIRY_DAYS,
      },
    ],
  },
  {
    name: "list",
    description: "List your active disposable email addresses",
    integration_types: GUILD_AND_USER_INSTALL,
    contexts: ALL_CONTEXTS,
  },
  {
    name: "extend",
    description: "Change when a disposable email address expires",
    integration_types: GUILD_AND_USER_INSTALL,
    contexts: ALL_CONTEXTS,
    options: [
      {
        type: 3,
        name: "address",
        description: "The address to extend",
        required: true,
      },
      {
        type: 4,
        name: "expiry",
        description: "Days from now until it expires. Use 0 for permanent.",
        required: false,
        min_value: 0,
        max_value: MAX_EXPIRY_DAYS,
      },
    ],
  },
  {
    name: "torch",
    description: "Torch (revoke) a disposable email address",
    integration_types: GUILD_AND_USER_INSTALL,
    contexts: ALL_CONTEXTS,
    options: [
      {
        type: 3,
        name: "address",
        description: "The address to torch",
        required: true,
      },
    ],
  },
];

async function main() {
  const response = await fetch(`https://discord.com/api/v10/applications/${applicationId}/commands`, {
    method: "PUT",
    headers: {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(commands),
  });

  if (!response.ok) {
    const body = await response.text();
    console.error(`Failed to register commands: ${response.status} ${body}`);
    process.exit(1);
  }

  console.log("Commands registered successfully.");
}

main();
