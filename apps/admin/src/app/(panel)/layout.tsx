import { SignOutButton } from '@clerk/nextjs';
import { ShieldAlert } from 'lucide-react';
import { requireAdmin } from '@/lib/admin';
import { Shell } from '@/components/shell';
import { LuxelMark } from '@/components/ui';

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();

  if (!admin) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
        <LuxelMark className="h-10 w-10" />
        <ShieldAlert className="text-warning h-8 w-8" />
        <div>
          <h1 className="font-display text-xl font-bold">Acceso restringido</h1>
          <p className="text-muted-foreground mt-1 max-w-sm text-sm">
            Tu cuenta no tiene permisos para el panel de operación. Contacta a un administrador o
            inicia sesión con otra cuenta.
          </p>
        </div>
        <SignOutButton>
          <button className="border-border hover:bg-accent rounded-lg border px-4 py-2 text-sm font-medium">
            Cerrar sesión
          </button>
        </SignOutButton>
      </div>
    );
  }

  return <Shell email={admin.email}>{children}</Shell>;
}
