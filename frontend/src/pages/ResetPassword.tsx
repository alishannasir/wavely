import { FormEvent, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import PageShell, { Card } from '../components/ui/PageShell';
import ChunkyButton from '../components/ui/ChunkyButton';
import { api } from '../lib/api';
import { inputCls } from '../lib/ui';

export default function ResetPassword() {
  const navigate = useNavigate();
  const token = useSearchParams()[0].get('token') ?? '';
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password !== again) return setError('The two passwords do not match');
    setError(null);
    setBusy(true);
    try {
      await api('/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, password }) });
      setDone(true);
      setTimeout(() => navigate('/login'), 2500);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <PageShell center>
      <Card>
        <h1 className="mb-2 text-center font-display text-3xl font-semibold text-brand">Choose a new password</h1>
        {!token ? (
          <p role="alert" className="text-center text-sm text-danger">This link is incomplete. <Link to="/forgot-password" className="underline">Request a new one</Link>.</p>
        ) : done ? (
          <p role="status" className="text-center font-semibold">Your password was changed. Taking you to the log in page…</p>
        ) : (
          <form onSubmit={submit} className="mt-4 flex flex-col gap-3">
            <input type="password" required minLength={8} placeholder="New password (8+ characters)" aria-label="New password" autoComplete="new-password" className={inputCls} value={password} onChange={(e) => setPassword(e.target.value)} />
            <input type="password" required minLength={8} placeholder="Repeat the new password" aria-label="Repeat the new password" autoComplete="new-password" className={inputCls} value={again} onChange={(e) => setAgain(e.target.value)} />
            {error && (
              <p role="alert" className="text-sm font-semibold text-danger">
                {error} {/invalid or has expired/i.test(error) && <Link to="/forgot-password" className="underline">Request a new link</Link>}
              </p>
            )}
            <ChunkyButton full disabled={busy}>Change password</ChunkyButton>
            <p className="text-center text-xs text-muted">You will be signed out on all your devices.</p>
          </form>
        )}
      </Card>
    </PageShell>
  );
}
