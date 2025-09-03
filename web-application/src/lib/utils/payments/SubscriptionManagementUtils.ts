import { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { supabase } from "@/ClientConstants";
import type {
  ManageBillingRequestBody,
  ManageBillingResponse,
  StandardErrorResponse,
} from "@/lib/types/serverAPITypes";

/**
 * Redirects the authenticated user to the Stripe customer portal where they can manage their billing information.
 *
 * UPDATED: Now uses the control-plane Fastify server instead of Vercel API routes.
 *
 * @param {string} userID - The ID of the authenticated user who wants to manage their billing information.
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
 * handleRedirectToStripeCustomerPortal("user_456", router);
 */
export async function handleRedirectToStripeCustomerPortal(
  userID: string,
  router: AppRouterInstance,
): Promise<void> {
  try {
    const { data: session, error: sessionError } =
      await supabase.auth.getSession();

    if (sessionError) {
      console.error("Session error:", sessionError);
      alert("Authentication error. Please try logging in again.");
      return;
    }

    if (!session.session) {
      alert(
        "You must be logged in to manage billing. Please log in and try again.",
      );
      return;
    }

    // Use the control-plane server endpoint
    const serverEndpoint = process.env.NEXT_PUBLIC_SERVER_ENDPOINT;
    if (!serverEndpoint) {
      throw new Error("Server endpoint not configured");
    }

    const response = await fetch(`${serverEndpoint}/payments/manage-billing`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.session.access_token}`,
        "Content-Type": "application/json",
      },
      // Empty body since user ID comes from JWT
      body: JSON.stringify({} as ManageBillingRequestBody),
    });

    if (!response.ok) {
      // Handle HTTP error responses
      const errorData: StandardErrorResponse = await response.json();
      console.error("Billing portal request failed:", errorData);

      if (response.status === 401) {
        alert("Authentication failed. Please log in again.");
      } else if (response.status === 400) {
        alert("Unable to access billing portal. Please contact support.");
      } else {
        alert("Unable to access billing portal. Please try again later.");
      }
      return;
    }

    const data: ManageBillingResponse = await response.json();

    // Type guard to ensure we have a successful response
    if ("redirect_url" in data) {
      router.push(data.redirect_url);
    } else {
      // This is a StandardErrorResponse
      console.error("Billing portal error:", data);
      alert("Unable to access billing portal. Please try again later.");
    }
  } catch (error) {
    console.error("Error accessing billing portal:", error);
    alert(
      "Unable to access billing portal. Please check your connection and try again.",
    );
  }
}
