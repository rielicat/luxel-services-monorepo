import type { Config } from 'tailwindcss';
import preset from '@luxel/config/tailwind/preset';

export default {
  presets: [preset],
  content: ['./src/**/*.{ts,tsx}'],
} satisfies Config;
