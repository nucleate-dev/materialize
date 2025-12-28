"use client";

import { usePersonalTeam } from "@/hooks/usePersonalTeam";
import { Database } from "@/lib/types/supabase";
import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";

type Team = Database["public"]["Tables"]["teams"]["Row"];

interface TeamContextValue {
  activeTeam: Team | null;
  setActiveTeam: (team: Team | null) => void;
  isLoading: boolean;
}

const TeamContext = createContext<TeamContextValue | undefined>(undefined);

export function TeamProvider({ children }: { children: ReactNode }) {
  const { team: personalTeam, isLoading: personalTeamLoading } =
    usePersonalTeam();
  const [activeTeam, setActiveTeam] = useState<Team | null>(null);

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
