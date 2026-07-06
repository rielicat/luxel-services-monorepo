import { SignUp } from '@clerk/nextjs';
import { AuthShell, authAppearance } from '@/components/auth/auth-shell';

export default function SignUpPage() {
  return (
    <AuthShell mode="sign-up">
      <SignUp appearance={authAppearance} />
    </AuthShell>
  );
}
