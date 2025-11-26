/**
 * Meta Conversions API utility for server-side conversion tracking
 *
 * This allows us to send conversion events (like purchases) directly from our server
 * to Meta/Facebook, bypassing browser-based tracking limitations like ad blockers.
 */

/* eslint-disable no-restricted-syntax */
// Console is allowed in server-side utilities where ClientProductLogger is not available

import crypto from 'crypto';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const bizSdk = require('facebook-nodejs-business-sdk');

const accessToken = process.env.META_CONVERSIONS_API_ACCESS_TOKEN;
const pixelId = process.env.META_PIXEL_ID;

const ServerEvent = bizSdk.ServerEvent;
const EventRequest = bizSdk.EventRequest;
const UserData = bizSdk.UserData;
const CustomData = bizSdk.CustomData;

/**
 * Hash data using SHA256 (required by Meta for user data)
 */
function hashData(data: string | null | undefined): string | null {
  if (!data) return null;
  return crypto.createHash('sha256').update(data.toLowerCase().trim()).digest('hex');
}

/**
 * Send a Purchase event to Meta Conversions API
 *
 * @param params.email - User's email address
 * @param params.userId - User's ID from your database
 * @param params.value - Purchase amount in dollars
 * @param params.currency - Currency code (e.g., 'USD')
 * @param params.transactionId - Unique transaction/invoice ID
 * @param params.contentName - Description of what was purchased (e.g., 'Plus Subscription')
 * @param params.eventSourceUrl - URL where the conversion happened (optional)
 */
export async function sendMetaPurchaseEvent(params: {
  email: string | null | undefined;
  userId: string;
  value: number;
  currency: string;
  transactionId: string | undefined;
  contentName: string;
  eventSourceUrl?: string;
}): Promise<{ success: boolean; error?: unknown }> {
  if (!accessToken || !pixelId) {
    console.error('Meta Conversions API credentials not configured');
    return { success: false, error: 'Missing credentials' };
  }

  try {
    bizSdk.FacebookAdsApi.init(accessToken);
    const currentTimestamp = Math.floor(Date.now() / 1000);

    // Create user data with hashed PII
    const userData = new UserData()
      .setExternalId(params.userId) // Your internal user ID
      .setClientIpAddress('0.0.0.0') // We don't have IP in webhook context
      .setClientUserAgent('Stripe-Webhook'); // We don't have user agent in webhook context

    // Add email if available
    if (params.email) {
      userData.setEmail(hashData(params.email));
    }

    // Create custom data with purchase details
    const customData = new CustomData()
      .setValue(params.value)
      .setCurrency(params.currency.toUpperCase())
      .setContentName(params.contentName)
      .setContentType('product');

    // Create the server event
    const serverEvent = new ServerEvent()
      .setEventName('Purchase')
      .setEventTime(currentTimestamp)
      .setUserData(userData)
      .setCustomData(customData)
      .setActionSource('system_generated'); // This is a server-side event

    // Add event ID for deduplication if available
    if (params.transactionId) {
      serverEvent.setEventId(params.transactionId);
    }

    // Add event source URL if provided
    if (params.eventSourceUrl) {
      serverEvent.setEventSourceUrl(params.eventSourceUrl);
    }

    // Create and send the event request
    const eventsData = [serverEvent];
    const eventRequest = new EventRequest(accessToken, pixelId)
      .setEvents(eventsData);

    await eventRequest.execute();

    return { success: true };
  } catch (error) {
    console.error('Error sending Meta Purchase event:', error);
    return { success: false, error };
  }
}

/**
 * Send an InitiateCheckout event to Meta Conversions API
 * Useful for tracking when users start the checkout process
 */
export async function sendMetaInitiateCheckoutEvent(params: {
  email: string | null | undefined;
  userId: string;
  value: number;
  currency: string;
  contentName: string;
}): Promise<{ success: boolean; error?: unknown }> {
  if (!accessToken || !pixelId) {
    console.error('Meta Conversions API credentials not configured');
    return { success: false, error: 'Missing credentials' };
  }

  try {
    bizSdk.FacebookAdsApi.init(accessToken);
    const currentTimestamp = Math.floor(Date.now() / 1000);

    const userData = new UserData()
      .setExternalId(params.userId)
      .setClientIpAddress('0.0.0.0')
      .setClientUserAgent('Web');

    if (params.email) {
      userData.setEmail(hashData(params.email));
    }

    const customData = new CustomData()
      .setValue(params.value)
      .setCurrency(params.currency.toUpperCase())
      .setContentName(params.contentName)
      .setContentType('product');

    const serverEvent = new ServerEvent()
      .setEventName('InitiateCheckout')
      .setEventTime(currentTimestamp)
      .setUserData(userData)
      .setCustomData(customData)
      .setActionSource('website');

    const eventsData = [serverEvent];
    const eventRequest = new EventRequest(accessToken, pixelId)
      .setEvents(eventsData);

    await eventRequest.execute();

    return { success: true };
  } catch (error) {
    console.error('Error sending Meta InitiateCheckout event:', error);
    return { success: false, error };
  }
}
