import { supabase } from "@/ClientConstants";
import type {
  APIResponse,
  ManageBillingErrorResponse,
  ManageBillingSuccessResponse,
} from "@/lib/types/serverAPITypes";
import { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";

/**
 * Redirects the authenticated user to the Stripe customer portal where they can manage their billing information.
 *
 * UPDATED: Now uses the control-plane Fastify server instead of Vercel API routes.
 *
 * @param {string} teamId - The ID of the team whose billing portal should be opened.
 * @param {AppRouterInstance} router - The Next.js router instance used for handling navigation.
 *
 * Workflow:
 *  1. Gets the user's session from Supabase auth.
 *  2. Sends a `POST` request to the control-plane `/payments/manage-billing` endpoint with JWT auth.
 *  3. The API returns a URL (`redirect_url`) to the Stripe customer portal.
 *  4. Redirects the user to the Stripe customer portal using `router.push` with the returned URL.
 *
 * @throws {Error} If the API request fails, authentication is invalid, or redirect_url is not provided.
 *
 * @example
 * // Example usage of handleRedirectToStripeCustomerPortal
 * handleRedirectToStripeCustomerPortal("team_123", router);
 */
export async function handleRedirectToStripeCustomerPortal(
  teamId: string,
  router: AppRouterInstance,
): Promise<void> {
  try {
    const { data: session } = await supabase.auth.getSession();
    const accessToken = session.session?.access_token;
    if (!accessToken) {
      throw new Error("Missing authentication session");
    }

    // Use the control-plane server endpoint
    const serverEndpoint = process.env.NEXT_PUBLIC_SERVER_ENDPOINT;
    if (!serverEndpoint) {
      throw new Error("Server endpoint not configured");
    }

    const response = await fetch(`${serverEndpoint}/payments/manage-billing`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ teamId }),
    });

    if (!response.ok) {
      // Handle HTTP error responses
      if (response.status === 401) {
        alert("Authentication failed. Please log in again.");
      } else if (response.status === 400) {
        alert("Unable to access billing portal. Please contact support.");
      } else {
        alert("Unable to access billing portal. Please try again later.");
      }
      return;
    }

    const result: APIResponse<
      ManageBillingSuccessResponse,
      ManageBillingErrorResponse
    > = await response.json();

    // Handle successful response
    if (result.data) {
      router.push(result.data.redirect_url);
    } else if (result.error) {
      // Handle error response
      alert("Unable to access billing portal. Please try again later.");
    }
  } catch {
    alert(
      "Unable to access billing portal. Please check your connection and try again.",
    );
  }
}

export const IsUserPlanSubscribed = (userPlan: string) => {
  return userPlan === "plus" || userPlan === "pro" || userPlan === "team";
};
