import { ORPCError, implement } from "@orpc/server";
import type { ResponseHeadersPluginContext } from "@orpc/server/plugins";
import { contract, type PublicUser } from "@snaptrack/contracts";

/** What every procedure receives. The HTTP server fills it in before the procedure runs. */
export interface RpcContext extends ResponseHeadersPluginContext {
  /** The signed-in user, or null. Never taken from the request body (SPEC.md §5, receipts). */
  user: PublicUser | null;
  cookieHeader: string | undefined;
}

/**
 * The contract's server side. Every procedure requires a signed-in user unless its contract
 * entry is marked public, so a new procedure is protected even if its author forgets.
 */
export const os = implement(contract)
  .$context<RpcContext>()
  .use(({ context, next, procedure }) => {
    if (procedure["~orpc"].meta.public !== true && context.user === null) {
      throw new ORPCError("UNAUTHORIZED");
    }
    return next();
  });

/** The signed-in user inside a protected procedure. */
export function signedInUser(context: RpcContext): PublicUser {
  // The middleware above already refused the request if there is none.
  if (context.user === null) throw new ORPCError("UNAUTHORIZED");
  return context.user;
}
