"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertCircle,
  AlertTriangle,
  Check,
  Database,
  Loader2,
} from "lucide-react";
import { useActiveTeam } from "@/contexts/TeamContext";
import { useProductLogger } from "@/lib/loggers/ClientProductLogger";
import { SectionCard, SectionHeader } from "./SettingsHelpers";
import { useCurrentUserMembership } from "@/hooks/useCurrentUserMembership";
import type {
  APIResponse,
  StandardErrorResponse,
  SupabaseConnectStartSuccessResponse,
  SupabaseIntegrationSummary,
  SupabaseIntegrationsSuccessResponse,
} from "@/lib/types/serverAPITypes";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_SERVER_ENDPOINT || "http://localhost:3000";

export function SupabaseBackendIntegrationTab() {
  const logger = useProductLogger();
  const { activeTeam } = useActiveTeam();
  const { membership } = useCurrentUserMembership(activeTeam?.id);

  const isOwnerOrAdmin =
    membership?.role === "owner" || membership?.role === "admin";

  const [integrations, setIntegrations] = useState<SupabaseIntegrationSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectSuccess, setConnectSuccess] = useState(false);

  const fetchIntegrations = useCallback(async () => {
    if (!activeTeam?.id) return;

    setIsLoading(true);
    setError(null);

    try {
      const supabase = (await import("@/ClientConstants")).supabase;
      const session = await supabase.auth.getSession();
      const accessToken = session.data.session?.access_token;

      if (!accessToken) {
        throw new Error("Not authenticated");
      }

      const response = await fetch(
        `${API_BASE_URL}/connectors/supabase/integrations?teamId=${activeTeam.id}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );

      if (!response.ok) {
        throw new Error(
          `Failed to fetch Supabase integrations: ${response.status}`,
        );
      }

      const result: APIResponse<
        SupabaseIntegrationsSuccessResponse,
        StandardErrorResponse
      > = await response.json();

      if (result.data) {
        setIntegrations(result.data.integrations);
      } else {
        throw new Error(result.error?.message || "Failed to fetch integrations");
      }
    } catch (error) {
      logger.debug("error", "Error fetching Supabase integrations:", {
        error: error instanceof Error ? error.message : String(error),
      });
      setError(
        error instanceof Error
          ? error.message
          : "Failed to fetch Supabase integrations",
      );
    } finally {
      setIsLoading(false);
    }
  }, [activeTeam?.id, logger]);

  const handleConnect = async () => {
    if (!activeTeam?.id) return;

    setIsConnecting(true);
    setError(null);
    setConnectSuccess(false);

    try {
      const supabase = (await import("@/ClientConstants")).supabase;
      const session = await supabase.auth.getSession();
      const accessToken = session.data.session?.access_token;

      if (!accessToken) {
        throw new Error("Not authenticated");
      }

      logger.log({
        event: "client_supabase_backend_connect_started",
        properties: {
          teamId: activeTeam.id,
        },
      });

      const response = await fetch(
        `${API_BASE_URL}/connectors/supabase/connect/start`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            teamId: activeTeam.id,
          }),
        },
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.error?.message ||
            `Failed to start Supabase connection: ${response.status}`,
        );
      }

      const result: APIResponse<
        SupabaseConnectStartSuccessResponse,
        StandardErrorResponse
      > = await response.json();

      if (result.data?.authorizationUrl) {
        window.location.href = result.data.authorizationUrl;
      } else {
        throw new Error(
          result.error?.message || "Invalid response from server",
        );
      }
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Failed to connect Supabase",
      );
    } finally {
      setIsConnecting(false);
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") return;

    const urlParams = new URLSearchParams(window.location.search);
    const supabaseConnected = urlParams.get("supabaseConnected");
    const errorParam = urlParams.get("error");

    if (supabaseConnected === "1") {
      setConnectSuccess(true);
      void fetchIntegrations();
    } else if (supabaseConnected === "0" && errorParam) {
      const errorMessages: Record<string, string> = {
        invalid_state: "Invalid or expired connection session. Try again.",
        missing_params: "Missing OAuth response parameters. Try again.",
        forbidden: "You do not have permission to connect Supabase.",
        missing_org:
          "We couldn't determine which Supabase organization to connect.",
        missing_access_token: "Supabase did not return an access token.",
        invalid_token_response: "Supabase returned an invalid token response.",
        token_exchange_failed:
          "Failed to exchange the authorization code with Supabase.",
        integration_save_failed:
          "Failed to save the Supabase integration. Please try again.",
        token_save_failed:
          "Failed to store Supabase credentials. Please try again.",
        internal_error: "An internal error occurred. Please try again.",
      };

      setError(
        errorMessages[errorParam] ||
          "Failed to connect Supabase. Please try again.",
      );
    }
  }, [fetchIntegrations]);

  useEffect(() => {
    void fetchIntegrations();
  }, [fetchIntegrations]);

  const hasIntegrations = integrations.length > 0;

  return (
    <div className="relative min-h-screen text-gray-900 dark:text-white font-sans">
      <div className="container mx-auto px-6 py-12 max-w-5xl">
        <div className="mb-12">
          <h1 className="text-3xl font-medium tracking-tight text-gray-900 dark:text-white mb-2">
            Supabase Backend
          </h1>
          <p className="text-gray-600 dark:text-muted-foreground text-lg">
            Connect your Supabase project to enable backend integrations.
          </p>
        </div>

        <SectionCard>
          <SectionHeader
            title="Supabase OAuth"
            description="Connect Supabase to enable backend workflows"
            icon={Database}
          />
          <div className="p-6 space-y-6">
            {!isOwnerOrAdmin ? (
              <div className="space-y-4">
                <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <p className="font-medium text-amber-700 dark:text-amber-300 mb-1">
                      Owner/Admin Access Required
                    </p>
                    <p className="text-sm text-amber-600 dark:text-amber-400">
                      Only team owners and admins can connect Supabase.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {isLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                  </div>
                ) : (
                  <>
                    {hasIntegrations ? (
                      <div className="space-y-4">
                        <div className="flex items-start gap-3 p-4 rounded-lg bg-green-500/10 border border-green-500/20">
                          <Check className="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5 shrink-0" />
                          <div className="flex-1">
                            <p className="font-medium text-green-700 dark:text-green-300 mb-1">
                              Supabase Connected
                            </p>
                            <p className="text-sm text-green-600 dark:text-green-400">
                              {integrations.length} organization
                              {integrations.length === 1 ? "" : "s"} connected.
                            </p>
                          </div>
                        </div>

                        <div className="space-y-3">
                          {integrations.map((integration) => (
                            <div
                              key={integration.id}
                              className="flex items-start gap-3 p-4 rounded-lg border border-black/10 dark:border-border bg-white/60 dark:bg-muted/30"
                            >
                              <Database className="w-5 h-5 text-gray-600 dark:text-muted-foreground mt-0.5 shrink-0" />
                              <div className="flex-1">
                                <p className="font-medium text-gray-900 dark:text-white">
                                  {integration.supabase_organization_name ||
                                    integration.supabase_organization_id}
                                </p>
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                  Org ID:{" "}
                                  <span className="font-mono">
                                    {integration.supabase_organization_id}
                                  </span>
                                </p>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                  Connected on{" "}
                                  {integration.connected_at
                                    ? new Date(
                                        integration.connected_at,
                                      ).toLocaleDateString()
                                    : "Unknown"}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start gap-3 p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
                        <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
                        <div className="flex-1">
                          <p className="font-medium text-blue-700 dark:text-blue-300 mb-1">
                            Connect Your Supabase Organization
                          </p>
                          <p className="text-sm text-blue-600 dark:text-blue-400 mb-2">
                            Authorize Supabase so we can connect your backend
                            to your prototypes.
                          </p>
                          <ul className="text-sm text-blue-600 dark:text-blue-400 space-y-1 ml-4 list-disc">
                            <li>Read database schema for API generation</li>
                            <li>Manage project environment variables</li>
                            <li>Deploy backend functions from the editor</li>
                          </ul>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {!isLoading && (
                  <div className="space-y-3">
                    <Button
                      onClick={handleConnect}
                      disabled={isConnecting}
                      className="bg-black dark:bg-white text-white dark:text-black hover:bg-black/90 dark:hover:bg-white/90"
                    >
                      {isConnecting ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      ) : (
                        <Database className="w-4 h-4 mr-2" />
                      )}
                      {hasIntegrations
                        ? "Connect another organization"
                        : "Connect Supabase"}
                    </Button>

                    {connectSuccess && !error && (
                      <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                        <Check className="w-4 h-4" />
                        Supabase connected successfully.
                      </div>
                    )}

                    {error && (
                      <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
                        <AlertCircle className="w-4 h-4" />
                        {error}
                      </div>
                    )}

                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      By connecting Supabase, you authorize this app to access
                      your organizations and projects. You can revoke access at
                      any time.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
