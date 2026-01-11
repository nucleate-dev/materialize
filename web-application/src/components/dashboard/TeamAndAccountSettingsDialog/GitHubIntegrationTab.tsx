"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  AlertCircle,
  Check,
  Github,
  ExternalLink,
  AlertTriangle,
} from "lucide-react";
import { useActiveTeam } from "@/contexts/TeamContext";
import { useProductLogger } from "@/lib/loggers/ClientProductLogger";
import { SectionCard, SectionHeader } from "./SettingsHelpers";
import { useCurrentUserMembership } from "@/hooks/useCurrentUserMembership";

interface GitHubStatus {
  connected: boolean;
  account_login?: string;
  account_type?: "User" | "Organization";
  connected_at?: string;
  installation_id?: number;
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3000";

export function GitHubIntegrationTab() {
  const logger = useProductLogger();
  const { activeTeam } = useActiveTeam();
  const { membership } = useCurrentUserMembership(activeTeam?.id);

  const isOwnerOrAdmin = membership?.role === "owner" || membership?.role === "admin";

  const [githubStatus, setGithubStatus] = useState<GitHubStatus | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [isDisconnecting, setIsDisconnecting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch GitHub integration status
  const fetchGitHubStatus = async () => {
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
        `${API_BASE_URL}/github/status?teamId=${activeTeam.id}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch GitHub status: ${response.status}`);
      }

      const data = await response.json();
      if (data.data) {
        setGithubStatus(data.data);
      } else {
        throw new Error(data.error?.message || "Failed to fetch GitHub status");
      }
    } catch (error) {
      logger.debug("error", "Error fetching GitHub status:", {
        error: error instanceof Error ? error.message : String(error),
      });
      setError(
        error instanceof Error ? error.message : "Failed to fetch GitHub status",
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Handle connect button click
  const handleConnect = async () => {
    if (!activeTeam?.id) return;

    setIsConnecting(true);
    setError(null);

    try {
      const supabase = (await import("@/ClientConstants")).supabase;
      const session = await supabase.auth.getSession();
      const accessToken = session.data.session?.access_token;

      if (!accessToken) {
        throw new Error("Not authenticated");
      }

      logger.log({
        event: "client_github_connect_started",
        properties: {
          teamId: activeTeam.id,
        },
      });

      const response = await fetch(`${API_BASE_URL}/github/connect/start`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          teamId: activeTeam.id,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.error?.message || `Failed to start GitHub connection: ${response.status}`,
        );
      }

      const data = await response.json();
      if (data.data?.installUrl) {
        // Redirect to GitHub to start the OAuth flow
        window.location.href = data.data.installUrl;
      } else {
        throw new Error("Invalid response from server");
      }
    } catch (error) {
      logger.debug("error", "Error connecting GitHub:", {
        error: error instanceof Error ? error.message : String(error),
      });
      setError(
        error instanceof Error ? error.message : "Failed to connect GitHub",
      );
      setIsConnecting(false);
    }
  };

  // Handle disconnect button click
  const handleDisconnect = async () => {
    if (!activeTeam?.id) return;

    if (
      !confirm(
        "Are you sure you want to disconnect GitHub? This will remove access to your repositories.",
      )
    ) {
      return;
    }

    setIsDisconnecting(true);
    setError(null);

    try {
      const supabase = (await import("@/ClientConstants")).supabase;
      const session = await supabase.auth.getSession();
      const accessToken = session.data.session?.access_token;

      if (!accessToken) {
        throw new Error("Not authenticated");
      }

      logger.log({
        event: "client_github_disconnect_started",
        properties: {
          teamId: activeTeam.id,
        },
      });

      const response = await fetch(`${API_BASE_URL}/github/disconnect`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          teamId: activeTeam.id,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.error?.message || `Failed to disconnect GitHub: ${response.status}`,
        );
      }

      logger.log({
        event: "client_github_disconnect_success",
        properties: {
          teamId: activeTeam.id,
        },
      });

      // Refresh status
      await fetchGitHubStatus();
    } catch (error) {
      logger.debug("error", "Error disconnecting GitHub:", {
        error: error instanceof Error ? error.message : String(error),
      });
      setError(
        error instanceof Error ? error.message : "Failed to disconnect GitHub",
      );
    } finally {
      setIsDisconnecting(false);
    }
  };

