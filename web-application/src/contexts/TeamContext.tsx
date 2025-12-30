"use client";

import { usePersonalTeam } from "@/hooks/usePersonalTeam";
import { useCurrentUserMembership } from "@/hooks/useCurrentUserMembership";
import {
  useTeamMembers,
  type TeamMemberWithUser,
} from "@/hooks/useTeamMembers";
import { useTeamInvites } from "@/hooks/useTeamInvites";
import { Database } from "@/lib/types/supabase";
import { supabase } from "@/ClientConstants";
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

  // Initialize with personal team when it loads
  useEffect(() => {
    if (personalTeam && !activeTeam) {
      setActiveTeam(personalTeam);
    }
  }, [personalTeam, activeTeam]);

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
          console.error("Error generating signed URL:", error);
          setSignedAvatarUrl(null);
          return;
        }

        setSignedAvatarUrl(data.signedUrl);
      } catch (err) {
        console.error("Failed to generate signed URL:", err);
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
