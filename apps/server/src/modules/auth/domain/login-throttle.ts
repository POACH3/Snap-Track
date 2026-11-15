/** Failed attempts allowed for one username before each further failure costs a wait. */
export const MAX_FAILED_ATTEMPTS = 5;
/** How long a username is locked after its latest failure, once it has MAX_FAILED_ATTEMPTS. */
export const LOCKOUT_MS = 15 * 60 * 1000;

/** A username's failures are forgotten after this long without a new one. */
export const QUIET_PERIOD_MS = 24 * 60 * 60 * 1000;

export type ThrottleDecision = { allowed: true } | { allowed: false; retryAfterMs: number };

/**
 * Whether a login attempt may go ahead, given this username's failures since its last
 * successful login. The first MAX_FAILED_ATTEMPTS are free; from then on the username is
 * locked for LOCKOUT_MS after its latest failure, so every further wrong password costs
 * another full wait. Attempts refused while locked are not failures and don't extend it.
 * Callers forget the failures first once `quietPeriodOver` (24 hours without one).
 */
export function decideLoginAttempt(failures: readonly Date[], now: Date): ThrottleDecision {
  if (failures.length < MAX_FAILED_ATTEMPTS) return { allowed: true };
  const latest = Math.max(...failures.map((f) => f.getTime()));
  const retryAfterMs = latest + LOCKOUT_MS - now.getTime();
  return retryAfterMs > 0 ? { allowed: false, retryAfterMs } : { allowed: true };
}

/** True once a username has gone QUIET_PERIOD_MS without a failure, so its count starts again. */
export function quietPeriodOver(failures: readonly Date[], now: Date): boolean {
  if (failures.length === 0) return false;
  const latest = Math.max(...failures.map((f) => f.getTime()));
  return now.getTime() - latest >= QUIET_PERIOD_MS;
}
