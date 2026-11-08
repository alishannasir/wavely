import { ReactNode, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge } from './AdminLayout';
import { AuditList } from './Audit';
import ChunkyButton from '../../components/ui/ChunkyButton';
import Modal from '../../components/ui/Modal';
import { REASON_LABEL, adminApi, daysUntil, timeAgo } from '../../lib/admin';
import { inputCls } from '../../lib/ui';
import { useAuth } from '../../store/auth';
import { SkeletonDetail } from '../../components/ui/Skeleton';

type Pending = 'DISMISS' | 'SUSPEND' | 'BAN' | 'RESTORE' | 'ESCALATE' | 'RELEASE';

const COPY: Record<Pending, { title: string; body: string; button: string; variant: 'danger' | 'neutral' | 'brand' }> = {
  DISMISS: { title: 'Dismiss this report?', body: 'No action is taken against the user. All open reports about them are closed and their shadow-queue flag is cleared.', button: 'Dismiss', variant: 'neutral' },
  SUSPEND: { title: 'Suspend this user?', body: 'They are logged out of matching immediately. Open reports about them are closed and their evidence is kept for 90 days. You can restore them later.', button: 'Suspend', variant: 'brand' },
  BAN: { title: 'Ban this user?', body: 'The account is banned, and so are the device and IP they were last seen with (device 90 days, IP 7 days). Open reports are closed and evidence is kept for 90 days.', button: 'Ban', variant: 'danger' },
  RESTORE: { title: 'Restore this user?', body: 'The account becomes active again and any device/IP bans tied to it are lifted. Open reports about them are closed.', button: 'Restore', variant: 'neutral' },
  ESCALATE: { title: 'Escalate for legal handling?', body: 'The evidence is put under legal hold: it is never auto-deleted until an administrator releases it. Use this for suspected child abuse or other serious cases. Filing a report with NCMEC / IWF is a manual step (see docs/MODERATION.md); this only preserves the evidence.', button: 'Escalate and hold', variant: 'danger' },
  RELEASE: { title: 'Release the legal hold?', body: 'The normal retention period applies again (30 days from now), after which the evidence is deleted. Only release when counsel confirms it is no longer needed.', button: 'Release hold', variant: 'neutral' },
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm">
      <h2 className="mb-2 font-display text-lg font-semibold text-brand">{title}</h2>
      {children}
    </section>
  );
}

