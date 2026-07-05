import { SignIn } from '@clerk/nextjs';

export default function SignInPage() {
  return (
    <main className="container flex min-h-[calc(100dvh-8rem)] items-center justify-center py-12">
      <SignIn
        appearance={{
          variables: {
            colorPrimary: 'hsl(175 78% 26%)',
            borderRadius: '0.75rem',
            fontFamily: 'var(--font-sans)',
          },
          elements: { card: 'shadow-card' },
        }}
      />
    </main>
  );
}
