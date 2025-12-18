export type PostHogEvent =
  | 'dispatch'
  | 'dispatch_precheck'
  | 'stripe_checkout_session_creation'
  | 'stripe_billing_portal_session_creation'
  | 'prototype_creation'
  | 'prototype_deletion';

export const PostHogEvents: Record<PostHogEvent, PostHogEvent> = Object.freeze({
  dispatch: 'dispatch',
  dispatch_precheck: 'dispatch_precheck',
  stripe_checkout_session_creation: 'stripe_checkout_session_creation',
  stripe_billing_portal_session_creation:
    'stripe_billing_portal_session_creation',
  prototype_creation: 'prototype_creation',
  prototype_deletion: 'prototype_deletion',
});
