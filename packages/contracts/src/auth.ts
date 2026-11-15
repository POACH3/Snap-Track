import { z } from "zod";
import { procedure, publicProcedure } from "./procedure.ts";

export const PublicUser = z.object({
  id: z.uuid(),
  username: z.string(),
  displayName: z.string(),
});
export type PublicUser = z.infer<typeof PublicUser>;

export const LoginInput = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(1024),
});
export type LoginInput = z.infer<typeof LoginInput>;

export const authContract = {
  login: publicProcedure
    .route({ method: "POST" })
    .input(LoginInput)
    .output(z.object({ user: PublicUser }))
    .errors({
      INVALID_CREDENTIALS: { status: 401, message: "Username or password is wrong." },
      TOO_MANY_ATTEMPTS: {
        status: 429,
        message: "Too many failed attempts.",
        data: z.object({ retryAfterSeconds: z.number().int().positive() }),
      },
    }),
  logout: publicProcedure.route({ method: "POST" }).output(z.object({ ok: z.literal(true) })),
  me: procedure.route({ method: "GET" }).output(z.object({ user: PublicUser })),
};
