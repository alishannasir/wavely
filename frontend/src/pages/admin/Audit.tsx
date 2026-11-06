import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import ChunkyButton from '../../components/ui/ChunkyButton';
import { AuditEntry, adminApi, timeAgo } from '../../lib/admin';

const PAGE = 50;
const LABEL: Record<string, string> = {
  REPORT_RESOLVED: 'Resolved a report',
  REPORT_ESCALATED: 'Escalated a report (legal hold)',
  HOLD_RELEASED: 'Released a legal hold',
  USER_STATUS: 'Changed a user’s status',
  ROLE_CHANGED: 'Changed a role',
  APPEAL_DECIDED: 'Decided an appeal',
};

function summary(e: AuditEntry): string {
  const m = (e.meta ?? {}) as Record<string, unknown>;
  if (e.action === 'REPORT_RESOLVED') return `${m.action}${m.reportsResolved ? ` (${m.reportsResolved} report${m.reportsResolved === 1 ? '' : 's'})` : ''}`;
  if (e.action === 'USER_STATUS') return `${m.from} → ${m.to}${m.note ? ` — ${m.note}` : ''}`;
  if (e.action === 'ROLE_CHANGED') return `${m.from} → ${m.to}`;
  if (e.action === 'APPEAL_DECIDED') return `${m.decision}${m.note ? ` — ${m.note}` : ''}`;
  if (e.action === 'REPORT_ESCALATED') return m.note ? `“${m.note}”` : '';
  return '';
}

/** Shared list used by the audit page and the report/user pages. */
export function AuditList({ items, empty }: { items: AuditEntry[]; empty: string }) {
  if (items.length === 0) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <ul className="divide-y divide-line">
      {items.map((e) => (
        <li key={e.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2 text-sm">
          <span className="w-24 shrink-0 text-xs text-muted" title={new Date(e.createdAt).toLocaleString()}>{timeAgo(e.createdAt)}</span>
          <span><strong>{e.actor?.displayName ?? e.actorId.slice(0, 8)}</strong> · {LABEL[e.action] ?? e.action}</span>
          <span className="text-muted">{summary(e)}</span>
          <span className="ml-auto flex gap-3 text-xs">
            {e.reportId && <Link className="text-accent hover:underline" to={`/admin/reports/${e.reportId}`}>report</Link>}
            {e.targetUserId && <Link className="text-accent hover:underline" to={`/admin/users/${e.targetUserId}`}>user</Link>}
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function Audit() {
  const [action, setAction] = useState('');
  const [page, setPage] = useState(0);
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['admin-audit', action, page],
    queryFn: () => adminApi.audit({ action: action || undefined, skip: page * PAGE, take: PAGE }),
  });
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE));
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <h1 className="font-display text-2xl font-semibold">Audit log</h1>
        <select aria-label="Action" className="rounded-xl border border-line bg-white px-3 py-2 text-sm" value={action} onChange={(e) => { setAction(e.target.value); setPage(0); }}>
          <option value="">All actions</option>
          {Object.entries(LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <span className="ml-auto text-sm text-muted">{data ? `${data.total} entries` : ''}</span>
      </div>
      <div className="rounded-2xl bg-white px-4 py-2 shadow-sm">
        {isLoading ? <p className="py-4 text-muted">Loading…</p> : isError ? <p role="alert" className="py-4 text-danger">{(error as Error).message}</p> : <AuditList items={data?.items ?? []} empty="Nothing logged yet." />}
      </div>
      {pages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <ChunkyButton size="sm" variant="neutral" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</ChunkyButton>
          <span className="text-sm text-muted">Page {page + 1} of {pages}</span>
          <ChunkyButton size="sm" variant="neutral" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>Next</ChunkyButton>
        </div>
      )}
    </div>
  );
}
