import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge } from './AdminLayout';
import ChunkyButton from '../../components/ui/ChunkyButton';
import Modal from '../../components/ui/Modal';
import { api } from '../../lib/api';
import { timeAgo } from '../../lib/admin';
import { inputCls } from '../../lib/ui';
import { SkeletonRows } from '../../components/ui/Skeleton';

interface AppealRow {
  id: string;
  message: string;
  status: 'OPEN' | 'APPROVED' | 'REJECTED';
  createdAt: string;
  decidedAt: string | null;
  decisionNote: string | null;
  user: { id: string; displayName: string | null; email: string | null; status: string; createdAt: string };
}

export default function Appeals() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<'OPEN' | 'APPROVED' | 'REJECTED'>('OPEN');
  const [deciding, setDeciding] = useState<{ appeal: AppealRow; decision: 'APPROVE' | 'REJECT' } | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading, isError, error: loadError } = useQuery({
    queryKey: ['admin-appeals', status],
    queryFn: () => api<{ total: number; items: AppealRow[] }>(`/admin/appeals?status=${status}`),
  });
  const decide = useMutation({
    mutationFn: ({ appeal, decision }: { appeal: AppealRow; decision: 'APPROVE' | 'REJECT' }) =>
      api(`/admin/appeals/${appeal.id}/decide`, { method: 'POST', body: JSON.stringify({ decision, note: note || undefined }) }),
    onSuccess: () => {
      setDeciding(null);
      setNote('');
      setError(null);
      void qc.invalidateQueries({ queryKey: ['admin-appeals'] });
      void qc.invalidateQueries({ queryKey: ['admin-appeal-count'] });
    },
    onError: (e) => setError((e as Error).message),
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-3 font-display text-2xl font-semibold">Appeals</h1>
        {(['OPEN', 'APPROVED', 'REJECTED'] as const).map((s) => (
          <button key={s} onClick={() => setStatus(s)} aria-pressed={status === s} className={`rounded-full px-4 py-1.5 font-display ${status === s ? 'bg-ink text-white' : 'bg-white text-muted hover:text-ink'}`}>
            {s === 'OPEN' ? 'Open' : s === 'APPROVED' ? 'Approved' : 'Rejected'}
          </button>
        ))}
      </div>
      {isLoading && <SkeletonRows rows={3} />}
      {isError && <p role="alert" className="text-danger">{(loadError as Error).message}</p>}
      {data && data.items.length === 0 && <p className="rounded-2xl bg-white p-8 text-center text-muted">No appeals here.</p>}
      <ul className="flex flex-col gap-3">
        {data?.items.map((a) => (
          <li key={a.id} className="rounded-2xl bg-white p-4 shadow-sm">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Link to={`/admin/users/${a.user.id}`} className="font-semibold text-accent hover:underline">{a.user.displayName ?? a.user.email}</Link>
              <Badge tone="danger">{a.user.status.toLowerCase()}</Badge>
              <span className="text-xs text-muted">appealed {timeAgo(a.createdAt)}</span>
            </div>
            <p className="whitespace-pre-wrap rounded-xl bg-surface-2 p-3 text-sm">{a.message}</p>
            {a.status === 'OPEN' ? (
              <div className="mt-3 flex gap-2">
                <ChunkyButton size="sm" onClick={() => setDeciding({ appeal: a, decision: 'APPROVE' })}>Approve and restore</ChunkyButton>
                <ChunkyButton size="sm" variant="neutral" onClick={() => setDeciding({ appeal: a, decision: 'REJECT' })}>Reject</ChunkyButton>
                <Link to={`/admin/users/${a.user.id}`} className="ml-auto self-center text-sm text-accent hover:underline">Review their history</Link>
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted">{a.status === 'APPROVED' ? 'Approved' : 'Rejected'} {a.decidedAt && timeAgo(a.decidedAt)}{a.decisionNote ? ` — “${a.decisionNote}”` : ''}</p>
            )}
          </li>
        ))}
      </ul>

      <Modal open={deciding !== null} onClose={() => { setDeciding(null); setError(null); }} labelledBy="decide-title">
        {deciding && (
          <>
            <h2 id="decide-title" className="mb-2 font-display text-xl font-semibold text-brand">
              {deciding.decision === 'APPROVE' ? 'Approve this appeal?' : 'Reject this appeal?'}
            </h2>
            <p className="mb-3 text-sm text-muted">
              {deciding.decision === 'APPROVE'
                ? 'The account becomes active again and its device and IP bans are lifted.'
                : 'The account stays as it is. The user can appeal again after the waiting period.'}
              {' '}Your note is shown to the user.
            </p>
            <textarea className={`${inputCls} mb-3`} rows={3} maxLength={1000} placeholder="Note for the user (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
            {error && <p role="alert" className="mb-3 text-sm font-semibold text-danger">{error}</p>}
            <div className="flex gap-3">
              <ChunkyButton variant="neutral" className="flex-1" onClick={() => setDeciding(null)}>Cancel</ChunkyButton>
              <ChunkyButton variant={deciding.decision === 'APPROVE' ? 'accent' : 'danger'} className="flex-1" disabled={decide.isPending} onClick={() => decide.mutate(deciding)}>
                {deciding.decision === 'APPROVE' ? 'Approve' : 'Reject'}
              </ChunkyButton>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
