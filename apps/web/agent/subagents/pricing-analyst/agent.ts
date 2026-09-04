import { defineAgent } from 'eve';
import { AI_GATEWAY_MODEL } from '@luxel/core/ai/model';

export default defineAgent({
  description:
    'Analiza el precio por noche y la ocupación de una propiedad que administra Luxel, y deja notas para el equipo. Trabaja en segundo plano y puede tardar. No responde a huéspedes ni a visitantes.',
  model: AI_GATEWAY_MODEL,
  reasoning: 'medium',
});
