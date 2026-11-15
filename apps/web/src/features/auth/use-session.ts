import { ORPCError } from "@orpc/client";
import type { PublicUser } from "@snaptrack/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, client } from "../../shared/api/client.ts";

/** Cache key for the session; its data is the signed-in user, or null. */
const sessionKey = ["session"] as const;

/** The signed-in user, or null when signed out. */
export function useSession() {
  return useQuery({
    queryKey: sessionKey,
    queryFn: async (): Promise<PublicUser | null> => {
      try {
        return (await client.auth.me()).user;
      } catch (error) {
        if (error instanceof ORPCError && error.status === 401) return null;
        throw error;
      }
    },
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation(
    api.auth.login.mutationOptions({
      onSuccess: ({ user }) => {
        queryClient.setQueryData<PublicUser | null>(sessionKey, user);
      },
    }),
  );
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation(
    api.auth.logout.mutationOptions({
      // Signed out either way: drop every cached answer so the next person sees none of it.
      onSettled: () => {
        queryClient.clear();
        queryClient.setQueryData<PublicUser | null>(sessionKey, null);
      },
    }),
  );
}
