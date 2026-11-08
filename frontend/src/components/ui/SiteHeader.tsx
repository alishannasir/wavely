import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import Logo from '../brand/Logo';
import ChunkyButton from './ChunkyButton';
import { useAuth, useSignedInUser } from '../../store/auth';
import Avatar from './Avatar';
import ProfileMenu from './ProfileMenu';

const NAV = [
  { to: '/', label: 'Start' },
  { to: '/about', label: 'About' },
  { to: '/why', label: 'Why us' },
  { to: '/faq', label: 'FAQ' },
  { to: '/rules', label: 'Rules' },
];

/** White top bar for the marketing/content pages. `onStart` runs the start-chat flow. */
export default function SiteHeader({ onStart }: { onStart?: () => void }) {
  const { pathname } = useLocation();
  const user = useSignedInUser();
  const account = user && !user.isGuest ? user : null; // a real signed-in account (guests see the log-in link)
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link to="/" aria-label="Home">
          <Logo size={34} />
        </Link>
        <nav className="hidden items-center gap-7 md:flex" aria-label="Main">
          {NAV.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className={`border-b-2 py-1 font-display text-lg ${pathname === n.to ? 'border-accent text-brand' : 'border-transparent text-muted hover:text-ink'}`}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="hidden items-center gap-3 md:flex">
          {account ? (
            <ProfileMenu user={account} />
          ) : (
            <Link to="/login" className="font-display text-base text-brand hover:underline">
              Log in
            </Link>
          )}
          {onStart && (
            <ChunkyButton size="sm" onClick={onStart}>
              Start chatting
            </ChunkyButton>
          )}
        </div>
        <button
          className="rounded-lg p-2 md:hidden"
          aria-label="Menu"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          <span className="block h-0.5 w-6 bg-ink" />
          <span className="mt-1.5 block h-0.5 w-6 bg-ink" />
          <span className="mt-1.5 block h-0.5 w-6 bg-ink" />
        </button>
      </div>
      {open && (
        <nav className="border-t border-line bg-white px-4 py-3 md:hidden" aria-label="Mobile">
          {NAV.map((n) => (
            <Link key={n.to} to={n.to} onClick={() => setOpen(false)} className="block py-2 font-display text-lg text-ink">
              {n.label}
            </Link>
          ))}
          {account ? (
            <>
              <Link to="/me" onClick={() => setOpen(false)} className="flex items-center gap-3 border-t border-line py-3 font-display text-lg text-ink">
                <Avatar name={account.displayName} src={account.avatarUrl} size={36} />
                {account.displayName ?? 'Your profile'}
              </Link>
              <Link to="/friends" onClick={() => setOpen(false)} className="block py-2 font-display text-lg text-ink">Friends</Link>
              <Link to="/upgrade" onClick={() => setOpen(false)} className="block py-2 font-display text-lg text-ink">Premium</Link>
              <button type="button" onClick={() => { setOpen(false); useAuth.getState().logout(); }} className="block py-2 font-display text-lg text-muted">Log out</button>
            </>
          ) : (
            <Link to="/login" onClick={() => setOpen(false)} className="block py-2 font-display text-lg text-brand">
              Log in
            </Link>
          )}
          {onStart && (
            <ChunkyButton full className="mt-2" onClick={onStart}>
              Start chatting
            </ChunkyButton>
          )}
        </nav>
      )}
    </header>
  );
}
