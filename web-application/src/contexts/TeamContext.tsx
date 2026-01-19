"use client";

import { usePersonalTeam } from "@/hooks/usePersonalTeam";
import { useCurrentUserMembership } from "@/hooks/useCurrentUserMembership";
import {
  useTeamMembers,
  type TeamMemberWithUser,
} from "@/hooks/useTeamMembers";
import { useTeamInvites } from "@/hooks/useTeamInvites";
import { useUserTeams } from "@/hooks/useUserTeams";
import { useCustomUserRow } from "@/hooks/useCustomUserRow";
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
  isCurrentUserSsoUser: boolean;
  isActiveTeamSsoEnabled: boolean;
}

const TeamContext = createContext<TeamContextValue | undefined>(undefined);

export function TeamProvider({ children }: { children: ReactNode }) {
  const { team: personalTeam, isLoading: personalTeamLoading } =
    usePersonalTeam();
  const { teams: userTeams, isLoading: userTeamsLoading } = useUserTeams();
  const { userRow, isLoading: userRowLoading } = useCustomUserRow();
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

  // Initialize with last active team from localStorage, or fall back appropriately
  useEffect(() => {
    if (
      activeTeam ||
      userTeamsLoading ||
      personalTeamLoading ||
      userRowLoading
    ) {
      return;
    }

    const isSsoUser = userRow?.is_sso_user ?? false;

    // Try to restore last active team from localStorage
    const lastActiveTeamId = localStorage.getItem(LAST_ACTIVE_TEAM_KEY);
    if (lastActiveTeamId) {
      const lastActiveTeam = userTeams.find(
        (team) => team.id === lastActiveTeamId,
      );
      if (lastActiveTeam) {
        setActiveTeam(lastActiveTeam);
        return;
      }
    }

    // Fall back based on user type
    if (isSsoUser) {
      // SSO users don't have personal teams, default to their first team (SSO team)
      const ssoTeam = userTeams.find((team) => team.sso_provider_id !== null);
      if (ssoTeam) {
        setActiveTeam(ssoTeam);
      } else if (userTeams.length > 0) {
        // Fallback to any team if no SSO team found
        setActiveTeam(userTeams[0]);
      }
    } else {
      // Non-SSO users should have a personal team
      if (personalTeam) {
        setActiveTeam(personalTeam);
      }
    }
  }, [
    activeTeam,
    userTeamsLoading,
    personalTeamLoading,
    userRowLoading,
    personalTeam,
    userTeams,
    userRow,
  ]);

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
      } catch {
        setSignedAvatarUrl(null);
      }
    };

    generateSignedUrl();
  }, [activeTeam?.id, activeTeam?.avatar_url]);

  // Compute SSO-related values
  const isCurrentUserSsoUser = userRow?.is_sso_user ?? false;
  const isActiveTeamSsoEnabled = activeTeam?.sso_provider_id !== null;

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
        isCurrentUserSsoUser,
        isActiveTeamSsoEnabled,
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
