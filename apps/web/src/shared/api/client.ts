import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { SimpleCsrfProtectionLinkPlugin } from "@orpc/client/plugins";
import type { ContractRouterClient } from "@orpc/contract";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import type { Contract } from "@snaptrack/contracts";

/**
 * Longest an API call may take before it fails. Without a limit, a call to a server that
 * can't be reached (e.g. the Mac is up but Tailscale isn't yet) can hang for minutes and
 * the screen stays blank. Uploads (Stage 2) will need their own, longer limit.
 */
export const REQUEST_TIMEOUT_MS = 15_000;

/** The request's own signal (cancelled when the screen no longer needs it) plus the time limit. */
function withTimeout(signal: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  // AbortSignal.any needs iOS 17.4+; older phones get the time limit alone, which is what matters here.
  return typeof AbortSignal.any === "function" ? AbortSignal.any([signal, timeout]) : timeout;
}

const link = new RPCLink({
  url: `${window.location.origin}/rpc`,
  // Sends the header the server's CSRF check requires on every call.
  plugins: [new SimpleCsrfProtectionLinkPlugin()],
  fetch: (request, init) => globalThis.fetch(request, { ...init, signal: withTimeout(request.signal) }),
});

/** Typed API client generated from the shared contract (SPEC.md §4.2). */
export const client: ContractRouterClient<Contract> = createORPCClient(link);

/** TanStack Query helpers for every procedure, used by hooks only. */
export const api = createTanstackQueryUtils(client);
