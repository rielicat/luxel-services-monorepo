import { SignIn } from '@clerk/nextjs';
import { LuxelMark } from '@/components/ui';

export default function SignInPage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6">
      <div className="flex items-center gap-2">
        <LuxelMark className="h-7 w-7" />
        <span className="font-display text-lg font-extrabold">Luxel · Operación</span>
      </div>
      <SignIn />
    </div>
  );
}
