export const EVENTS = {
  CHAT_OPENED: 'chat_opened',
  CHAT_MESSAGE_SENT: 'chat_message_sent',
  AI_TOOL_CALLED: 'ai_tool_called',
  AI_HANDOFF_TO_HUMAN: 'ai_handoff_to_human',
  ACCOUNT_VIEWED: 'account_viewed',
  CTA_CLICKED: 'cta_clicked',
  FEE_ESTIMATED: 'fee_estimated',
  SIGNUP_COMPLETED: 'signup_completed',
  HOST_CONNECT_REQUESTED: 'host_connect_requested',
  HOST_CONNECT_INVITE_SENT: 'host_connect_invite_sent',
  PLAN_REQUESTED: 'plan_requested',
  PLAN_ACTIVATED: 'plan_activated',
  PLAN_CANCELLED: 'plan_cancelled',
} as const;

export type EventName = (typeof EVENTS)[keyof typeof EVENTS];

export const ACTORS = {
  HOST: 'host',
  OPERATOR: 'operator',
} as const;
