import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { SimpleCsrfProtectionLinkPlugin } from "@orpc/client/plugins";
import type { ContractRouterClient } from "@orpc/contract";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import type { Contract } from "@snaptrack/contracts";

const link = new RPCLink({
  url: `${window.location.origin}/rpc`,
  // Sends the header the server's CSRF check requires on every call.
  plugins: [new SimpleCsrfProtectionLinkPlugin()],
});

/** Typed API client generated from the shared contract (SPEC.md §4.2). */
export const client: ContractRouterClient<Contract> = createORPCClient(link);

/** TanStack Query helpers for every procedure, used by hooks only. */
export const api = createTanstackQueryUtils(client);
