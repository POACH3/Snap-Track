const DAY_MS = 24 * 60 * 60 * 1000;

/** A session lasts this long after it was last renewed (docs/feature-plans/accounts-plan.md). */
export const SESSION_LIFETIME_MS = 90 * DAY_MS;
/** Renew at most this often, so ordinary use doesn't write to the database on every request. */
const RENEW_AFTER_MS = DAY_MS;

export function sessionExpiry(now: Date): Date {
  return new Date(now.getTime() + SESSION_LIFETIME_MS);
}

export function isExpired(expiresAt: Date, now: Date): boolean {
  return expiresAt.getTime() <= now.getTime();
}

/** The new expiry if the session should be renewed now, or null to leave it. */
export function renewedExpiry(expiresAt: Date, now: Date): Date | null {
  const renewedAt = expiresAt.getTime() - SESSION_LIFETIME_MS;
  return now.getTime() - renewedAt >= RENEW_AFTER_MS ? sessionExpiry(now) : null;
}
