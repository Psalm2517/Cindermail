function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export interface NodeHostConfig {
  disposableDomain: string;
  adapters: string[];
  smtpPort: number;
  smtpHost: string;
  httpPort: number;
  sqlitePath: string;
  discordToken: string;
  discordPublicKey: string;
  discordApplicationId: string;
}

export function loadNodeHostConfig(): NodeHostConfig {
  const adapters = (process.env.ADAPTERS ?? "discord").split(",").map((s) => s.trim());
  const needsDiscord = adapters.includes("discord");
  return {
    disposableDomain: requireEnv("DISPOSABLE_DOMAIN"),
    adapters,
    smtpPort: Number.parseInt(process.env.SMTP_PORT ?? "25", 10),
    smtpHost: process.env.SMTP_HOST ?? "0.0.0.0",
    httpPort: Number.parseInt(process.env.HTTP_PORT ?? "8787", 10),
    sqlitePath: process.env.SQLITE_PATH ?? "./cinderbox.db",
    discordToken: needsDiscord ? requireEnv("DISCORD_TOKEN") : (process.env.DISCORD_TOKEN ?? ""),
    discordPublicKey: needsDiscord ? requireEnv("DISCORD_PUBLIC_KEY") : (process.env.DISCORD_PUBLIC_KEY ?? ""),
    discordApplicationId: needsDiscord
      ? requireEnv("DISCORD_APPLICATION_ID")
      : (process.env.DISCORD_APPLICATION_ID ?? ""),
  };
}
