import { ErrorResponse, Resend } from "resend";
import Stripe from "stripe";
import TrialEndingEmail from "@/components/emails/TrialEndingEmail";
import OneTimePaymentConfirmationEmail from "@/components/emails/OneTimePaymentConfirmationEmail";
import SubscriptionPaymentFailedEmail from "@/components/emails/SubscriptionPaymentFailedEmail";

/**
 * Sends a confirmation email after a one-time payment is successfully made via Stripe Checkout.
 * The email includes details about the purchased products and a link to the receipt.
 *
 * @param {Stripe.Checkout.Session} checkoutSession - The Stripe Checkout session object containing customer details.
 * @param {Array<string>} products - An array of product names purchased by the customer.
 * @param {any} receiptUrl - The URL to the receipt that the customer can access after the purchase.
 *
 * @returns {Promise<ErrorResponse | null>} - Returns an `ErrorResponse` if sending the email fails, otherwise `null` if successful.
 *
 * Workflow:
 *  1. Extracts the customer’s email from the Stripe Checkout session.
 *  2. If the email is available, sends a one-time payment confirmation email with a product list and receipt URL using the Resend email service.
 *
 * @example
 * const checkoutSession = { ... };  // Stripe Checkout Session
 * const products = ['Product 1', 'Product 2'];
 * const receiptUrl = 'https://yourwebsite.com/receipt/12345';
 * const error = await triggerOneTimePaymentConfirmationEmail(checkoutSession, products, receiptUrl);
 * if (error) {
 *   console.log("Failed to send payment confirmation email:", error);
 * }
 */
export async function triggerOneTimePaymentConfirmationEmail(
  checkoutSession: Stripe.Checkout.Session,
  products: Array<string>,
  receiptUrl: string | null
): Promise<ErrorResponse | null> {
  const resend = new Resend(process.env.RESEND_API_KEY);

  const email =
    checkoutSession.customer_details?.email || checkoutSession.customer_email;
  if (email !== null && email !== undefined) {
    const { error: resendError } = await resend.emails.send({
      from: "Your Company <no-reply@yourcompany.com>",
      to: [email],
      subject: "Welcome to <Your Company>!",
      react: (
        <OneTimePaymentConfirmationEmail
          name={checkoutSession.customer_details?.name || ""}
          products={products}
          receiptUrl={receiptUrl as string}
        />
      ),
    });
    return resendError;
  }
  return null;
}

/**
 * Sends an email to the user notifying them that their subscription payment has failed and provides a link to retry the payment.
 *
 * @param {string | null} email - The recipient's email address. If `null`, the email will not be sent.
 * @param {string | null} name - The name of the customer used in the email greeting. If `null`, a generic greeting is used.
 * @param {string} plan - The name of the subscription plan that the payment failed for.
 * @param {string | null} [retryUrl=null] - The URL for the customer to retry the payment, if available.
 *
 * @returns {Promise<ErrorResponse | null>} - Returns an `ErrorResponse` if sending the email fails, otherwise `null` if successful.
 *
 * Workflow:
 *  1. Sends a notification email using the Resend email service, informing the customer that their subscription payment has failed.
 *  2. If a retry URL is provided, it is included in the email for the customer to retry the payment.
 *
 * @example
 * const email = "customer@example.com";
 * const name = "John Doe";
 * const plan = "Pro Plan";
 * const retryUrl = "https://yourwebsite.com/retry-payment";
 * const error = await triggerSubscriptionPaymentFailedEmail(email, name, plan, retryUrl);
 * if (error) {
 *   console.log("Failed to send payment failed email:", error);
 * }
 */
export async function triggerSubscriptionPaymentFailedEmail(
  email: string | null,
  name: string | null,
  plan: string,
  retryUrl: string | null = null
): Promise<ErrorResponse | null> {
  const resend = new Resend(process.env.RESEND_API_KEY);

  if (email !== null && email !== undefined) {
    const { error: resendError } = await resend.emails.send({
      from: "Your Company <no-reply@yourcompany.com>",
      to: [email],
      subject: "Payment failure",
      react: (
        <SubscriptionPaymentFailedEmail
          name={name ?? ""}
          planName={plan}
          retryUrl={retryUrl}
        />
      ),
    });
    return resendError;
  }
  return null;
}

/**
 * Sends an email to notify the user that their free trial for a subscription is ending soon and encourages them to subscribe.
 *
 * @param {string | null} email - The recipient's email address. If `null`, the email will not be sent.
 * @param {string | null} name - The name of the customer used in the email greeting. If `null`, a generic greeting is used.
 * @param {string} plan - The name of the subscription plan for which the free trial is ending.
 *
 * @returns {Promise<ErrorResponse | null>} - Returns an `ErrorResponse` if sending the email fails, otherwise `null` if successful.
 *
 * Workflow:
 *  1. Sends a notification email using the Resend email service, informing the customer that their free trial will end soon.
 *  2. Encourages the customer to continue with the subscription by upgrading their plan before the trial ends.
 *
 * @example
 * const email = "customer@example.com";
 * const name = "John Doe";
 * const plan = "Pro Plan";
 * const error = await triggerSubscriptionFreeTrialWillEndEmail(email, name, plan);
 * if (error) {
 *   console.log("Failed to send free trial ending email:", error);
 * }
 */
export async function triggerSubscriptionFreeTrialWillEndEmail(
  email: string | null,
  name: string | null,
  plan: string
): Promise<ErrorResponse | null> {
  const resend = new Resend(process.env.RESEND_API_KEY);

  if (email !== null && email !== undefined) {
    const { error: resendError } = await resend.emails.send({
      from: "Your Company <no-reply@yourcompany.com>",
      to: [email],
      subject: "Free trial ending!",
      react: <TrialEndingEmail name={name as string} planName={plan} />,
    });
    return resendError;
  }
  return null;
}
