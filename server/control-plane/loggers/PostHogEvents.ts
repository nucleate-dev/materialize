export type PostHogEvent =
  | 'dispatch'
  | 'dispatch_precheck'
  | 'stripe_checkout_session_created'
  | 'stripe_billing_portal_session_created';

export const PostHogEvents: Record<PostHogEvent, PostHogEvent> = Object.freeze({
  dispatch: 'dispatch',
  dispatch_precheck: 'dispatch_precheck',
  stripe_checkout_session_created: 'stripe_checkout_session_created',
  stripe_billing_portal_session_created: 'stripe_billing_portal_session_created',
});
