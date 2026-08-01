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
  return {
    adapters: (process.env.ADAPTERS ?? "discord").split(",").map((s) => s.trim()),
    httpPort: Number.parseInt(process.env.HTTP_PORT ?? "8787", 10),
    sqlitePath: process.env.SQLITE_PATH ?? "./cinderbox.db",
    pollIntervalMs: Number.parseInt(process.env.MAILTM_POLL_INTERVAL_SECONDS ?? "15", 10) * 1000,
    discordToken: requireEnv("DISCORD_TOKEN"),
    discordPublicKey: requireEnv("DISCORD_PUBLIC_KEY"),
    discordApplicationId: requireEnv("DISCORD_APPLICATION_ID"),
  };
}
