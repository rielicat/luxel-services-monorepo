export const EVENTS = {
  QUOTE_STARTED: 'quote_started',
  QUOTE_CALCULATED: 'quote_calculated',
  QUOTE_OUT_OF_AREA: 'quote_out_of_area',
  LEAD_OUT_OF_AREA_SUBMITTED: 'lead_out_of_area_submitted',
  BOOKING_STARTED: 'booking_started',
  BOOKING_CREATED: 'booking_created',
  CHECKOUT_STARTED: 'checkout_started',
  PAYMENT_SUCCEEDED: 'payment_succeeded',
  SUBSCRIPTION_CREATED: 'subscription_created',
  CHAT_OPENED: 'chat_opened',
  CHAT_MESSAGE_SENT: 'chat_message_sent',
  AI_TOOL_CALLED: 'ai_tool_called',
  AI_HANDOFF_TO_HUMAN: 'ai_handoff_to_human',
  ACCOUNT_VIEWED: 'account_viewed',
  CTA_CLICKED: 'cta_clicked',
} as const;

export type EventName = (typeof EVENTS)[keyof typeof EVENTS];
