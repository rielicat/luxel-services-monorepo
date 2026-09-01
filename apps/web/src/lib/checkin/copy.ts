import type { GuestLocale } from '@luxel/shared/i18n';

/**
 * Guest-facing copy that leaves the app for the Airbnb thread. The Spanish text
 * is the host's own booking message, taken from their thread history, with one
 * sentence changed: the check-in details now arrive on a fixed day (Hospitable's
 * rule, 3 days before arrival) rather than "as soon as you fill the form".
 *
 * Dates are formatted by hand, not through Intl: ICU output differs between Node
 * versions ("3 jun 2026" vs "3 jun. 2026"), and a message that a guest receives
 * should not change shape with a runtime upgrade.
 */

const MONTHS_ES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];
const SHORT_ES = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sept',
  'oct',
  'nov',
  'dic',
];
const SHORT_EN = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];
const SHORT_PT = [
  'jan',
  'fev',
  'mar',
  'abr',
  'mai',
  'jun',
  'jul',
  'ago',
  'set',
  'out',
  'nov',
  'dez',
];

function parts(isoDate: string): { y: number; m: number; d: number } {
  const [y, m, d] = isoDate.slice(0, 10).split('-').map(Number);
  return { y: y ?? 0, m: m ?? 1, d: d ?? 1 };
}

/** "3 jun. 2026" / "Jun 3, 2026" / "3 de jun. de 2026" — the host's own style. */
export function formatDate(lang: GuestLocale, isoDate: string): string {
  const { y, m, d } = parts(isoDate);
  if (lang === 'en') return `${SHORT_EN[m - 1]} ${d}, ${y}`;
  if (lang === 'pt') return `${d} de ${SHORT_PT[m - 1]}. de ${y}`;
  return `${d} ${SHORT_ES[m - 1]}. ${y}`;
}

/** "del 29 de agosto al 02 de septiembre" — the shape the conserje already
 *  receives by hand today. Crew messages are Spanish only. */
export function stayRangeEs(arrival: string, departure: string): string {
  return `del ${longDateEs(arrival)} al ${longDateEs(departure)}`;
}

export function longDateEs(isoDate: string): string {
  const { m, d } = parts(isoDate);
  return `${String(d).padStart(2, '0')} de ${MONTHS_ES[m - 1]}`;
}

export interface BookingMessageInput {
  url: string;
  arrival: string;
  departure: string;
}

export function bookingMessage(lang: GuestLocale, input: BookingMessageInput): string {
  const from = formatDate(lang, input.arrival);
  const to = formatDate(lang, input.departure);
  if (lang === 'en') {
    return [
      `Thank you for booking with us from ${from} to ${to}! 🏠🤍`,
      `We're very excited to have you as our guest.`,
      ``,
      `⚠️ IMPORTANT ⚠️`,
      `For the building's front desk (conserjería) registration, please complete the information required for your stay at the following link:`,
      ``,
      `👉🏼 ${input.url}`,
      ``,
      `🚨 EVERY person staying in the apartment must be registered. The building requires this for security reasons, and the concierge on duty will ask for it.`,
      ``,
      `We'll send you the check-in details 3 days before your arrival in this chat.`,
      `Remember that completing this information is required to access the apartment 😊`,
      ``,
      `Thank you very much, and if you have any questions, we're here to help! 🫶🏼`,
    ].join('\n');
  }
  if (lang === 'pt') {
    return [
      `Obrigado por reservar com a gente de ${from} a ${to}! 🏠🤍`,
      `Estamos muito felizes em receber você como hóspede.`,
      ``,
      `⚠️ IMPORTANTE ⚠️`,
      `Para o registro na portaria (conserjería), pedimos que você preencha as informações necessárias para a sua estadia no link a seguir:`,
      ``,
      `👉🏼 ${input.url}`,
      ``,
      `🚨 TODAS as pessoas que ficarão no apartamento devem ser registradas obrigatoriamente. Essa informação é exigida por motivos de segurança do prédio e será solicitada pelo porteiro de plantão.`,
      ``,
      `Enviaremos as informações de entrada 3 dias antes da sua chegada por este chat.`,
      `Lembre-se de que é necessário preencher esses dados para poder entrar no apartamento 😊`,
      ``,
      `Muito obrigado e, em caso de dúvida, estamos à disposição! 🫶🏼`,
    ].join('\n');
  }
  return [
    `¡Gracias por reservar con nosotros del ${from} al ${to}! 🏠🤍`,
    `Estamos muy emocionados de tenerte como huésped.`,
    ``,
    `⚠️ IMPORTANTE ⚠️`,
    `Para el registro en conserjería, te pedimos por favor completar la información necesaria para tu estadía en el siguiente link:`,
    ``,
    `👉🏼 ${input.url}`,
    ``,
    `🚨 TODAS las personas que se alojarán en el departamento deben registrarse de manera obligatoria. Esta información es requerida por motivos de seguridad del edificio y será solicitada por el conserje de turno.`,
    ``,
    `Te enviaremos la información de ingreso 3 días antes de tu llegada por este chat.`,
    `Recuerda que es necesario completar estos datos para poder ingresar al departamento 😊`,
    ``,
    `Muchas gracias y cualquier duda, ¡estamos atentos! 🫶🏼`,
  ].join('\n');
}
