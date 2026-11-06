import { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useAuth } from '../../store/auth';

const ICONS = {
  chat: 'M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11l-4 4z',
  friends: 'M16 11a3 3 0 1 0-3-3 3 3 0 0 0 3 3zm-8 0a3 3 0 1 0-3-3 3 3 0 0 0 3 3zm0 2c-2.3 0-7 1.2-7 3.5V19h14v-2.5C15 14.2 10.3 13 8 13zm8 0c-.3 0-.6 0-1 .1 1.2.9 2 2 2 3.4V19h7v-2.5c0-2.3-4.700-3.500-8-3.500z',
  premium: 'M12 2l2.9 6.3 6.9.8-5.100 4.700 1.400 6.800L12 17.100 5.900 20.600l1.400-6.800L2.200 9.100l6.900-.8L12 2z',
  me: 'M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5zm0 2c-3.300 0-10 1.700-10 5v3h20v-3c0-3.300-6.700-5-10-5z',
} as const;

function Tab({ to, label, icon, dot }: { to: string; label: string; icon: string; dot?: boolean }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `relative flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 text-xs font-semibold transition-colors ${isActive ? 'text-brand' : 'text-muted'}`
      }
    >
      {({ isActive }): ReactNode => (
        <>
          <span className={`flex h-7 w-14 items-center justify-center rounded-full transition-colors ${isActive ? 'bg-brand-50' : ''}`}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill={isActive ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={isActive ? 0 : 1.8} strokeLinejoin="round" aria-hidden>
              <path d={icon} />
            </svg>
          </span>
          <span>{label}</span>
          {dot && <span aria-label="New" className="absolute right-[calc(50%-1.6rem)] top-2 h-2.5 w-2.5 rounded-full border-2 border-white bg-danger" />}
        </>
      )}
    </NavLink>
  );
}

/** App-style tab bar for phones (hidden from `md` up). Respects the iOS home-indicator safe area. */
export default function BottomNav() {
  const user = useAuth((s) => s.user);
  const { data: requests } = useQuery({
    queryKey: ['friend-requests'],
    queryFn: () => api<unknown[]>('/friends/requests'),
    enabled: Boolean(user && !user.isGuest),
    refetchInterval: 60_000,
    retry: false,
  });
  return (
    <nav aria-label="App" className="pb-safe z-30 flex shrink-0 border-t border-line bg-white md:hidden">
      <Tab to="/chat" label="Chat" icon={ICONS.chat} />
      <Tab to="/friends" label="Friends" icon={ICONS.friends} dot={Boolean(requests && requests.length > 0)} />
      <Tab to="/upgrade" label="Premium" icon={ICONS.premium} />
      <Tab to="/me" label="Profile" icon={ICONS.me} />
    </nav>
  );
}
