import { SignIn } from '@clerk/nextjs';
import { AuthShell, authAppearance } from '@/components/auth/auth-shell';

export default function SignInPage() {
  return (
    <AuthShell mode="sign-in">
      <SignIn appearance={authAppearance} />
    </AuthShell>
  );
}
