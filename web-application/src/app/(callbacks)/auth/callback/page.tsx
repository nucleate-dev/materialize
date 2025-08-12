"use client";

import { posthogClient, supabase } from "@/ClientConstants";
import { handleRedirectToPaymentsPage } from "@/lib/utils/payments/CheckoutUtils";
import { useSubscriptionAccess } from "@/hooks/useSubscriptionAccess";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import RegistrationAccountCreatedEmailVerificationPending from "../../../(auth)/register/RegistrationAccountCreatedEmailVerificationPending";

export default function AuthCallback() {
  const [showEmailVerificationRequired, setShowEmailVerificationRequired] =
    useState<boolean>(false);
  const router = useRouter();
  const { userPlan } = useSubscriptionAccess();

  let productId: string | null = null;
  let chatIntent: { message: string; prototype_id?: string; } | null = null;
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
          console.error("Failed to parse chat_intent", e);
        }
      }
    }
  }

  useEffect(() => {
    const checkAuth = async () => {
      const { data, error } = await supabase.auth.getSession();
      if (data.session?.user) {
        // associate logging events with this authenticated user
        if (posthogClient && typeof posthogClient === 'object' && 'identify' in posthogClient) {
          (posthogClient as { identify: (id: string, props: object) => void; }).identify(data.session?.user.id, {
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
              const response = await fetch('/api/prototype/create', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${data.session.access_token}`
                },
                body: JSON.stringify({
                  name: "New Prototype",
                })
              });

              const protoResult = await response.json();
              if (protoResult.success) {
                prototypeId = protoResult.data.prototype_id;
              }
            } catch (protoError) {
              console.error("Error creating prototype:", protoError);
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
          console.error("Error handling chat intent:", err);
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
  }, [productId, chatIntent, router, userPlan]);

  if (showEmailVerificationRequired) {
    return <RegistrationAccountCreatedEmailVerificationPending />;
  }

  return (
    <div className="justify-self-center self-center justify-center">
      Redirecting...
    </div>
  );
}
