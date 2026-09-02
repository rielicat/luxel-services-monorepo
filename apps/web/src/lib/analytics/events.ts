export const EVENTS = {
  CHAT_OPENED: 'chat_opened',
  CHAT_MESSAGE_SENT: 'chat_message_sent',
  AI_TOOL_CALLED: 'ai_tool_called',
  AI_HANDOFF_TO_HUMAN: 'ai_handoff_to_human',
  ACCOUNT_VIEWED: 'account_viewed',
  CTA_CLICKED: 'cta_clicked',
} as const;

export type EventName = (typeof EVENTS)[keyof typeof EVENTS];
