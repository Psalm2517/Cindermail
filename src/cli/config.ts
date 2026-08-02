function parseIntEnv(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export interface CliConfig {
  sqlitePath: string;
  addressTtlSeconds: number;
  // "mailtm" if DISPOSABLE_DOMAIN is unset, since mail.tm needs no domain.
  // Set DISPOSABLE_DOMAIN to create addresses on your own domain instead.
  disposableDomain: string | null;
}

export function loadCliConfig(): CliConfig {
  return {
    sqlitePath: process.env.SQLITE_PATH ?? "./cinderbox.db",
    addressTtlSeconds: parseIntEnv(process.env.ADDRESS_TTL_SECONDS, 10 * 24 * 60 * 60),
    disposableDomain: process.env.DISPOSABLE_DOMAIN ?? null,
  };
}
