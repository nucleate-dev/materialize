export type PostHogEvent =
  | 'client_oauth_registration_initiated'
  | 'client_user_email_registration_completed'
  | 'sandbox_chat_usage_generic'
  | 'server_dispatch'
  | 'server_dispatch_precheck'
  | 'server_prototype_creation'
  | 'server_prototype_deletion'
  | 'server_stripe_billing_portal_session_creation'
  | 'server_stripe_checkout_session_creation';

export const PostHogEvents: Record<PostHogEvent, PostHogEvent> = Object.freeze({
  client_oauth_registration_initiated: 'client_oauth_registration_initiated',
  client_user_email_registration_completed:
    'client_user_email_registration_completed',
  sandbox_chat_usage_generic: 'sandbox_chat_usage_generic',
  server_dispatch: 'server_dispatch',
  server_dispatch_precheck: 'server_dispatch_precheck',
  server_prototype_creation: 'server_prototype_creation',
  server_prototype_deletion: 'server_prototype_deletion',
  server_stripe_billing_portal_session_creation:
    'server_stripe_billing_portal_session_creation',
  server_stripe_checkout_session_creation:
    'server_stripe_checkout_session_creation',
});
