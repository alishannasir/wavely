import { ReactNode } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import Logo from '../../components/brand/Logo';
import { adminApi } from '../../lib/admin';
import { api } from '../../lib/api';
import { useAuth, useSignedInUser } from '../../store/auth';

export const Badge = ({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'danger' | 'warn' | 'brand' | 'ok' }) => {
  const cls = {
    muted: 'bg-surface-2 text-muted',
    danger: 'bg-danger/10 text-danger',
    warn: 'bg-amber-100 text-warn',
    brand: 'bg-brand-50 text-brand',
    ok: 'bg-emerald-100 text-emerald-800',
  }[tone];
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>{children}</span>;
};

/** Frame for the moderator interface. Only moderators/admins get past this; the API enforces it again. */
export default function AdminLayout() {
  const navigate = useNavigate();
  const user = useSignedInUser();
  const allowed = user?.role === 'MODERATOR' || user?.role === 'ADMIN';
  const { data: appealCount } = useQuery({ queryKey: ['admin-appeal-count'], queryFn: () => api<{ open: number }>('/admin/appeals/count'), enabled: allowed, refetchInterval: 30_000 });
  const { data: counts } = useQuery({ queryKey: ['admin-counts'], queryFn: adminApi.counts, enabled: allowed, refetchInterval: 30_000 });

  if (!allowed) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
        <h1 className="font-display text-2xl font-semibold text-brand">Moderators only</h1>
        <p className="text-muted">You do not have access to this area.</p>
        <button onClick={() => navigate('/chat')} className="font-semibold text-accent underline">Back to chat</button>
      </main>
    );
  }

  const tab = ({ isActive }: { isActive: boolean }) =>
    `rounded-full px-4 py-1.5 font-display text-base ${isActive ? 'bg-brand text-white' : 'text-muted hover:bg-white'}`;

  return (
    <div className="min-h-screen bg-page">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Link to="/admin" className="flex items-center gap-3">
            <Logo size={28} />
            <span className="font-display text-lg font-semibold text-ink">Moderation</span>
          </Link>
          <nav className="flex items-center gap-1" aria-label="Moderation">
            <NavLink to="/admin" end className={tab}>
              {({ isActive }) => (
                <>
                  Queue{' '}
                  {counts && counts.open + counts.reviewing > 0 && (
                    <span className={`ml-1 rounded-full px-1.5 text-xs font-bold ${isActive ? 'bg-white text-brand' : 'bg-danger text-white'}`}>
                      {counts.open + counts.reviewing}
                    </span>
                  )}
                </>
              )}
            </NavLink>
            <NavLink to="/admin/appeals" className={tab}>
              {({ isActive }) => (
                <>
                  Appeals{appealCount && appealCount.open > 0 && (
                    <span className={`ml-1 rounded-full px-1.5 text-xs font-bold ${isActive ? 'bg-white text-brand' : 'bg-danger text-white'}`}>{appealCount.open}</span>
                  )}
                </>
              )}
            </NavLink>
            <NavLink to="/admin/users" className={tab}>Users</NavLink>
            <NavLink to="/admin/audit" className={tab}>Audit log</NavLink>
          </nav>
          <span className="flex items-center gap-3 text-sm text-muted">
            {user?.displayName} <Badge tone="brand">{user?.role}</Badge>
            <Link to="/chat" className="font-semibold text-accent hover:underline">Back to app</Link>
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
