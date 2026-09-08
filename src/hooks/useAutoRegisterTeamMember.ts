import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useCapabilities } from "@/hooks/useCapabilities";
import {
  createTeamMember,
  listTeamMembers,
} from "@/services/db/teamMemberService";

/**
 * Registers the current signed-in user in the Team Members directory the
 * first time they're seen — regardless of which page they open. Mounted once
 * at the app-layout level (not the Roles & Permissions page itself) so a
 * user who never visits that page still ends up listed, since that page has
 * no other way to auto-discover who has access to the app.
 *
 * No-ops entirely on public apps (no signed-in user to register) or when the
 * database isn't configured.
 */
export function useAutoRegisterTeamMember(params: {
  authEnabled: boolean;
  userName?: string;
  userEmail?: string;
}) {
  const { authEnabled, userName, userEmail } = params;
  const queryClient = useQueryClient();
  const { data: caps } = useCapabilities();
  const dbEnabled = caps?.databaseEnabled === true;
  const ready = dbEnabled && authEnabled && !!userEmail;

  const { data: members } = useQuery({
    queryKey: ["teamMembers"],
    queryFn: () => listTeamMembers(),
    enabled: ready,
    staleTime: 15_000,
  });

  const registerMutation = useMutation({
    mutationFn: createTeamMember,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teamMembers"] });
    },
  });

  const attempted = useRef(false);

  useEffect(() => {
    if (!ready || members === undefined || attempted.current) return;
    const alreadyListed = members.some(
      (m) => m.email.trim().toLowerCase() === userEmail!.trim().toLowerCase(),
    );
    if (alreadyListed) return;
    attempted.current = true;
    registerMutation.mutate({
      data: { name: userName || userEmail!, email: userEmail! },
    });
  }, [ready, members, userEmail, userName, registerMutation]);
}
