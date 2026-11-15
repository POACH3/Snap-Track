# Stage 1: accounts and login

**Changes SPEC.md:** §9 Security and Privacy (session lifetime, login throttling, CSRF).  
**Status:** active (built on `main`, uncommitted; logging in from each phone waits for hosting).

Builds `SPEC.md` §11 Stage 1: the `auth` module (users, sessions, login and
logout, route protection) and a command to create users.

## Decisions

- **No new packages.** Passwords use Node's built-in `crypto.argon2` (Argon2id,
  OWASP's minimum: 19 MiB memory, 2 passes, 1 lane), stored as a standard PHC
  string (`$argon2id$v=19$m=19456,t=2,p=1$<salt>$<hash>`). Cookies and CSRF
  use helpers and plugins already in oRPC.
- **Sessions** are rows in `sessions`. The cookie holds a random 256-bit token;
  the database stores only its HMAC (keyed with `SESSION_SECRET`), so a copy of
  the database can't be used to log in.
- **Lifetime: 90 days, sliding** (decided 2026-11-15). Each use pushes the expiry out
  again, at most once a day, so a phone in regular use stays logged in. A
  phone unused for 90 days must log in again.
- **Cookie:** `HttpOnly`, `SameSite=Lax`, `Path=/`, a `Max-Age` matching the
  session (so an installed PWA keeps it after being closed). Over HTTPS it is
  also `Secure` and named `__Host-snaptrack_session` (the browser then refuses
  it from anywhere but this exact origin); on `http://localhost` in development
  it is `snaptrack_session`.
- **CSRF:** `SameSite=Lax` plus oRPC's simple CSRF check (every API call must
  carry a header a cross-site form can't send).
- **Protected by default.** Every procedure requires a signed-in user unless
  its contract entry is marked public. Public: `health.ping`, `auth.login`,
  `auth.logout`. A test walks the whole contract and fails if any non-public
  procedure answers without a session.
- **Login throttling** (decided 2026-11-15): the first 5 failed attempts for a
  username are free. After that the username is locked for 15 minutes from its
  latest failure, so every further wrong password costs another full 15
  minutes. Attempts refused while locked don't count and don't extend it. A
  successful login resets the count, and so do 24 hours without a failure.
  Kept in memory (a restart clears it). Unknown usernames get the same
  answer and take the same time as wrong passwords, so usernames can't be
  probed.
- **Usernames:** 2–32 characters, `a–z 0–9 . _ -`, stored lowercase, so
  "Sam" and "sam" are the same person. **Passwords:** at least 10 characters,
  no other rules (NIST 800-63B).
- **Users are created from the command line**, not the app (no sign-up, §9):
  `pnpm user:create` and `pnpm user:set-password` (prompts; password hidden).
  Setting a password signs that user out everywhere. Both change the database,
  so they are "ask first" commands.

## Build

1. **Contracts:** `auth.login`, `auth.logout`, `auth.me`; `PublicUser`; typed
   errors `INVALID_CREDENTIALS` (401), `TOO_MANY_ATTEMPTS` (429, with seconds
   to wait), `UNAUTHORIZED` (401). A `public` flag in procedure metadata.
2. **Core:** a `Clock` port, with a fake in `@snaptrack/core/testing`.
3. **`auth` module** (`apps/server/src/modules/auth/`):
   - `domain/`: username rules, password rule, session expiry and renewal,
     throttle decision. All pure.
   - `ports.ts`: `UserRepository`, `SessionRepository`, `PasswordHasher`,
     `SessionTokens`, `LoginAttempts`.
   - `application/`: `login`, `authenticate`, `logout`, `createUser`,
     `setPassword`.
   - `adapters/`: SQLite repositories and schema (`users`, `sessions`, with
     sessions deleted along with their user), Argon2 hasher, HMAC tokens,
     in-memory login attempts, cookie format, oRPC procedures.
   - `testing/`: fast fake `PasswordHasher` and its contract test (run against
     both the fake and the real one).
4. **Platform:** the HTTP server takes an `authenticate` function from the
   composition root, resolves the user from the cookie before each API call,
   and renews the cookie when the session was extended. The oRPC base adds the
   protected-by-default middleware and the CSRF plugin.
5. **CLI:** `apps/server/src/cli/users.ts` (second entry point, wired like
   `main.ts`).
6. **Web:** `features/auth/` (login screen, session hook, login and logout
   mutations); first shared components `shared/ui/Button` and
   `shared/ui/TextField` per DESIGN.md; the app shows the login screen until
   signed in, then a placeholder home with the person's name and **Log out**.

## Verification

| Stage 1 "Done when" / behavior | Check | Kind |
|---|---|---|
| Requests without a session are rejected | HTTP test: every non-public procedure in the contract returns 401 without a cookie, and with an expired or unknown one | automated |
| Login works; wrong password and unknown user look the same | Use-case tests (real SQLite, fake hasher, fake clock); HTTP test of the error code | automated |
| Cookie attributes | HTTP test: `HttpOnly`, `SameSite=Lax`, `Path=/`, `Max-Age`; `Secure` and `__Host-` name when `PUBLIC_ORIGIN` is HTTPS | automated |
| Sessions expire, renew, end on logout and on password change | Use-case tests with the fake clock | automated |
| Throttling | Domain tests of the rule; use-case tests: 6th attempt refused, allowed 15 minutes after the latest failure, each later failure locks again, refused attempts don't extend the lock, count resets after 24 quiet hours | automated |
| CSRF | HTTP test: a call without the CSRF header is refused | automated |
| Usernames unique regardless of case | Repository test on in-memory SQLite | automated |
| Argon2 hashes verify; fake matches real | `PasswordHasher` contract test against both | automated |
| `pnpm user:create` makes a user who can log in | Manual, against a scratch database | manual |
| Each household member can log in from their own phone | Needs hosting (Stage 0 steps 9–11) or a temporary `tailscale serve` to the dev server; done then | manual, deferred |

`pnpm check` and `pnpm build` must pass.

## Out of scope

- Logging out clearing the offline queue (Stage 5, with the queue).
- Changing your own password in the app, user management screens.
