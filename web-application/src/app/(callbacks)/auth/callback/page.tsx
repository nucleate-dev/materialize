"use client";

import { supabase } from "@/ClientConstants";
import { useSubscriptionAccess } from "@/hooks/useSubscriptionAccess";
import { useProductLogger } from "@/lib/loggers/ClientProductLogger";
import type {
  APIResponse,
  CreatePrototypeErrorResponse,
  CreatePrototypeRequestBody,
  CreatePrototypeSuccessResponse,
} from "@/lib/types/serverAPITypes";
import { handleRedirectToPaymentsPage } from "@/lib/utils/payments/CheckoutUtils";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useMetaPixel } from "@/hooks/useMetaPixel";
import { usePostHog } from "posthog-js/react";
import RegistrationAccountCreatedEmailVerificationPending from "../../../(auth)/register/RegistrationAccountCreatedEmailVerificationPending";
import { useActiveTeam } from "@/contexts/TeamContext";

export default function AuthCallback() {
  const [showEmailVerificationRequired, setShowEmailVerificationRequired] =
    useState<boolean>(false);
  const router = useRouter();
  const { userPlan } = useSubscriptionAccess();
  const { activeTeam } = useActiveTeam();
  const logger = useProductLogger();
  const { trackEvent } = useMetaPixel();
  const posthog = usePostHog();
  const authEventLogged = useRef(false);

  useEffect(() => {
    const checkAuth = async () => {
      const { data, error } = await supabase.auth.getSession();

      // Read intents from localStorage inside useEffect to ensure they're available
      let productId: string | null = null;
      let chatIntent: { message: string; prototype_id?: string } | null = null;

      if (typeof window !== "undefined") {
        productId = localStorage?.getItem("checkout_intent");
        if (!productId) {
          const storedIntent = localStorage.getItem("chat_intent");
          if (storedIntent) {
            try {
              chatIntent = JSON.parse(storedIntent) as {
                message: string;
                prototype_id?: string;
              };
            } catch (e) {
              logger.debug("error", "Failed to parse chat_intent", {
                error: e instanceof Error ? e.message : String(e),
                stack: e instanceof Error ? e.stack : undefined,
              });
            }
          }
        }
      }
      if (data.session?.user) {
        if (!authEventLogged.current) {
          authEventLogged.current = true;
          logger.log({
            event: "client_auth_callback_login_completed",
            properties: {
              has_checkout_intent: Boolean(productId),
              has_chat_intent: Boolean(chatIntent?.message),
              user_plan: userPlan,
            },
          });
        }
        // Associate logging events with this authenticated user
        posthog?.identify(data.session.user.id, {
          email: data.session.user.email ?? "",
        });

        // Fire Meta Pixel registration event for OAuth sign-ups if pending
        if (typeof window !== "undefined") {
          const pendingMetaRegistration = localStorage.getItem(
            "pending_meta_registration",
          );
          if (pendingMetaRegistration) {
            try {
              const parsed = JSON.parse(pendingMetaRegistration) as {
                provider?: string;
                utm?: Record<string, unknown>;
                eventId?: string;
              };
              const sentKey = `meta_registration_sent_${data.session.user.id}`;
              const isNewUser =
                data.session.user.created_at ===
                data.session.user.last_sign_in_at;

              if (!localStorage.getItem(sentKey)) {
                // Use stored eventId or generate a new one
                const eventId =
                  parsed.eventId ??
                  `reg_oauth_${data.session.user.id}_${Date.now()}`;

                trackEvent(
                  "CompleteRegistration",
                  {
                    content_name: "Account Registration",
                    status: "oauth",
                    provider: parsed.provider ?? "google",
                    is_new_user: isNewUser,
                    ...(parsed.utm ?? {}),
                  },
                  eventId, // Add event_id for deduplication
                );
                localStorage.setItem(sentKey, "true");
              }
            } catch (trackingError) {
              logger.debug(
                "warn",
                "Failed to track pending Meta registration event",
                {
                  error:
                    trackingError instanceof Error
                      ? trackingError.message
                      : String(trackingError),
                },
              );
            } finally {
              localStorage.removeItem("pending_meta_registration");
            }
          }
        }
      }

      if (error || data.session === null) {
        router.push("/dashboard"); // this will redirect to login if the user is not signed in
      } else if (data.session.user && productId) {
        // User is logged in and there is a checkout_intent with a product ID, proceed to checkout
        // Leave any chat intent in local storage so it can be handled after returning from checkout
        localStorage.removeItem("checkout_intent");
        const teamId = activeTeam?.id;
        if (!teamId) {
          logger.debug("error", "Unable to locate active team for checkout");
          router.push("/dashboard");
          return;
        }
        handleRedirectToPaymentsPage(
          productId,
          data.session.access_token,
          teamId,
        );
      } else if (data.session.user && chatIntent?.message) {
        try {
          let prototypeId = chatIntent.prototype_id;
          if (!prototypeId) {
            try {
          const teamId = activeTeam?.id;
          if (!teamId) {
            logger.debug("error", "Unable to determine active team");
            router.push("/dashboard");
            return;
          }

          const payload: CreatePrototypeRequestBody = {
            name: "New Prototype",
            creation_source: "auth_callback_chat_intent",
            team_id: teamId,
          };

              const response = await fetch(
                `${process.env.NEXT_PUBLIC_SERVER_ENDPOINT!}/prototype/create`,
                {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${data.session.access_token}`,
                  },
                  body: JSON.stringify(payload),
                },
              );

              const protoResult: APIResponse<
                CreatePrototypeSuccessResponse,
                CreatePrototypeErrorResponse
              > = await response.json();
              if (protoResult.data) {
                prototypeId = protoResult.data.prototype_id;
              }
            } catch (protoError) {
              logger.debug("error", "Error creating prototype", {
                error:
                  protoError instanceof Error
                    ? protoError.message
                    : String(protoError),
                stack:
                  protoError instanceof Error ? protoError.stack : undefined,
              });
            }
          }
          if (prototypeId) {
            localStorage.setItem(
              "chat_intent",
              JSON.stringify({
                prototype_id: prototypeId,
                message: chatIntent.message,
              }),
            );
            router.push(`/dashboard/projects/${prototypeId}`);
          } else {
            router.push("/dashboard");
          }
        } catch (err) {
          logger.debug("error", "Error handling chat intent: ", {
            error: err instanceof Error ? err.message : String(err),
            stack: err instanceof Error ? err.stack : undefined,
          });
          router.push("/dashboard");
        }
      } else if (data.session.user.email_confirmed_at === null) {
        setShowEmailVerificationRequired(true);
      } else if (data.session.user) {
        // user is logged in, but there is no checkout intent or chat intent
        router.push("/dashboard");
      } else {
        // If not logged in, redirect back to login or handle error
        router.push("/login");
      }
    };

    checkAuth();
  }, [router, userPlan, logger, trackEvent, posthog]);

  if (showEmailVerificationRequired) {
    return <RegistrationAccountCreatedEmailVerificationPending />;
  }

  return (
    <div className="justify-self-center self-center justify-center">
      Redirecting...
    </div>
  );
}
