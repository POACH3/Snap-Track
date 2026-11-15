import type { Clock } from "@snaptrack/core";
import { os, signedInUser } from "../../../platform/http/rpc.ts";
import type { AuthService } from "../application/auth-service.ts";
import type { SessionCookie } from "./session-cookie.ts";

export function createAuthRouter(service: AuthService, cookie: SessionCookie, clock: Clock) {
  return {
    login: os.auth.login.handler(async ({ input, context, errors }) => {
      const result = await service.login(input);
      if (!result.ok) {
        if (result.error.kind === "invalid-credentials") throw errors.INVALID_CREDENTIALS();
        const retryAfterSeconds = Math.max(1, Math.ceil(result.error.retryAfterMs / 1000));
        throw errors.TOO_MANY_ATTEMPTS({ data: { retryAfterSeconds } });
      }
      const { user, token, expiresAt } = result.value;
      context.resHeaders?.append("set-cookie", cookie.set(token, expiresAt, clock.now()));
      return { user };
    }),

    logout: os.auth.logout.handler(({ context }) => {
      service.logout(cookie.read(context.cookieHeader));
      context.resHeaders?.append("set-cookie", cookie.clear());
      return { ok: true as const };
    }),

    me: os.auth.me.handler(({ context }) => ({ user: signedInUser(context) })),
  };
}
