import { ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import Logo from '../brand/Logo';
import BottomNav from './BottomNav';
import { useAuth } from '../../store/auth';

const LINKS = [
  { to: '/chat', label: 'Chat' },
  { to: '/friends', label: 'Friends' },
  { to: '/upgrade', label: 'Premium' },
  { to: '/me', label: 'Profile' },
];

/**
 * Frame for the signed-in app screens (friends, premium, profile).
 * Phones: slim top bar + scrolling content + bottom tab bar, like a native app.
 * Desktop: a top bar with the same links.
 */
export default function AppShell({ title, children }: { title?: string; children: ReactNode }) {
  const user = useAuth((s) => s.user);
  return (
    <div className="flex h-[100dvh] flex-col bg-page">
      <header className="pt-safe shrink-0 border-b border-line bg-white">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-4 px-4">
          <Link to="/chat" aria-label="Chat">
            <Logo size={30} />
          </Link>
          {title && <h1 className="font-display text-lg font-semibold text-ink md:hidden">{title}</h1>}
          <nav className="hidden items-center gap-6 font-display text-lg md:flex" aria-label="Main">
            {LINKS.map((l) => (
              <NavLink key={l.to} to={l.to} className={({ isActive }) => (isActive ? 'text-brand underline decoration-2 underline-offset-8' : 'text-muted hover:text-ink')}>
                {l.label}
              </NavLink>
            ))}
          </nav>
          <span className="w-8 md:hidden" aria-hidden />
          <span className="hidden text-sm text-muted md:block">{user?.displayName}</span>
        </div>
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto w-full max-w-5xl px-4 py-5">{children}</div>
      </main>
      <BottomNav />
    </div>
  );
}
