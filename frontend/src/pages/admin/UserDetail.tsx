import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge } from './AdminLayout';
import { AuditList } from './Audit';
import ChunkyButton from '../../components/ui/ChunkyButton';
import Modal from '../../components/ui/Modal';
import { REASON_LABEL, adminApi, timeAgo } from '../../lib/admin';
import { inputCls } from '../../lib/ui';
import { useAuth } from '../../store/auth';

type Act = 'SUSPEND' | 'BAN' | 'RESTORE';

export default function UserDetail() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const me = useAuth((s) => s.user);
  const [act, setAct] = useState<Act | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { data, isLoading, isError, error: loadError } = useQuery({ queryKey: ['admin-user', id], queryFn: () => adminApi.user(id) });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['admin-user', id] });
    void qc.invalidateQueries({ queryKey: ['admin-users'] });
  };
  const status = useMutation({
    mutationFn: (a: Act) => adminApi.setStatus(id, a, note || undefined),
    onSuccess: () => { setAct(null); setNote(''); setError(null); refresh(); },
    onError: (e) => setError((e as Error).message),
  });
  const role = useMutation({
    mutationFn: (r: 'USER' | 'MODERATOR' | 'ADMIN') => adminApi.setRole(id, r),
    onSuccess: refresh,
    onError: (e) => setError((e as Error).message),
  });

  if (isLoading) return <p className="text-muted">Loading…</p>;
  if (isError || !data) return <p role="alert" className="text-danger">{(loadError as Error)?.message ?? 'User not found'}</p>;
  const { user, reportsReceived, reportsMade, recentReports, bans, audit } = data;
  const isSelf = me?.id === user.id;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/admin/users" className="text-sm font-semibold text-accent hover:underline">← Users</Link>
        <h1 className="font-display text-2xl font-semibold">{user.displayName ?? user.id}</h1>
        {user.isGuest && <Badge>guest</Badge>}
        {user.role !== 'USER' && <Badge tone="brand">{user.role}</Badge>}
        <Badge tone={user.status === 'ACTIVE' ? 'ok' : 'danger'}>{user.status.toLowerCase()}</Badge>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl bg-white p-4 shadow-sm">
          <h2 className="mb-2 font-display text-lg font-semibold text-brand">Account</h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted">Id</dt><dd className="break-all">{user.id}</dd>
            <dt className="text-muted">Email</dt><dd>{user.email ?? '—'}</dd>
            <dt className="text-muted">Joined</dt><dd>{timeAgo(user.createdAt)}</dd>
            <dt className="text-muted">Country</dt><dd>{user.country ?? '—'}</dd>
            <dt className="text-muted">Last IP</dt><dd>{user.lastIp ?? '—'}</dd>
            <dt className="text-muted">Last device</dt><dd className="break-all">{user.lastDeviceId ?? '—'}</dd>
            <dt className="text-muted">Shadow queue</dt><dd>{user.flaggedUntil && new Date(user.flaggedUntil) > new Date() ? `until ${new Date(user.flaggedUntil).toLocaleString()}` : 'no'}</dd>
          </dl>
          {!isSelf && (
            <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-3">
              {user.status === 'ACTIVE' ? (
                <>
                  <ChunkyButton size="sm" variant="brand" onClick={() => setAct('SUSPEND')}>Suspend</ChunkyButton>
                  <ChunkyButton size="sm" variant="danger" onClick={() => setAct('BAN')}>Ban</ChunkyButton>
                </>
              ) : (
                <ChunkyButton size="sm" variant="neutral" onClick={() => setAct('RESTORE')}>Restore</ChunkyButton>
              )}
            </div>
          )}
          {me?.role === 'ADMIN' && !isSelf && !user.isGuest && (
            <label className="mt-3 flex items-center gap-2 text-sm text-muted">
              Role
              <select className="rounded-xl border border-line bg-white px-3 py-1.5" value={user.role} onChange={(e) => role.mutate(e.target.value as 'USER' | 'MODERATOR' | 'ADMIN')} disabled={role.isPending}>
                <option value="USER">User</option>
                <option value="MODERATOR">Moderator</option>
                <option value="ADMIN">Administrator</option>
              </select>
            </label>
          )}
          {error && !act && <p role="alert" className="mt-2 text-sm font-semibold text-danger">{error}</p>}
        </section>

        <section className="rounded-2xl bg-white p-4 shadow-sm">
          <h2 className="mb-2 font-display text-lg font-semibold text-brand">Reports</h2>
          <p className="mb-2 text-sm text-muted">
            Against them: {reportsReceived.length ? reportsReceived.map((r) => `${r.count} ${r.status.toLowerCase()}`).join(', ') : 'none'} · Filed by them: {reportsMade}
          </p>
          <ul className="divide-y divide-line">
            {recentReports.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2 py-1.5 text-sm">
                <Link className="font-semibold text-accent hover:underline" to={`/admin/reports/${r.id}`}>{REASON_LABEL[r.reasonCode]}</Link>
                <Badge>{r.status.toLowerCase()}{r.resolution ? ` · ${r.resolution.toLowerCase()}` : ''}</Badge>
                {r.legalHold && <Badge tone="danger">hold</Badge>}
                <span className="ml-auto text-xs text-muted">{timeAgo(r.createdAt)}</span>
              </li>
            ))}
            {recentReports.length === 0 && <li className="py-1.5 text-sm text-muted">No reports against this user.</li>}
          </ul>
          {bans.length > 0 && (
            <div className="mt-3 border-t border-line pt-3">
              <h3 className="mb-1 text-sm font-semibold">Active device / IP bans</h3>
              <ul className="text-sm text-muted">
                {bans.map((b) => <li key={b.id}>{b.type}: <span className="break-all">{b.value}</span>{b.expiresAt ? ` (until ${new Date(b.expiresAt).toLocaleDateString()})` : ''}</li>)}
              </ul>
            </div>
          )}
        </section>
      </div>

      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="mb-2 font-display text-lg font-semibold text-brand">Moderation history</h2>
        <AuditList items={audit} empty="No moderator actions on this user." />
      </section>

      <Modal open={act !== null} onClose={() => { setAct(null); setError(null); }} labelledBy="user-act-title">
        {act && (
          <>
            <h2 id="user-act-title" className="mb-2 font-display text-xl font-semibold text-brand">
              {act === 'BAN' ? 'Ban' : act === 'SUSPEND' ? 'Suspend' : 'Restore'} {user.displayName ?? 'this user'}?
            </h2>
            <p className="mb-3 text-sm text-muted">
              {act === 'BAN' ? 'The account, and the device and IP they were last seen with, are banned.' : act === 'SUSPEND' ? 'They cannot match or call until restored.' : 'The account is active again and device/IP bans tied to it are lifted.'}
            </p>
            <textarea className={`${inputCls} mb-3`} rows={2} maxLength={500} placeholder="Reason (kept in the audit log)" value={note} onChange={(e) => setNote(e.target.value)} />
            {error && <p role="alert" className="mb-3 text-sm font-semibold text-danger">{error}</p>}
            <div className="flex gap-3">
              <ChunkyButton variant="neutral" className="flex-1" onClick={() => setAct(null)}>Cancel</ChunkyButton>
              <ChunkyButton variant={act === 'BAN' ? 'danger' : act === 'SUSPEND' ? 'brand' : 'neutral'} className="flex-1" disabled={status.isPending} onClick={() => status.mutate(act)}>
                {act === 'BAN' ? 'Ban' : act === 'SUSPEND' ? 'Suspend' : 'Restore'}
              </ChunkyButton>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
