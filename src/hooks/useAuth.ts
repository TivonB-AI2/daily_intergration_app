import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
} from "@tanstack/react-query";
import { trpc } from "@/integrations/trpc/react";
import type { SignInPayload, SignInResponse } from "@/services/auth/types";
import type { ApiResponse } from "@/services/common";

export function useSignIn(
  options?: UseMutationOptions<
    ApiResponse<SignInResponse>,
    Error,
    SignInPayload
  >,
) {
  const t = trpc.useTRPC();
  const queryClient = useQueryClient();
  // @ts-expect-error — merging tRPC mutation options with consumer options is not expressible in one generic
  return useMutation({
    ...t.auth.signIn.mutationOptions(),
    ...options,
    // Refresh the cached current user (t.auth.me) after a successful sign-in,
    // then run any consumer-supplied onSuccess. Defined after `...options` so a
    // consumer's own onSuccess can't silently drop the invalidation.
    onSuccess: (...args) => {
      void queryClient.invalidateQueries({
        queryKey: t.auth.me.queryOptions().queryKey,
      });
      options?.onSuccess?.(...args);
    },
  });
}

export function useSignOut() {
  const t = trpc.useTRPC();
  const queryClient = useQueryClient();
  return useMutation({
    ...t.auth.signOut.mutationOptions(),
    // Drop the cached current user so useGetUser() doesn't stay stale post-logout.
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: t.auth.me.queryOptions().queryKey,
      });
    },
  });
}

export function useGetUser(options?: { enabled?: boolean }) {
  const t = trpc.useTRPC();
  return useQuery({ ...t.auth.me.queryOptions(), enabled: options?.enabled });
}
