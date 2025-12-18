export type PostHogEvent = 'stripe_checkout_session_created';

export const PostHogEvents: Record<PostHogEvent, PostHogEvent> = Object.freeze({
  stripe_checkout_session_created: 'stripe_checkout_session_created',
});
