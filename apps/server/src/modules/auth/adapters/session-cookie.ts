/**
 * The session cookie's name and attributes, defined once. Over HTTPS the `__Host-` prefix makes
 * the browser refuse the cookie unless it is Secure, for this exact host, with Path=/.
 */
export interface SessionCookie {
  read(cookieHeader: string | undefined): string | undefined;
  set(token: string, expiresAt: Date, now: Date): string;
  clear(): string;
}

export function createSessionCookie(options: { secure: boolean }): SessionCookie {
  const name = options.secure ? "__Host-snaptrack_session" : "snaptrack_session";
  const attributes = `Path=/; HttpOnly; SameSite=Lax${options.secure ? "; Secure" : ""}`;

  return {
    read(cookieHeader) {
      for (const part of (cookieHeader ?? "").split(";")) {
        const [key, ...value] = part.trim().split("=");
        if (key === name) return value.join("=");
      }
      return undefined;
    },
    set(token, expiresAt, now) {
      const maxAge = Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000));
      return `${name}=${token}; Max-Age=${maxAge}; ${attributes}`;
    },
    clear() {
      return `${name}=; Max-Age=0; ${attributes}`;
    },
  };
}
