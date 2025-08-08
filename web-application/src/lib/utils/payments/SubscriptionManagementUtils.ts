import { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { supabase } from "@/ClientConstants";

/**
 * Redirects the authenticated user to the Stripe customer portal where they can manage their billing information.
 *
 * @param {string} userID - The ID of the authenticated user who wants to manage their billing information.
 * @param {AppRouterInstance} router - The Next.js router instance used for handling navigation.
 *
 * Workflow:
 *  1. Sends a `POST` request to the `/api/payments/manage-billing` API route, passing the `userID` in the request body.
 *  2. The API returns a URL (`redirect_url`) to the Stripe customer portal.
 *  3. Redirects the user to the Stripe customer portal using `router.push` with the returned URL.
 *
 * @throws If the API request fails or the `redirect_url` is not provided, an error may occur.
 *
 * @example
 * // Example usage of handleRedirectToStripeCustomerPortal
 * handleRedirectToStripeCustomerPortal("user_456", router);
 */
export async function handleRedirectToStripeCustomerPortal(
  userID: string,
  router: AppRouterInstance,
) {
  const { data: session } = await supabase.auth.getSession();

  if (session.session) {
    // User is logged in, create the Stripe checkout session
    const response = await fetch("/api/payments/manage-billing", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.session.access_token}`,
      },
    });
    const data = await response.json();
    router.push(data.redirect_url);
  } else {
    // Store product ID in local storage or URL and redirect to login
    alert("Auth error. Try logging in again.");
  }
}
