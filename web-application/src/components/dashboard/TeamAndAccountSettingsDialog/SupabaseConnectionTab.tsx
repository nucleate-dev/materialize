"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Database, Link2Off, Loader2, PlugZap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useActiveTeam } from "@/contexts/TeamContext";
import { supabase } from "@/ClientConstants";
import { useProductLogger } from "@/lib/loggers/ClientProductLogger";
import type {
  APIResponse,
  StandardErrorResponse,
  SupabaseOAuthAuthorizeUrlRequestBody,
  SupabaseOAuthAuthorizeUrlSuccessResponse,
  SupabaseOAuthConnectionSuccessResponse,
  SupabaseOAuthDisconnectRequestBody,
  SupabaseOAuthDisconnectSuccessResponse,
} from "@/lib/types/serverAPITypes";
import { SectionCard, SectionHeader } from "./SettingsHelpers";

interface SupabaseConnectionState {
  connected: boolean;
  organization?: {
    id?: string | null;
    slug?: string | null;
    name?: string | null;
  };
  connectedAt?: string;
  connectedByUserId?: string;
  expiresAt?: string;
}

export function SupabaseConnectionTab() {
  const { activeTeam } = useActiveTeam();
  const logger = useProductLogger();

  const [isLoading, setIsLoading] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [connection, setConnection] = useState<SupabaseConnectionState>({
    connected: false,
  });

  const teamId = activeTeam?.id ?? null;

  const organizationLabel = useMemo(() => {
    if (!connection.organization) {
      return "Supabase organization";
    }

    return (
      connection.organization.name ||
      connection.organization.slug ||
      connection.organization.id ||
      "Supabase organization"
    );
  }, [connection.organization]);

  const fetchConnection = useCallback(async () => {
    if (!teamId) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;

      if (!token) {
        toast.error("Sign in again to load Supabase connections.");
        setIsLoading(false);
        return;
      }

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SERVER_ENDPOINT}/supabase-oauth/connection?teamId=${teamId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      const result: APIResponse<
        SupabaseOAuthConnectionSuccessResponse,
        StandardErrorResponse
      > = await response.json();

      if (!response.ok || result.error) {
        logger.debug("error", "Failed to fetch Supabase connection", {
          status: response.status,
          error: result.error,
        });
        toast.error("Unable to load Supabase connection status.");
        setConnection({ connected: false });
        return;
      }

      setConnection(result.data);
    } catch (error) {
      logger.debug("error", "Error fetching Supabase connection", {
        error: error instanceof Error ? error.message : String(error),
      });
      toast.error("Unable to load Supabase connection status.");
      setConnection({ connected: false });
    } finally {
      setIsLoading(false);
    }
  }, [teamId, logger]);

  useEffect(() => {
    void fetchConnection();
  }, [fetchConnection]);

  const handleConnect = async () => {
    if (!teamId) {
      toast.error("No active team selected.");
      return;
    }

    setIsConnecting(true);

    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;

      if (!token) {
        toast.error("Sign in again to connect Supabase.");
        return;
      }

      const payload: SupabaseOAuthAuthorizeUrlRequestBody = { teamId };

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SERVER_ENDPOINT}/supabase-oauth/authorize-url`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        },
      );

      const result: APIResponse<
        SupabaseOAuthAuthorizeUrlSuccessResponse,
        StandardErrorResponse
      > = await response.json();

      if (!response.ok || result.error) {
        logger.debug("error", "Failed to start Supabase OAuth", {
          status: response.status,
          error: result.error,
        });
        toast.error("Unable to start Supabase connection.");
        return;
      }

      sessionStorage.setItem("supabase_oauth_team_id", teamId);
      window.location.assign(result.data.authorizeUrl);
    } catch (error) {
      logger.debug("error", "Error starting Supabase OAuth", {
        error: error instanceof Error ? error.message : String(error),
      });
      toast.error("Unable to start Supabase connection.");
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!teamId) {
      toast.error("No active team selected.");
      return;
    }

    setIsDisconnecting(true);

    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;

      if (!token) {
        toast.error("Sign in again to disconnect Supabase.");
        return;
      }

      const payload: SupabaseOAuthDisconnectRequestBody = { teamId };

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SERVER_ENDPOINT}/supabase-oauth/disconnect`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        },
      );

      const result: APIResponse<
        SupabaseOAuthDisconnectSuccessResponse,
        StandardErrorResponse
      > = await response.json();

      if (!response.ok || result.error) {
        logger.debug("error", "Failed to disconnect Supabase", {
          status: response.status,
          error: result.error,
        });
        toast.error("Unable to disconnect Supabase.");
        return;
      }

      toast.success("Supabase disconnected for this team.");
      setConnection({ connected: false });
    } catch (error) {
      logger.debug("error", "Error disconnecting Supabase", {
        error: error instanceof Error ? error.message : String(error),
      });
      toast.error("Unable to disconnect Supabase.");
    } finally {
      setIsDisconnecting(false);
    }
  };

  return (
    <div className="relative min-h-screen text-gray-900 dark:text-white font-sans">
      <div className="container mx-auto px-6 py-12 max-w-5xl">
        <div className="mb-12">
          <h1 className="text-3xl font-medium tracking-tight text-gray-900 dark:text-white mb-2">
            Supabase
          </h1>
          <p className="text-gray-600 dark:text-[#8A8F98] text-lg">
            Connect a Supabase organization for your team. Connections are shared
            across all team members with edit access.
          </p>
        </div>

        <SectionCard>
          <SectionHeader
            title="Supabase organization"
            description="Manage the team-level Supabase connection used for new projects."
            icon={Database}
          />
          <div className="p-6 space-y-6">
            {isLoading ? (
              <div className="flex items-center gap-3 text-sm text-gray-600 dark:text-[#8A8F98]">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Loading Supabase connection status...</span>
              </div>
            ) : connection.connected ? (
              <div className="space-y-4">
                <div className="flex items-start gap-3 p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                  <PlugZap className="w-5 h-5 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
                  <div className="space-y-1">
                    <p className="font-medium text-emerald-700 dark:text-emerald-300">
                      Connected to {organizationLabel}
                    </p>
                    <p className="text-sm text-emerald-700/80 dark:text-emerald-200">
                      This connection applies to the {activeTeam?.name ?? "team"} team.
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={handleDisconnect}
                  disabled={isDisconnecting}
                >
                  {isDisconnecting ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <Link2Off className="w-4 h-4 mr-2" />
                  )}
                  Disconnect Supabase
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-start gap-3 p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
                  <Database className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
                  <div className="space-y-1">
                    <p className="font-medium text-blue-700 dark:text-blue-300">
                      No Supabase organization connected
                    </p>
                    <p className="text-sm text-blue-600 dark:text-blue-200">
                      Connect Supabase to provision projects in your team&apos;s
                      organization.
                    </p>
                  </div>
                </div>
                <Button
                  onClick={handleConnect}
                  className="w-full bg-black dark:bg-white text-white dark:text-black hover:bg-black/90 dark:hover:bg-white/90"
                  disabled={isConnecting}
                >
                  {isConnecting ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <PlugZap className="w-4 h-4 mr-2" />
                  )}
                  Connect Supabase
                </Button>
              </div>
            )}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
