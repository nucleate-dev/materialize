"use client";

import { useEffect, useState } from "react";
import { posthogClient, supabase } from "@/GlobalConstants";
import { useRouter } from "next/navigation";
import { handleRedirectToPaymentsPage } from "@/lib/utils/payments/CheckoutUtils";
import RegistrationAccountCreatedEmailVerificationPending from "../../../(auth)/register/RegistrationAccountCreatedEmailVerificationPending";

export default function AuthCallback() {
  const [showEmailVerificationRequired, setShowEmailVerificationRequired] =
    useState<boolean>(false);
  const router = useRouter();

  let productId: string | null = null;
  if (typeof window !== "undefined") {
    productId = localStorage?.getItem("checkout_intent");
  }

  useEffect(() => {
    const checkAuth = async () => {
      const { data, error } = await supabase.auth.getSession();
      if (data.session?.user) {
        // associate logging events with this authenticated user
        posthogClient?.identify(data.session?.user.id, {
          email: data.session.user.email ?? "",
        });
      }

      if (error || data.session === null) {
        router.push("/dashboard"); // this will redirect to login if the user is not signed in
      } else if (data.session.user && productId) {
        // User is logged in and there is a checkout_intent with a product ID, proceed to checkout
        localStorage.removeItem("checkout_intent");
        handleRedirectToPaymentsPage(productId, data.session.access_token);
      } else if (data.session.user.email_confirmed_at === null) {
        setShowEmailVerificationRequired(true);
      } else if (data.session.user) {
        // user is logged in, but there is no checkout intent
        router.push("/dashboard");
      } else {
        // If not logged in, redirect back to login or handle error
        router.push("/login");
      }
    };

    checkAuth();
  }, [productId]);

  if (showEmailVerificationRequired) {
    return <RegistrationAccountCreatedEmailVerificationPending />;
  }

  return (
    <div className="justify-self-center self-center justify-center">
      Redirecting...
    </div>
  );
}
