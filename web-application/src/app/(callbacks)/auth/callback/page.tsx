"use client";

import { posthogClient, supabase } from "@/ClientConstants";
import { handleRedirectToPaymentsPage } from "@/lib/utils/payments/CheckoutUtils";
import { useSubscriptionAccess } from "@/hooks/useSubscriptionAccess";
import type {
  APIResponse,
  CreatePrototypeRequestBody,
  CreatePrototypeSuccessResponse,
  CreatePrototypeErrorResponse,
} from "@/lib/types/serverAPITypes";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import RegistrationAccountCreatedEmailVerificationPending from "../../../(auth)/register/RegistrationAccountCreatedEmailVerificationPending";
import { useProductLogger } from "@/lib/loggers/ClientProductLogger";

export default function AuthCallback() {
  const [showEmailVerificationRequired, setShowEmailVerificationRequired] =
    useState<boolean>(false);
  const router = useRouter();
  const { userPlan } = useSubscriptionAccess();
  const logger = useProductLogger();

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

  useEffect(() => {
    const checkAuth = async () => {
      const { data, error } = await supabase.auth.getSession();
      if (data.session?.user) {
        // associate logging events with this authenticated user
        if (
          posthogClient &&
          typeof posthogClient === "object" &&
          "identify" in posthogClient
        ) {
          (
            posthogClient as { identify: (id: string, props: object) => void }
          ).identify(data.session?.user.id, {
            email: data.session.user.email ?? "",
          });
        }
      }

      if (error || data.session === null) {
        router.push("/dashboard"); // this will redirect to login if the user is not signed in
      } else if (data.session.user && productId) {
        // User is logged in and there is a checkout_intent with a product ID, proceed to checkout
        // Leave any chat intent in local storage so it can be handled after returning from checkout
        localStorage.removeItem("checkout_intent");
        handleRedirectToPaymentsPage(productId, data.session.access_token);
      } else if (data.session.user && chatIntent?.message) {
        try {
          let prototypeId = chatIntent.prototype_id;
          if (!prototypeId) {
            try {
              const response = await fetch(
                `${process.env.NEXT_PUBLIC_SERVER_ENDPOINT!}/prototype/create`,
                {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${data.session.access_token}`,
                  },
                  body: JSON.stringify({
                    name: "New Prototype",
                  } as CreatePrototypeRequestBody),
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
            router.push(`/dashboard/prototypes/${prototypeId}`);
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
  }, [productId, chatIntent, router, userPlan, logger]);

  if (showEmailVerificationRequired) {
    return <RegistrationAccountCreatedEmailVerificationPending />;
  }

  return (
    <div className="justify-self-center self-center justify-center">
      Redirecting...
    </div>
  );
}
