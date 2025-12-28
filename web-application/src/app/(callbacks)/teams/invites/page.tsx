"use client";

import { supabase } from "@/ClientConstants";
import { useProductLogger } from "@/lib/loggers/ClientProductLogger";
import type {
  APIResponse,
  AcceptTeamInviteErrorResponse,
  AcceptTeamInviteRequestBody,
  AcceptTeamInviteSuccessResponse,
} from "@/lib/types/serverAPITypes";
import {
  clearAcceptInviteIntent,
  setAcceptInviteIntent,
} from "@/lib/utils/acceptInviteIntentUtils";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, Suspense } from "react";

function TeamInviteContent() {
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const logger = useProductLogger();
  const inviteProcessed = useRef(false);

  useEffect(() => {
    const processInvite = async () => {
      if (inviteProcessed.current) {
        return;
      }
      inviteProcessed.current = true;

      const inviteId = searchParams.get("invite_id");

      if (!inviteId) {
        logger.debug("error", "No invite_id parameter found in URL");
        setError("Invalid invite link");
        setTimeout(() => router.push("/dashboard"), 2000);
        return;
      }

      try {
        const { data: sessionData, error: sessionError } =
          await supabase.auth.getSession();

        if (sessionError || !sessionData.session?.user) {
          logger.log({
            event: "client_team_invite_redirect_to_login",
            properties: {
              invite_id: inviteId,
            },
          });
          setAcceptInviteIntent(inviteId);
          router.push("/login");
          return;
        }

        logger.log({
          event: "client_team_invite_accepting",
          properties: {
            invite_id: inviteId,
            user_id: sessionData.session.user.id,
          },
        });

        const payload: AcceptTeamInviteRequestBody = {
          invite_id: inviteId,
        };

        const response = await fetch(
          `${process.env.NEXT_PUBLIC_SERVER_ENDPOINT!}/teams/accept-invite`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${sessionData.session.access_token}`,
            },
            body: JSON.stringify(payload),
          },
        );

        const result: APIResponse<
          AcceptTeamInviteSuccessResponse,
          AcceptTeamInviteErrorResponse
        > = await response.json();

        if (result.data) {
          logger.log({
            event: "client_team_invite_accepted",
            properties: {
              invite_id: inviteId,
              team_id: result.data.team_id,
              role: result.data.role,
            },
          });
          clearAcceptInviteIntent();
          router.push("/dashboard");
        } else if (result.error) {
          logger.debug("error", "Error accepting team invite", {
            error: result.error.error,
            message: result.error.message,
          });
          setError(result.error.message || "Failed to accept invite");
          alert(`Error: ${result.error.message || "Failed to accept invite"}`);
          router.push("/dashboard");
        }
      } catch (err) {
        logger.debug("error", "Exception while accepting team invite", {
          error: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined,
        });
        setError("An unexpected error occurred");
        alert("An unexpected error occurred while accepting the invite");
        router.push("/dashboard");
      }
    };

    processInvite();
  }, [searchParams, router, logger]);

  if (error) {
    return (
      <div className="justify-self-center self-center justify-center text-center">
        <p className="text-red-500">{error}</p>
        <p className="mt-2">Redirecting to dashboard...</p>
      </div>
    );
  }

  return (
    <div className="justify-self-center self-center justify-center">
      Processing invite...
    </div>
  );
}

export default function TeamInvitePage() {
  return (
    <Suspense
      fallback={
        <div className="justify-self-center self-center justify-center">
          Loading...
        </div>
      }
    >
      <TeamInviteContent />
    </Suspense>
  );
}
