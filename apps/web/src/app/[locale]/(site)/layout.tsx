import { Nav } from '@/components/landing/nav';
import { Footer } from '@/components/landing/footer';
import { ChatWidget } from '@/components/chat/chat-widget';

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Nav />
      <div className="min-h-[calc(100dvh-128px)]">{children}</div>
      <Footer />
      <ChatWidget />
    </>
  );
}
