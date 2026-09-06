import { SignOutButton } from '@clerk/nextjs';
import { ShieldAlert } from 'lucide-react';
import { adminGateConfigured, requireAdmin } from '@/lib/admin';
import { Shell } from '@/components/shell';
import { LuxelMark, ghostButton } from '@/components/ui';

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();

  if (!admin) {
    const configured = adminGateConfigured();
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
        <LuxelMark className="h-10 w-10" />
        <ShieldAlert className="text-warning h-8 w-8" />
        <div>
          <h1 className="font-display text-xl font-bold">Acceso restringido</h1>
          <p className="text-muted-foreground mt-1 max-w-sm text-sm">
            {configured
              ? 'Tu cuenta no está en la organización de operación de Luxel. Entra con otra cuenta o pide que te agreguen.'
              : 'Este proyecto no tiene LUXEL_ADMIN_ORG_SLUG ni LUXEL_ADMIN_ORG_ID. Sin una de esas variables el panel no deja entrar a nadie.'}
          </p>
        </div>
        <SignOutButton>
          <button className={ghostButton}>Cerrar sesión</button>
        </SignOutButton>
      </div>
    );
  }

  return <Shell email={admin.email}>{children}</Shell>;
}
