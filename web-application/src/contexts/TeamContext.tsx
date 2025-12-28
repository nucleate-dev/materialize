"use client";

import { usePersonalTeam } from "@/hooks/usePersonalTeam";
import { useCurrentUserMembership } from "@/hooks/useCurrentUserMembership";
import { useTeamMembers, type TeamMemberWithUser } from "@/hooks/useTeamMembers";
import { useTeamInvites } from "@/hooks/useTeamInvites";
import { Database } from "@/lib/types/supabase";
import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";

type Team = Database["public"]["Tables"]["teams"]["Row"];
type TeamMembership = Database["public"]["Tables"]["team_memberships"]["Row"];
type TeamInvite = Database["public"]["Tables"]["team_invites"]["Row"];

interface TeamContextValue {
  activeTeam: Team | null;
  setActiveTeam: (team: Team | null) => void;
  isLoading: boolean;
  currentUserMembership: TeamMembership | null;
  teamMembers: TeamMemberWithUser[];
  teamInvites: TeamInvite[];
  isLoadingMembership: boolean;
  isLoadingMembers: boolean;
  isLoadingInvites: boolean;
}

const TeamContext = createContext<TeamContextValue | undefined>(undefined);

export function TeamProvider({ children }: { children: ReactNode }) {
  const { team: personalTeam, isLoading: personalTeamLoading } =
    usePersonalTeam();
  const [activeTeam, setActiveTeam] = useState<Team | null>(null);

  // Fetch team-related data based on active team
  const { membership: currentUserMembership, isLoading: isLoadingMembership } =
    useCurrentUserMembership(activeTeam?.id);
  const { members: teamMembers, isLoading: isLoadingMembers } = useTeamMembers(
    activeTeam?.id,
  );
  const { invites: teamInvites, isLoading: isLoadingInvites } = useTeamInvites(
    activeTeam?.id,
  );

  // Initialize with personal team when it loads
  useEffect(() => {
    if (personalTeam && !activeTeam) {
      setActiveTeam(personalTeam);
    }
  }, [personalTeam, activeTeam]);

  return (
    <TeamContext.Provider
      value={{
        activeTeam,
        setActiveTeam,
        isLoading: personalTeamLoading,
        currentUserMembership,
        teamMembers,
        teamInvites,
        isLoadingMembership,
        isLoadingMembers,
        isLoadingInvites,
      }}
    >
      {children}
    </TeamContext.Provider>
  );
}

export function useActiveTeam() {
  const context = useContext(TeamContext);
  if (context === undefined) {
    throw new Error("useActiveTeam must be used within a TeamProvider");
  }
  return context;
}
