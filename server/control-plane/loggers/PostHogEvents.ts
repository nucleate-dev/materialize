export type PostHogEvent =
  | 'chat_usage_generic'
  | 'dispatch'
  | 'dispatch_precheck'
  | 'oauth_registration_initiated'
  | 'prototype_creation'
  | 'prototype_deletion'
  | 'stripe_billing_portal_session_creation'
  | 'stripe_checkout_session_creation'
  | 'user_registration_completed';

export const PostHogEvents: Record<PostHogEvent, PostHogEvent> = Object.freeze({
  chat_usage_generic: 'chat_usage_generic',
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
