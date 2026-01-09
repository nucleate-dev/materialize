"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { supabase } from "@/ClientConstants";
import { useActiveTeam } from "@/contexts/TeamContext";
import { useProductLogger } from "@/lib/loggers/ClientProductLogger";
import type {
  APIResponse,
  StandardErrorResponse,
  SupabaseOAuthFinalizeRequestBody,
  SupabaseOAuthFinalizeSuccessResponse,
} from "@/lib/types/serverAPITypes";
import { Button } from "@/components/ui/button";

function SupabaseOAuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { activeTeam } = useActiveTeam();
  const logger = useProductLogger();

  const [status, setStatus] = useState<"loading" | "success" | "error">(
    "loading",
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const hasFinalizedRef = useRef(false);

  useEffect(() => {
    if (hasFinalizedRef.current) {
      return;
    }
    hasFinalizedRef.current = true;

    const finalizeConnection = async () => {
      const code = searchParams.get("code");
      const state = searchParams.get("state");

      if (!code || !state) {
        setStatus("error");
        setErrorMessage("Missing OAuth response parameters.");
        return;
      }

      const storedTeamId = sessionStorage.getItem("supabase_oauth_team_id");
      sessionStorage.removeItem("supabase_oauth_team_id");

      const teamId = storedTeamId ?? activeTeam?.id ?? null;
      if (!teamId) {
        setStatus("error");
        setErrorMessage("Unable to determine the team for this connection.");
        return;
      }

      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;

      if (!token) {
        setStatus("error");
        setErrorMessage("Please sign in again to finish connecting Supabase.");
        return;
      }

      try {
        const payload: SupabaseOAuthFinalizeRequestBody = {
          teamId,
          code,
          state,
        };

        const response = await fetch(
          `${process.env.NEXT_PUBLIC_SERVER_ENDPOINT}/supabase-oauth/finalize`,
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
          SupabaseOAuthFinalizeSuccessResponse,
          StandardErrorResponse
        > = await response.json();

        if (!response.ok || result.error) {
          logger.debug("error", "Supabase OAuth finalize failed", {
            status: response.status,
            error: result.error,
          });
          setStatus("error");
          setErrorMessage(
            result.error?.message ?? "Failed to finish Supabase connection.",
          );
          return;
        }

        toast.success("Supabase connected successfully!");
        setStatus("success");
        setTimeout(() => {
          router.replace("/dashboard?openSettings=supabase");
        }, 1200);
      } catch (error) {
        logger.debug("error", "Supabase OAuth finalize error", {
          error: error instanceof Error ? error.message : String(error),
        });
        setStatus("error");
        setErrorMessage("Failed to finish Supabase connection.");
      }
    };

    void finalizeConnection();
  }, [activeTeam?.id, logger, router, searchParams]);

  return (
    <div className="relative min-h-screen text-gray-900 dark:text-white font-sans flex items-center justify-center">
      <div className="container mx-auto px-6 max-w-2xl">
        <div className="bg-white dark:bg-[#141517] border border-black/5 dark:border-white/5 rounded-2xl shadow-lg dark:shadow-none overflow-hidden">
          <div className="relative px-8 pt-12 pb-8 text-center border-b border-black/5 dark:border-white/5">
            {status === "loading" && (
              <div className="w-20 h-20 mx-auto mb-6 bg-blue-500/20 dark:bg-blue-500/10 rounded-full flex items-center justify-center">
                <Loader2 className="w-10 h-10 text-blue-600 dark:text-blue-400 animate-spin" />
              </div>
            )}
            {status === "success" && (
              <div className="w-20 h-20 mx-auto mb-6 bg-emerald-500/20 dark:bg-emerald-500/10 rounded-full flex items-center justify-center">
                <CheckCircle className="w-10 h-10 text-emerald-600 dark:text-emerald-400" />
              </div>
            )}
            {status === "error" && (
              <div className="w-20 h-20 mx-auto mb-6 bg-red-500/20 dark:bg-red-500/10 rounded-full flex items-center justify-center">
                <AlertCircle className="w-10 h-10 text-red-600 dark:text-red-400" />
              </div>
            )}

            <h1 className="text-3xl font-medium tracking-tight text-gray-900 dark:text-white mb-3">
              {status === "loading" && "Connecting Supabase..."}
              {status === "success" && "Supabase connected"}
              {status === "error" && "Connection failed"}
            </h1>
            <p className="text-gray-600 dark:text-[#8A8F98] text-lg">
              {status === "loading" &&
                "We are finishing your Supabase connection."}
              {status === "success" &&
                "Your team can now create projects in Supabase."}
              {status === "error" && (errorMessage ?? "Something went wrong.")}
            </p>
          </div>

          <div className="p-8 space-y-6">
            {status === "loading" && (
              <div className="flex items-center justify-center gap-3 text-sm text-gray-600 dark:text-[#8A8F98]">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Finalizing connection...</span>
              </div>
            )}

            {status === "success" && (
              <p className="text-center text-sm text-gray-600 dark:text-[#8A8F98]">
                Redirecting back to team settings...
              </p>
            )}

            {status === "error" && (
              <div className="space-y-3">
                <Button
                  onClick={() => router.replace("/dashboard")}
                  className="w-full bg-black dark:bg-white text-white dark:text-black hover:bg-black/90 dark:hover:bg-white/90 h-11"
                >
                  Return to Dashboard
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SupabaseOAuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="relative min-h-screen flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-gray-600 dark:text-[#8A8F98]" />
        </div>
      }
    >
      <SupabaseOAuthCallbackContent />
    </Suspense>
  );
}
