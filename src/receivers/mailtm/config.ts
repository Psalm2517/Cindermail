function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export interface MailtmConfig {
  adapters: string[];
  httpPort: number;
  sqlitePath: string;
  pollIntervalMs: number;
  discordToken: string;
  discordPublicKey: string;
  discordApplicationId: string;
}

// No DISPOSABLE_DOMAIN, no SMTP_PORT, no SMTP_HOST: this mode owns no
// domain and receives no inbound connections at all, mail.tm handles both.
export function loadMailtmConfig(): MailtmConfig {
  const adapters = (process.env.ADAPTERS ?? "discord").split(",").map((s) => s.trim());
  const needsDiscord = adapters.includes("discord");
  return {
    adapters,
    httpPort: Number.parseInt(process.env.HTTP_PORT ?? "8787", 10),
    sqlitePath: process.env.SQLITE_PATH ?? "./cinderbox.db",
    pollIntervalMs: Number.parseInt(process.env.MAILTM_POLL_INTERVAL_SECONDS ?? "15", 10) * 1000,
    discordToken: needsDiscord ? requireEnv("DISCORD_TOKEN") : (process.env.DISCORD_TOKEN ?? ""),
    discordPublicKey: needsDiscord ? requireEnv("DISCORD_PUBLIC_KEY") : (process.env.DISCORD_PUBLIC_KEY ?? ""),
    discordApplicationId: needsDiscord
      ? requireEnv("DISCORD_APPLICATION_ID")
      : (process.env.DISCORD_APPLICATION_ID ?? ""),
  };
}
