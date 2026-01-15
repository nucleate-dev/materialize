import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';

const LAST_ACTIVE_TEAM_KEY = '@nucleate/last_active_team_id';

export interface Team {
  id: string;
  name: string;
  created_at: string | null;
  created_by: string | null;
  personal_owner_user_id: string | null;
  slug: string | null;
  avatar_url?: string | null;
}

interface TeamState {
  teams: Team[];
  activeTeam: Team | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  fetchTeams: (userId: string) => Promise<void>;
  setActiveTeam: (team: Team) => void;
  initialize: (userId: string) => Promise<void>;
}

export const useTeamStore = create<TeamState>((set, get) => ({
  teams: [],
  activeTeam: null,
  isLoading: true,
  error: null,

  fetchTeams: async (userId: string) => {
    set({ isLoading: true, error: null });

    try {
      // Fetch all teams where the user is a member
      const { data, error } = await supabase
        .from('team_memberships')
        .select(
          `
          role,
          team:teams (
            id,
            name,
            created_at,
            created_by,
            personal_owner_user_id,
            slug
          )
        `,
        )
        .eq('user_id', userId);

      if (error) {
        set({ error: error.message, isLoading: false });
        return;
      }

      // Extract teams from the result
      // Supabase returns the joined table - need to handle type inference
      const teams = (data || [])
        .map((membership) => {
          const team = membership.team;
          // Handle both single object and array cases from Supabase
          if (Array.isArray(team)) {
            return team[0] as Team | undefined;
          }
          return team as Team | null;
        })
        .filter((team): team is Team => team != null);

      set({ teams, isLoading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to fetch teams',
        isLoading: false,
      });
    }
  },

  setActiveTeam: (team: Team) => {
    set({ activeTeam: team });
    // Persist to storage
    AsyncStorage.setItem(LAST_ACTIVE_TEAM_KEY, team.id);
  },

  initialize: async (userId: string) => {
    // Fetch teams first
    await get().fetchTeams(userId);

    const { teams } = get();

    // Try to restore last active team
    const lastActiveTeamId = await AsyncStorage.getItem(LAST_ACTIVE_TEAM_KEY);

    if (lastActiveTeamId) {
      const lastActiveTeam = teams.find((t) => t.id === lastActiveTeamId);
      if (lastActiveTeam) {
        set({ activeTeam: lastActiveTeam });
        return;
      }
    }

    // Fall back to personal team (one with personal_owner_user_id matching userId)
    const personalTeam = teams.find((t) => t.personal_owner_user_id === userId);
    if (personalTeam) {
      set({ activeTeam: personalTeam });
      return;
    }

    // Fall back to first team
    if (teams.length > 0) {
      set({ activeTeam: teams[0] });
    }
  },
}));

// Selector hooks
export const useActiveTeam = () => useTeamStore((state) => state.activeTeam);
export const useTeams = () => useTeamStore((state) => state.teams);
export const useTeamsLoading = () => useTeamStore((state) => state.isLoading);
