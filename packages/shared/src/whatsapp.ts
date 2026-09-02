export const WHATSAPP_TEMPLATE_KINDS = ['concierge_arrival', 'cleaning_confirm'] as const;
export type WhatsAppTemplateKind = (typeof WHATSAPP_TEMPLATE_KINDS)[number];
export const WHATSAPP_TEXT_MAX = 4000;