  // Check for connection success/failure in URL params
  useEffect(() => {
    if (typeof window === "undefined") return;

    const urlParams = new URLSearchParams(window.location.search);
    const githubConnected = urlParams.get("githubConnected");
    const errorParam = urlParams.get("error");

    if (githubConnected === "1") {
      // Success - refresh status
      void fetchGitHubStatus();

      logger.log({
        event: "client_github_connect_success",
        properties: {
          teamId: activeTeam?.id,
        },
      });

      // Clean up URL params
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete("githubConnected");
      newUrl.searchParams.delete("error");
      window.history.replaceState({}, "", newUrl.toString());
    } else if (githubConnected === "0" && errorParam) {
      // Error
      const errorMessages: Record<string, string> = {
        invalid_session: "Invalid or expired connection session. Please try again.",
        session_expired: "Connection session expired. Please try again.",
        session_already_used: "Connection session already used. Please try again.",
        installation_not_found: "GitHub installation not found. Please try again.",
        no_installation: "No GitHub installation found. Please install the app first.",
        save_failed: "Failed to save GitHub integration. Please try again.",
        internal_error: "An internal error occurred. Please try again.",
      };

      setError(errorMessages[errorParam] || "Failed to connect GitHub. Please try again.");

      // Clean up URL params
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete("githubConnected");
      newUrl.searchParams.delete("error");
      window.history.replaceState({}, "", newUrl.toString());
    }
  }, []);

  // Fetch status on mount and when team changes
  useEffect(() => {
    void fetchGitHubStatus();
  }, [activeTeam?.id]);

  return (
    <div className="relative min-h-screen text-gray-900 dark:text-white font-sans">
      <div className="container mx-auto px-6 py-12 max-w-5xl">
        {/* Header */}
        <div className="mb-12">
          <h1 className="text-3xl font-medium tracking-tight text-gray-900 dark:text-white mb-2">
            GitHub Integration
          </h1>
          <p className="text-gray-600 dark:text-[#8A8F98] text-lg">
            Connect your GitHub account to access repositories.
          </p>
        </div>

        {/* GitHub Connection */}
        <SectionCard>
          <SectionHeader
            title="GitHub App"
            description="Connect GitHub to access your repositories"
            icon={Github}
          />
          <div className="p-6 space-y-6">
            {!isOwnerOrAdmin ? (
              /* Not owner/admin - read-only view */
              <div className="space-y-4">
                <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <p className="font-medium text-amber-700 dark:text-amber-300 mb-1">
                      Owner/Admin Access Required
                    </p>
                    <p className="text-sm text-amber-600 dark:text-amber-400">
                      Only team owners and admins can connect or disconnect GitHub.
                      {githubStatus?.connected && (
                        <>
                          {" "}
                          This team is currently connected to{" "}
                          <span className="font-mono">
                            {githubStatus.account_login}
                          </span>
                          .
                        </>
                      )}
                    </p>
                  </div>
                </div>
              </div>
            ) : isLoading ? (
              /* Loading State */
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              </div>
            ) : githubStatus?.connected ? (
              /* Connected State */
              <div className="space-y-4">
                <div className="flex items-start gap-3 p-4 rounded-lg bg-green-500/10 border border-green-500/20">
                  <Check className="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <p className="font-medium text-green-700 dark:text-green-300 mb-1">
                      GitHub Connected
                    </p>
                    <p className="text-sm text-green-600 dark:text-green-400">
                      Connected to{" "}
                      <span className="font-mono font-semibold">
                        {githubStatus.account_login}
                      </span>{" "}
                      ({githubStatus.account_type})
                    </p>
                    {githubStatus.connected_at && (
                      <p className="text-xs text-green-600/80 dark:text-green-400/80 mt-1">
                        Connected on{" "}
                        {new Date(githubStatus.connected_at).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={handleDisconnect}
                    variant="outline"
                    disabled={isDisconnecting}
                    className="border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950"
                  >
                    {isDisconnecting ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : (
                      <Github className="w-4 h-4 mr-2" />
                    )}
                    Disconnect GitHub
                  </Button>
                </div>

                {error && (
                  <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
                    <AlertCircle className="w-4 h-4" />
                    {error}
                  </div>
                )}
              </div>
            ) : (
              /* Not Connected State */
              <div className="space-y-4">
                <div className="flex items-start gap-3 p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
                  <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <p className="font-medium text-blue-700 dark:text-blue-300 mb-1">
                      Connect Your GitHub Account
                    </p>
                    <p className="text-sm text-blue-600 dark:text-blue-400 mb-2">
                      Connect GitHub to access your repositories and enable
                      version control features.
                    </p>
                    <ul className="text-sm text-blue-600 dark:text-blue-400 space-y-1 ml-4 list-disc">
                      <li>Clone and push to your repositories</li>
                      <li>Create branches and pull requests</li>
                      <li>Manage repository settings</li>
                    </ul>
                  </div>
                </div>

                <div className="space-y-3">
                  <Button
                    onClick={handleConnect}
                    disabled={isConnecting}
                    className="bg-black dark:bg-white text-white dark:text-black hover:bg-black/90 dark:hover:bg-white/90"
                  >
                    {isConnecting ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : (
                      <Github className="w-4 h-4 mr-2" />
                    )}
                    Connect GitHub
                  </Button>

                  {error && (
                    <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
                      <AlertCircle className="w-4 h-4" />
                      {error}
                    </div>
                  )}

                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    By connecting GitHub, you authorize this app to access your
                    repositories. You can revoke access at any time.
                  </p>
                </div>
              </div>
            )}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
