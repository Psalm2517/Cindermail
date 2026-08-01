// Self-hosters own the abuse-vs-friction tradeoff for their own deployment —
// these aren't safety rails Cinderbox needs to enforce on everyone, so
// they're tunable via env vars rather than hardcoded. Defaults match a
// public/multi-user deployment; a solo self-hoster who wants no limits at
// all can set every RATE_LIMIT_*_MAX to a very large number, or 0 to disable
// a given command's limit outright.
export interface RateLimitConfig {
  windowSeconds: number;
  maxCount: number;
}

export interface CommandConfig {
  maxActiveAddresses: number;
  addressTtlSeconds: number;
  rateLimits: Record<string, RateLimitConfig | null>;
}

function parseIntEnv(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function rateLimitFromEnv(
  env: Record<string, string | undefined>,
  prefix: string,
  defaultWindowSeconds: number,
  defaultMaxCount: number
): RateLimitConfig | null {
  const maxCount = parseIntEnv(env[`${prefix}_MAX`], defaultMaxCount);
  if (maxCount === 0) {
    return null; // explicitly disabled for this command
  }
  return {
    windowSeconds: parseIntEnv(env[`${prefix}_WINDOW_SECONDS`], defaultWindowSeconds),
    maxCount,
  };
}

export function buildCommandConfig(env: Record<string, string | undefined>): CommandConfig {
  return {
    maxActiveAddresses: parseIntEnv(env.MAX_ACTIVE_ADDRESSES, 5),
    addressTtlSeconds: parseIntEnv(env.ADDRESS_TTL_SECONDS, 7 * 24 * 60 * 60),
    rateLimits: {
      new: rateLimitFromEnv(env, "RATE_LIMIT_NEW", 30, 1),
      list: rateLimitFromEnv(env, "RATE_LIMIT_LIST", 60, 15),
      extend: rateLimitFromEnv(env, "RATE_LIMIT_EXTEND", 60, 15),
      torch: rateLimitFromEnv(env, "RATE_LIMIT_TORCH", 60, 15),
    },
  };
}
