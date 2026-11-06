import { FormEvent, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import PageShell, { Card } from '../components/ui/PageShell';
import ChunkyButton from '../components/ui/ChunkyButton';
import { api } from '../lib/api';
import { inputCls } from '../lib/ui';

interface Lookup {
  status: 'ACTIVE' | 'SUSPENDED' | 'BANNED';
  canAppeal: boolean;
  appeal: { status: 'OPEN' | 'APPROVED' | 'REJECTED'; createdAt: string; decidedAt: string | null; decisionNote: string | null } | null;
  nextAppealAt: string | null;
}

const MIN = 20;

/** Public page for a suspended or banned user: sign in with email and password, then ask for a review. */
export default function Appeal() {
  const [params] = useSearchParams();
  const [email, setEmail] = useState(params.get('email') ?? '');
  const [password, setPassword] = useState('');
  const [info, setInfo] = useState<Lookup | null>(null);
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function check(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      setInfo(await api<Lookup>('/appeals/lookup', { method: 'POST', body: JSON.stringify({ email, password }) }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api('/appeals', { method: 'POST', body: JSON.stringify({ email, password, message }) });
      setSent(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageShell center>
      <Card className="max-w-lg">
        <h1 className="mb-1 text-center font-display text-3xl font-semibold text-brand">Appeal a decision</h1>
        <p className="mb-5 text-center text-sm text-muted">
          If your account was suspended or banned and you think it was a mistake, tell us. A moderator will review it.
        </p>

        {sent ? (
          <div className="text-center" role="status">
            <div className="mb-2 text-4xl" aria-hidden>📨</div>
            <p className="font-semibold">Your appeal was sent.</p>
            <p className="mt-1 text-sm text-muted">A moderator will review it. Come back to this page with your email and password to see the answer.</p>
          </div>
        ) : !info ? (
          <form onSubmit={check} className="flex flex-col gap-3">
            <input type="email" required placeholder="Email" aria-label="Email" autoComplete="email" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} />
            <input type="password" required placeholder="Password" aria-label="Password" autoComplete="current-password" className={inputCls} value={password} onChange={(e) => setPassword(e.target.value)} />
            {error && <p role="alert" className="text-sm font-semibold text-danger">{error}</p>}
            <ChunkyButton full disabled={busy}>Check my account</ChunkyButton>
            <p className="text-xs text-muted">Only accounts with an email and password can appeal here.</p>
          </form>
        ) : info.status === 'ACTIVE' ? (
          <div className="text-center">
            <p className="mb-3 font-semibold">Your account is active.</p>
            {info.appeal?.status === 'APPROVED' && <p className="mb-3 text-sm text-muted">Your appeal was approved.{info.appeal.decisionNote ? ` “${info.appeal.decisionNote}”` : ''}</p>}
            <ChunkyButton to="/login">Log in</ChunkyButton>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="rounded-2xl bg-danger/10 p-3 text-sm">
              Your account is <strong>{info.status === 'BANNED' ? 'banned' : 'suspended'}</strong>.
            </p>
            {info.appeal?.status === 'OPEN' && <p className="rounded-2xl bg-brand-50 p-3 text-sm">Your appeal is under review. Please check back later.</p>}
            {info.appeal?.status === 'REJECTED' && (
              <p className="rounded-2xl bg-surface-2 p-3 text-sm">
                Your last appeal was not approved{info.appeal.decisionNote ? `: “${info.appeal.decisionNote}”` : '.'}
                {info.nextAppealAt && <> You can appeal again after {new Date(info.nextAppealAt).toLocaleDateString()}.</>}
              </p>
            )}
            {info.canAppeal && (
              <form onSubmit={submit} className="flex flex-col gap-3">
                <label className="flex flex-col gap-1 text-sm text-muted">
                  What happened? Why should we reconsider?
                  <textarea className={inputCls} rows={5} maxLength={2000} required value={message} onChange={(e) => setMessage(e.target.value)} />
                </label>
                <p className={`text-xs ${message.trim().length < MIN ? 'text-muted' : 'text-emerald-700'}`}>{message.trim().length} / at least {MIN} characters</p>
                {error && <p role="alert" className="text-sm font-semibold text-danger">{error}</p>}
                <ChunkyButton full disabled={busy || message.trim().length < MIN}>Send appeal</ChunkyButton>
              </form>
            )}
          </div>
        )}
        <Link to="/rules" className="mt-5 block text-center text-sm text-accent underline">Read the chat rules</Link>
      </Card>
    </PageShell>
  );
}
