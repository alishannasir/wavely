import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Badge } from './AdminLayout';
import ChunkyButton from '../../components/ui/ChunkyButton';
import { REASON_LABEL, ReportStatus, adminApi, daysUntil, timeAgo } from '../../lib/admin';
import { flagEmoji } from '../../lib/flag';
import { SkeletonRows } from '../../components/ui/Skeleton';

const PAGE = 25;
const selectCls = 'rounded-xl border border-line bg-white px-3 py-2 text-sm';

/** Report queue. Keyboard: j / k move, Enter opens. Held and possible-minor reports come first. */
export default function Queue() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<ReportStatus>('OPEN');
  const [reason, setReason] = useState('');
  const [source, setSource] = useState('');
  const [hold, setHold] = useState(false);
  const [page, setPage] = useState(0);
  const [sel, setSel] = useState(0);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['admin-reports', status, reason, source, hold, page],
    queryFn: () => adminApi.reports({ status, reason: reason || undefined, source: source || undefined, hold, skip: page * PAGE, take: PAGE }),
  });
  const items = data?.items ?? [];

  useEffect(() => setSel(0), [status, reason, source, hold, page]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(t.tagName) || document.querySelector('[aria-modal="true"]')) return;
      if (e.key === 'j') setSel((s) => Math.min(s + 1, items.length - 1));
      else if (e.key === 'k') setSel((s) => Math.max(s - 1, 0));
      else if (e.key === 'Enter' && items[sel]) navigate(`/admin/reports/${items[sel].id}`);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [items, sel, navigate]);

  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {(['OPEN', 'REVIEWING', 'RESOLVED'] as ReportStatus[]).map((s) => (
          <button
            key={s}
            onClick={() => { setStatus(s); setPage(0); }}
            aria-pressed={status === s}
            className={`rounded-full px-4 py-1.5 font-display ${status === s ? 'bg-ink text-white' : 'bg-white text-muted hover:text-ink'}`}
          >
            {s === 'OPEN' ? 'Open' : s === 'REVIEWING' ? 'In review' : 'Resolved'}
          </button>
        ))}
        <span className="mx-2 h-6 w-px bg-line" />
        <select aria-label="Reason" className={selectCls} value={reason} onChange={(e) => { setReason(e.target.value); setPage(0); }}>
          <option value="">All reasons</option>
          {Object.entries(REASON_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select aria-label="Source" className={selectCls} value={source} onChange={(e) => { setSource(e.target.value); setPage(0); }}>
          <option value="">All sources</option>
          <option value="USER">Filed by a person</option>
          <option value="AUTO_NSFW">Automatic (classifier)</option>
        </select>
        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={hold} onChange={(e) => { setHold(e.target.checked); setPage(0); }} /> Legal hold only
        </label>
        <span className="ml-auto text-sm text-muted">{data ? `${data.total} report${data.total === 1 ? '' : 's'}` : ''} · <kbd className="rounded bg-white px-1">j</kbd>/<kbd className="rounded bg-white px-1">k</kbd> move, <kbd className="rounded bg-white px-1">Enter</kbd> open</span>
      </div>

      {isLoading && <SkeletonRows rows={4} />}
      {isError && (
        <p role="alert" className="rounded-2xl bg-white p-4 text-danger">
          {(error as Error).message} <button className="font-semibold underline" onClick={() => refetch()}>Retry</button>
        </p>
      )}
      {data && items.length === 0 && <p className="rounded-2xl bg-white p-8 text-center text-muted">Nothing here. 🎉</p>}

      <ul className="flex flex-col gap-2">
        {items.map((r, i) => {
          const left = daysUntil(r.evidenceExpiresAt);
          return (
            <li key={r.id}>
              <Link
                to={`/admin/reports/${r.id}`}
                className={`flex flex-wrap items-center gap-x-4 gap-y-1 rounded-2xl bg-white p-4 shadow-sm transition hover:shadow ${i === sel ? 'ring-2 ring-brand' : ''}`}
              >
                <span className="flex min-w-[10rem] flex-col">
                  <span className="font-semibold">{r.reported.displayName ?? 'Unknown'} {r.reported.country && <span title={r.reported.country}>{flagEmoji(r.reported.country)}</span>}</span>
                  <span className="text-xs text-muted">reported {timeAgo(r.createdAt)}</span>
                </span>
                <span className="flex flex-wrap items-center gap-1.5">
                  <Badge tone={r.reasonCode === 'MINOR_CONCERN' ? 'danger' : r.reasonCode === 'NUDITY' ? 'warn' : 'muted'}>{REASON_LABEL[r.reasonCode]}</Badge>
                  {r.source === 'AUTO_NSFW' && <Badge tone="brand">Auto{r.nsfwScore !== null ? ` ${Math.round(r.nsfwScore * 100)}%` : ''}</Badge>}
                  {r.legalHold && <Badge tone="danger">Legal hold</Badge>}
                  {r.reported.status !== 'ACTIVE' && <Badge tone="warn">{r.reported.status.toLowerCase()}</Badge>}
                  {r.reported.flaggedUntil && new Date(r.reported.flaggedUntil) > new Date() && <Badge tone="muted">shadow queue</Badge>}
                </span>
                <span className="ml-auto text-xs text-muted">
                  by {r.reporter.displayName ?? '?'}{left !== null && !r.legalHold ? ` · evidence ${left} d left` : ''}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

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
