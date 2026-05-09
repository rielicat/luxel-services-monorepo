import { z } from 'zod';

export const QuoteRequestSchema = z.object({
  serviceTypeSlug: z.string().min(1),
  squareMeters: z.number().int().positive().max(2000),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  toolsProvidedBy: z.enum(['customer', 'company']),
  frequency: z.enum(['one_time', 'weekly', 'biweekly', 'monthly']),
});

export type QuoteRequest = z.infer<typeof QuoteRequestSchema>;

export const BookingDraftSchema = QuoteRequestSchema.extend({
  scheduledDate: z.string().date(),
  timeblock: z.enum(['manana', 'tarde']),
  addressLine: z.string().min(3).max(200),
  commune: z.string().min(2).max(80),
  region: z.string().min(2).max(80).default('Región Metropolitana'),
  notes: z.string().max(500).optional(),
});

export type BookingDraft = z.infer<typeof BookingDraftSchema>;
