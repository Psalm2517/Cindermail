const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

// Matches the Workers deployment's "0 3 * * *" cron schedule, so cleanup
// timing is consistent regardless of which host is running. `run` is
// whatever a given receiver needs done: for SMTP-based receivers that's
// just deleting expired/revoked rows and stale rate limits, for mail.tm it
// also needs to delete the account on their side first.
export function scheduleCleanup(run: () => void | Promise<void>) {
  const now = new Date();
  const next3am = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 3, 0, 0, 0));
  if (next3am <= now) {
    next3am.setUTCDate(next3am.getUTCDate() + 1);
  }
  setTimeout(() => {
    void run();
    setInterval(() => void run(), CLEANUP_INTERVAL_MS);
  }, next3am.getTime() - now.getTime());
}
