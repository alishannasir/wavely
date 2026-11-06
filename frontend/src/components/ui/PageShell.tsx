import { ReactNode } from 'react';
import DoodleBackground from './DoodleBackground';
import SiteHeader from './SiteHeader';
import SiteFooter from './SiteFooter';
import { useStartChat } from './StartChat';

/** Header + doodle background + footer. The start-chat flow is wired to the header button. */
export default function PageShell({
  children,
  tone = 'light',
  center = false,
}: {
  children: ReactNode;
  tone?: 'light' | 'brand';
  /** Vertically centre the content (auth/forms). */
  center?: boolean;
}) {
  const { start, modal } = useStartChat();
  return (
    <DoodleBackground tone={tone} className="flex min-h-screen flex-col">
      <SiteHeader onStart={start} />
      <main className={`mx-auto w-full max-w-6xl flex-1 px-4 py-8 ${center ? 'flex flex-col justify-center' : ''}`}>{children}</main>
      <SiteFooter />
      {modal}
    </DoodleBackground>
  );
}

/** A white card for forms on a doodle page. */
export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-md rounded-3xl bg-white p-6 text-ink shadow-xl md:p-8 ${className}`}>{children}</div>;
}
