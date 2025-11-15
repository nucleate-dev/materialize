import { supabase } from "@/ClientConstants";
import { ProductKeys } from "@/GlobalConstants";
import type {
  APIResponse,
  CheckoutErrorResponse,
  CheckoutRequestBody,
  CheckoutSuccessResponse,
} from "@/lib/types/serverAPITypes";
import { loadStripe } from "@stripe/stripe-js";
import { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";

/**
 * Handles the checkout process for a product by either creating a Stripe checkout session
 * if the user is logged in, or redirecting the user to the login page if they are not authenticated.
 *
 * @param {string} productID - The ID of the product the user is trying to purchase.
 * @param {AppRouterInstance} router - The Next.js router instance for handling navigation.
 *
 * Workflow:
 *  1. Checks if the user is authenticated by fetching the user object from Supabase.
 *  2. If the user is logged in:
 *     - Calls `handleRedirectToPaymentsPage` with the `productID` and the user's ID to initiate the checkout process.
 *  3. If the user is not logged in:
 *     - Stores the `productID` in `localStorage` under the key `"checkout_intent"` to remember the user's intent.
 *     - Redirects the user to the login page using the Next.js `router.push("/login")`.
 *
 * Use Cases:
 *  - This function is used when a user tries to check out a product but needs to be either logged in or redirected to login.
 *  - The `productID` is stored to ensure the checkout can resume once the user logs in.
 *
 * @example
 * // Example usage of handleCheckout in a component
 * const productID = "prod_123";
 * handleCheckout(productID, router);
 */
export async function handleCheckout(
  productID: string,
  router: AppRouterInstance,
) {
  const { data: session } = await supabase.auth.getSession();

  if (session.session) {
    // User is logged in, create the Stripe checkout session
    if (productID === ProductKeys.FREE_SUBSCRIPTION) {
      router.push("/dashboard");
    } else {
      handleRedirectToPaymentsPage(productID, session.session.access_token);
    }
  } else {
    // Store product ID in local storage or URL and redirect to login
    if (productID !== ProductKeys.FREE_SUBSCRIPTION) {
      localStorage.setItem("checkout_intent", productID);
    }
    router.push("/login");
  }
}

/**
 * Initiates the Stripe checkout process by creating a checkout session and redirecting the user to the Stripe payment page.
 *
 * @param {string} productID - The ID of the product the user is purchasing.
 * @param {string} accessToken - The JWT access token of the authenticated user.
 *
 * Workflow:
 *  1. Loads the Stripe library using the publishable key from environment variables.
 *  2. Sends a `POST` request to the control-plane `/payments/checkout` endpoint with the product ID to create a Stripe checkout session.
 *  3. Receives the session ID from the response and redirects the user to the Stripe checkout page using `redirectToCheckout`.
 *
 * @throws If the Stripe library fails to load or the request to the backend fails, the function may throw an error.
 *
 * @example
 * // Example usage of handleRedirectToPaymentsPage
 * handleRedirectToPaymentsPage("team", "jwt_access_token");
 */
export async function handleRedirectToPaymentsPage(
  productID: string,
  accessToken: string,
): Promise<void> {
  const stripe = await loadStripe(
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY as string,
  );

  const requestBody: CheckoutRequestBody = {
    productID: productID as "free" | "plus" | "pro" | "max" | "team",
  };

  const response = await fetch(
    `${process.env.NEXT_PUBLIC_SERVER_ENDPOINT}/payments/checkout`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(requestBody),
    },
  );

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`Checkout failed: ${errorData.message || "Unknown error"}`);
  }

  const result: APIResponse<CheckoutSuccessResponse, CheckoutErrorResponse> =
    await response.json();

  // Handle successful response
  if (result.data) {
    await stripe?.redirectToCheckout({ sessionId: result.data.id });
  } else if (result.error) {
    // Handle error response
    throw new Error(
      `Checkout failed: ${result.error.message || result.error.error}`,
    );
  }
}
