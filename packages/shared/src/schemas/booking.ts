import { z } from 'zod';

export const QuoteRequestSchema = z.object({
  serviceTypeSlug: z.string().min(1),
  squareMeters: z.number().int().positive().max(2000),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  toolsProvidedBy: z.enum(['customer', 'company']),
  frequency: z.enum(['one_time', 'weekly', 'biweekly', 'monthly']),
});
