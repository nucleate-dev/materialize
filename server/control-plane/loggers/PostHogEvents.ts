export type PostHogEvent =
  | 'dispatch'
  | 'dispatch_precheck'
  | 'oauth_registration_initiated'
  | 'prototype_creation'
  | 'prototype_deletion'
  | 'stripe_billing_portal_session_creation'
  | 'stripe_checkout_session_creation'
  | 'user_registration_completed';

export const PostHogEvents: Record<PostHogEvent, PostHogEvent> = Object.freeze({
  dispatch: 'dispatch',
  dispatch_precheck: 'dispatch_precheck',
  oauth_registration_initiated: 'oauth_registration_initiated',
  prototype_creation: 'prototype_creation',
  prototype_deletion: 'prototype_deletion',
  stripe_billing_portal_session_creation:
    'stripe_billing_portal_session_creation',
  stripe_checkout_session_creation: 'stripe_checkout_session_creation',
  user_registration_completed: 'user_registration_completed',
});
