import { supabase } from "@/GlobalConstants";
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
  router: AppRouterInstance
) {
  const { data: session } = await supabase.auth.getSession();

  if (session.session) {
    // User is logged in, create the Stripe checkout session
    handleRedirectToPaymentsPage(productID, session.session.access_token);
  } else {
    // Store product ID in local storage or URL and redirect to login
    localStorage.setItem("checkout_intent", productID);
    router.push("/login");
  }
}

/**
 * Initiates the Stripe checkout process by creating a checkout session and redirecting the user to the Stripe payment page.
 *
 * @param {string} productID - The ID of the product the user is purchasing.
 * @param {string} userID - The ID of the authenticated user initiating the purchase.
 *
 * Workflow:
 *  1. Loads the Stripe library using the publishable key from environment variables.
 *  2. Sends a `POST` request to the `/api/payments/checkout` API route with the product ID and user ID to create a Stripe checkout session.
 *  3. Receives the session ID from the response and redirects the user to the Stripe checkout page using `redirectToCheckout`.
 *
 * @throws If the Stripe library fails to load or the request to the backend fails, the function may throw an error.
 *
 * @example
 * // Example usage of handleRedirectToPaymentsPage
 * handleRedirectToPaymentsPage("prod_123", "user_456");
 */
export async function handleRedirectToPaymentsPage(
  productID: string,
  accessToken: string
) {
  const stripe = await loadStripe(
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY as string
  );
  const response = await fetch("/api/payments/checkout", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      productID: productID,
    }),
  });
  const session = await response.json();
  await stripe?.redirectToCheckout({ sessionId: session.id });
}