/** Review one report: evidence, context, and the actions. Keyboard: d dismiss, s suspend, b ban (each asks to confirm). */
export default function ReportDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const role = useAuth((s) => s.user?.role);
  const [pending, setPending] = useState<Pending | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data: r, isLoading, isError, error: loadError } = useQuery({ queryKey: ['admin-report', id], queryFn: () => adminApi.report(id) });

  const run = useMutation({
    mutationFn: async (action: Pending) => {
      if (action === 'ESCALATE') return adminApi.escalate(id, note || undefined);
      if (action === 'RELEASE') return adminApi.releaseHold(id);
      return adminApi.resolve(id, action);
    },
    onSuccess: (_d, action) => {
      setPending(null);
      setNote('');
      setError(null);
      void qc.invalidateQueries({ queryKey: ['admin-report', id] });
      void qc.invalidateQueries({ queryKey: ['admin-reports'] });
      void qc.invalidateQueries({ queryKey: ['admin-counts'] });
      if (action === 'DISMISS' || action === 'SUSPEND' || action === 'BAN' || action === 'RESTORE') navigate('/admin');
    },
    onError: (e) => setError((e as Error).message),
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(t.tagName) || document.querySelector('[aria-modal="true"]')) return;
      if (r?.status === 'RESOLVED') return; // the buttons are disabled for a closed report; so are the shortcuts
      if (e.key === 'd') setPending('DISMISS');
      else if (e.key === 's') setPending('SUSPEND');
      else if (e.key === 'b') setPending('BAN');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [r?.status]);

  if (isLoading) return <SkeletonDetail />;
  if (isError || !r) return <p role="alert" className="text-danger">{(loadError as Error)?.message ?? 'Report not found'}</p>;

  const left = daysUntil(r.evidenceExpiresAt);
  const resolved = r.status === 'RESOLVED';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/admin" className="text-sm font-semibold text-accent hover:underline">← Queue</Link>
        <h1 className="font-display text-2xl font-semibold">Report about {r.reported.displayName ?? 'unknown'}</h1>
        <Badge tone={r.reasonCode === 'MINOR_CONCERN' ? 'danger' : 'warn'}>{REASON_LABEL[r.reasonCode]}</Badge>
        <Badge>{r.status === 'REVIEWING' ? 'in review' : r.status.toLowerCase()}</Badge>
        {r.source === 'AUTO_NSFW' && <Badge tone="brand">Automatic{r.nsfwScore !== null ? ` · ${Math.round(r.nsfwScore * 100)}%` : ''}</Badge>}
        {r.legalHold && <Badge tone="danger">LEGAL HOLD</Badge>}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <div className="flex flex-col gap-4">
          <Section title="Evidence">
            {r.evidenceImage ? (
              <img src={r.evidenceImage} alt="Frame of the reported user's video" className="max-h-96 rounded-xl border border-line" />
            ) : (
              <p className="text-sm text-muted">No screenshot{r.evidenceExpiresAt === null && !r.legalHold ? ' (deleted after the retention period, or never captured)' : ''}.</p>
            )}
            <p className="mt-2 text-xs text-muted">
              {r.legalHold ? 'Kept under legal hold: never auto-deleted.' : left !== null ? `Evidence is deleted in ${left} day${left === 1 ? '' : 's'}.` : ''}
            </p>
          </Section>

          <Section title="Chat before the report">
            {r.chatLog && r.chatLog.length > 0 ? (
              <div className="flex max-h-72 flex-col gap-1.5 overflow-y-auto">
                {r.chatLog.map((m, i) => (
                  <div key={i} className={`max-w-[80%] rounded-2xl px-3 py-1.5 text-sm ${m.from === 'reported' ? 'self-start bg-danger/10' : 'self-end bg-brand-50'}`}>
                    <span className="block text-[10px] font-semibold uppercase text-muted">{m.from === 'reported' ? 'Reported user' : 'Reporter'}</span>
                    {m.text}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted">No chat messages were sent.</p>
            )}
          </Section>
        </div>

        <div className="flex flex-col gap-4">
          <Section title="Decision">
            {resolved && <p className="mb-2 text-sm">Resolved as <strong>{r.resolution}</strong> {r.reviewedAt && timeAgo(r.reviewedAt)}.</p>}
            <div className="flex flex-wrap gap-2">
              <ChunkyButton size="sm" variant="neutral" onClick={() => setPending('DISMISS')} disabled={resolved}>Dismiss <kbd className="text-xs opacity-60">d</kbd></ChunkyButton>
              <ChunkyButton size="sm" variant="brand" onClick={() => setPending('SUSPEND')} disabled={resolved}>Suspend <kbd className="text-xs opacity-60">s</kbd></ChunkyButton>
              <ChunkyButton size="sm" variant="danger" onClick={() => setPending('BAN')} disabled={resolved}>Ban <kbd className="text-xs opacity-60">b</kbd></ChunkyButton>
              {r.reported.status !== 'ACTIVE' && <ChunkyButton size="sm" variant="neutral" onClick={() => setPending('RESTORE')}>Restore user</ChunkyButton>}
            </div>
            <div className="mt-4 border-t border-line pt-3">
              {!r.legalHold ? (
                <ChunkyButton size="sm" variant="danger" onClick={() => setPending('ESCALATE')}>Escalate (legal hold)</ChunkyButton>
              ) : (
                <>
                  <p className="mb-2 text-sm">Escalated {r.escalatedAt && timeAgo(r.escalatedAt)}{r.escalationNote ? `: “${r.escalationNote}”` : ''}.</p>
                  {role === 'ADMIN' ? (
                    <ChunkyButton size="sm" variant="neutral" onClick={() => setPending('RELEASE')}>Release hold (admin)</ChunkyButton>
                  ) : (
                    <p className="text-xs text-muted">Only an administrator can release a legal hold.</p>
                  )}
                </>
              )}
            </div>
          </Section>

          <Section title="Reported user">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-muted">Name</dt><dd><Link className="font-semibold text-accent hover:underline" to={`/admin/users/${r.reported.id}`}>{r.reported.displayName ?? r.reported.id}</Link></dd>
              <dt className="text-muted">Account</dt><dd>{r.reported.isGuest ? 'Guest' : 'Registered'} · created {timeAgo(r.reported.createdAt)}</dd>
              <dt className="text-muted">Status</dt><dd>{r.reported.status}</dd>
              <dt className="text-muted">Reports</dt><dd>{r.reportedUserReportCounts.map((c) => `${c.count} ${c.status.toLowerCase()}`).join(', ') || 'none'}</dd>
            </dl>
          </Section>

          <Section title="Reporter">
            <p className="text-sm">{r.reporter.displayName ?? r.reporter.id} · account created {timeAgo(r.reporter.createdAt)}</p>
          </Section>
        </div>
      </div>

      <Section title="History of this report">
        <AuditList items={r.audit} empty="No actions yet." />
      </Section>

      <Modal open={pending !== null} onClose={() => { setPending(null); setError(null); }} labelledBy="confirm-title">
        {pending && (
          <>
            <h2 id="confirm-title" className="mb-2 font-display text-xl font-semibold text-brand">{COPY[pending].title}</h2>
            <p className="mb-3 text-sm text-muted">{COPY[pending].body}</p>
            {pending === 'ESCALATE' && (
              <textarea className={`${inputCls} mb-3`} rows={3} maxLength={500} placeholder="Note for the record (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
            )}
            {error && <p role="alert" className="mb-3 text-sm font-semibold text-danger">{error}</p>}
            <div className="flex gap-3">
              <ChunkyButton variant="neutral" className="flex-1" onClick={() => setPending(null)}>Cancel</ChunkyButton>
              <ChunkyButton variant={COPY[pending].variant} className="flex-1" disabled={run.isPending} onClick={() => run.mutate(pending)}>
                {COPY[pending].button}
              </ChunkyButton>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
