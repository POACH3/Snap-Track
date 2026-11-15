import { useQuery } from "@tanstack/react-query";
import { api } from "../shared/api/client.ts";

export function useServerStatus() {
  return useQuery(api.health.ping.queryOptions());
}
