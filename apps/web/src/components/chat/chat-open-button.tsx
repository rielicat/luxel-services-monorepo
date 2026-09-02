'use client';

import type { ComponentProps } from 'react';
import { Button } from '@/components/ui/button';
import { CHAT_OPEN_EVENT } from './open-event';

export function ChatOpenButton({
  variant = 'outline',
  size = 'xl',
  ...props
}: Omit<ComponentProps<typeof Button>, 'asChild' | 'onClick' | 'type'>) {
  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      onClick={() => window.dispatchEvent(new Event(CHAT_OPEN_EVENT))}
      {...props}
    />
  );
}
