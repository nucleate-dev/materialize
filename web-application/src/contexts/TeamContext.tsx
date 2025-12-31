"use client";

import { usePersonalTeam } from "@/hooks/usePersonalTeam";
import { useCurrentUserMembership } from "@/hooks/useCurrentUserMembership";
import {
  useTeamMembers,
  type TeamMemberWithUser,
} from "@/hooks/useTeamMembers";
import { useTeamInvites } from "@/hooks/useTeamInvites";
import { useUserTeams } from "@/hooks/useUserTeams";
import { Database } from "@/lib/types/supabase";
import { supabase } from "@/ClientConstants";
import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";

const LAST_ACTIVE_TEAM_KEY = "lastActiveTeamId";

type Team = Database["public"]["Tables"]["teams"]["Row"];
type TeamMembership = Database["public"]["Tables"]["team_memberships"]["Row"];
type TeamInvite = Database["public"]["Tables"]["team_invites"]["Row"];

interface TeamContextValue {
  activeTeam: Team | null;
  setActiveTeam: (team: Team | null) => void;
  signedAvatarUrl: string | null;
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
  const { teams: userTeams, isLoading: userTeamsLoading } = useUserTeams();
  const [activeTeam, setActiveTeam] = useState<Team | null>(null);
  const [signedAvatarUrl, setSignedAvatarUrl] = useState<string | null>(null);

  // Fetch team-related data based on active team
  const { membership: currentUserMembership, isLoading: isLoadingMembership } =
    useCurrentUserMembership(activeTeam?.id);
  const { members: teamMembers, isLoading: isLoadingMembers } = useTeamMembers(
    activeTeam?.id,
  );
  const { invites: teamInvites, isLoading: isLoadingInvites } = useTeamInvites(
    activeTeam?.id,
  );

  // Initialize with last active team from localStorage, or fall back to personal team
  useEffect(() => {
    if (!activeTeam && !userTeamsLoading && !personalTeamLoading && personalTeam) {
      const lastActiveTeamId = localStorage.getItem(LAST_ACTIVE_TEAM_KEY);

      if (lastActiveTeamId) {
        // Check if the stored team ID is in the user's teams
        const lastActiveTeam = userTeams.find(
          (team) => team.id === lastActiveTeamId
        );

        if (lastActiveTeam) {
          setActiveTeam(lastActiveTeam);
          return;
        }
      }

      // Fall back to personal team
      setActiveTeam(personalTeam);
    }
  }, [activeTeam, userTeamsLoading, personalTeamLoading, personalTeam, userTeams]);

  // Save active team to localStorage when it changes
  useEffect(() => {
    if (activeTeam?.id) {
      localStorage.setItem(LAST_ACTIVE_TEAM_KEY, activeTeam.id);
    }
  }, [activeTeam?.id]);

  // Generate signed URL for team avatar when active team changes
  useEffect(() => {
    const generateSignedUrl = async () => {
      if (!activeTeam?.id || !activeTeam?.avatar_url) {
        setSignedAvatarUrl(null);
        return;
      }

      try {
        const { data, error } = await supabase.storage
          .from("team-avatars")
          .createSignedUrl(activeTeam.id, 60 * 60); // 1 hour expiry

        if (error) {
          setSignedAvatarUrl(null);
          return;
        }

        setSignedAvatarUrl(data.signedUrl);
      } catch (err) {
        setSignedAvatarUrl(null);
      }
    };

    generateSignedUrl();
  }, [activeTeam?.id, activeTeam?.avatar_url]);

  return (
    <TeamContext.Provider
      value={{
        activeTeam,
        setActiveTeam,
        signedAvatarUrl,
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
