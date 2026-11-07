import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import PageShell, { Card } from '../components/ui/PageShell';
import ChunkyButton from '../components/ui/ChunkyButton';
import { api } from '../lib/api';
import { inputCls } from '../lib/ui';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) });
      setSent(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageShell center>
      <Card>
        <h1 className="mb-2 text-center font-display text-3xl font-semibold text-brand">Forgot your password?</h1>
        {sent ? (
          <div role="status" className="text-center">
            <div className="my-3 text-4xl" aria-hidden>📬</div>
            <p className="font-semibold">Check your inbox</p>
            <p className="mt-1 text-sm text-muted">If an account exists for {email}, we sent a link to choose a new password. It works for 1 hour.</p>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-4 flex flex-col gap-3">
            <p className="text-center text-sm text-muted">Enter your email and we will send you a link to reset it.</p>
            <input type="email" required placeholder="Email" aria-label="Email" autoComplete="email" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} />
            {error && <p role="alert" className="text-sm font-semibold text-danger">{error}</p>}
            <ChunkyButton full disabled={busy}>Send reset link</ChunkyButton>
          </form>
        )}
        <Link to="/login" className="mt-5 block text-center text-sm text-accent underline">Back to log in</Link>
      </Card>
    </PageShell>
  );
}
