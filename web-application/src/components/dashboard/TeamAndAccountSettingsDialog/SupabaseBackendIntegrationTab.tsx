"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AlertCircle, AlertTriangle, Database, Loader2 } from "lucide-react";
import { useActiveTeam } from "@/contexts/TeamContext";
import { useProductLogger } from "@/lib/loggers/ClientProductLogger";
import { SectionCard, SectionHeader } from "./SettingsHelpers";
import { useCurrentUserMembership } from "@/hooks/useCurrentUserMembership";

export function SupabaseBackendIntegrationTab() {
  const logger = useProductLogger();
  const { activeTeam } = useActiveTeam();
  const { membership } = useCurrentUserMembership(activeTeam?.id);

  const isOwnerOrAdmin =
    membership?.role === "owner" || membership?.role === "admin";

  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = async () => {
    if (!activeTeam?.id) return;

    setIsConnecting(true);
    setError(null);

    try {
      logger.log({
        event: "client_supabase_backend_connect_started",
        properties: {
          teamId: activeTeam.id,
        },
      });

      // TODO: Wire this to the Supabase OAuth start endpoint.
      throw new Error("Supabase OAuth connection isn't available yet.");
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Failed to connect Supabase",
      );
    } finally {
      setIsConnecting(false);
    }
  };

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
                <div className="flex items-start gap-3 p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
                  <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <p className="font-medium text-blue-700 dark:text-blue-300 mb-1">
                      Connect Your Supabase Project
                    </p>
                    <p className="text-sm text-blue-600 dark:text-blue-400 mb-2">
                      Authorize Supabase so we can connect your backend to your
                      prototypes.
                    </p>
                    <ul className="text-sm text-blue-600 dark:text-blue-400 space-y-1 ml-4 list-disc">
                      <li>Read database schema for API generation</li>
                      <li>Manage project environment variables</li>
                      <li>Deploy backend functions from the editor</li>
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
                      <Database className="w-4 h-4 mr-2" />
                    )}
                    Connect Supabase
                  </Button>

                  {error && (
                    <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
                      <AlertCircle className="w-4 h-4" />
                      {error}
                    </div>
                  )}

                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Supabase OAuth is rolling out in stages. We'll redirect you
                    to authorize access once it's available.
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
