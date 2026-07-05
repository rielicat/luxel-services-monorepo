/**
 * Canonical analytics event taxonomy — shared by client (posthog-js) and server
 * (capture()) so names never drift. See docs/METRICS.md for the full spec.
 */
export const EVENTS = {
  // Funnel
  QUOTE_STARTED: 'quote_started',
  QUOTE_CALCULATED: 'quote_calculated',
  QUOTE_OUT_OF_AREA: 'quote_out_of_area',
  BOOKING_STARTED: 'booking_started',
  BOOKING_CREATED: 'booking_created',
  CHECKOUT_STARTED: 'checkout_started',
  PAYMENT_SUCCEEDED: 'payment_succeeded',
  PAYMENT_FAILED: 'payment_failed',
  SUBSCRIPTION_CREATED: 'subscription_created',
  // AI concierge
  CHAT_OPENED: 'chat_opened',
  CHAT_MESSAGE_SENT: 'chat_message_sent',
  AI_TOOL_CALLED: 'ai_tool_called',
  AI_HANDOFF_TO_HUMAN: 'ai_handoff_to_human',
  // Account
  ACCOUNT_VIEWED: 'account_viewed',
  SUBSCRIPTION_PAUSED: 'subscription_paused',
  SUBSCRIPTION_CANCELLED: 'subscription_cancelled',
  // CTA
  CTA_CLICKED: 'cta_clicked',
} as const;

export type EventName = (typeof EVENTS)[keyof typeof EVENTS];
