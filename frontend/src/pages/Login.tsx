import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import PageShell, { Card } from '../components/ui/PageShell';
import ChunkyButton from '../components/ui/ChunkyButton';
import { api, API_BASE } from '../lib/api';
import { inputCls } from '../lib/ui';
import { useAuth, User } from '../store/auth';

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await api<{ access_token: string; user: User }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      useAuth.getState().setToken(res.access_token);
      useAuth.getState().setUser(res.user);
      navigate('/chat');
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <PageShell center>
      <Card>
        <h1 className="mb-6 text-center font-display text-3xl font-semibold text-brand">Welcome back</h1>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <input type="email" required placeholder="Email" aria-label="Email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
          <input type="password" required placeholder="Password" aria-label="Password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} />
          {error && (
            <p role="alert" className="text-sm font-semibold text-danger">
              {error}
              {/suspended or banned/i.test(error) && (
                <> <Link to={`/appeal?email=${encodeURIComponent(email)}`} className="underline">Appeal this decision</Link></>
              )}
            </p>
          )}
          <ChunkyButton full disabled={busy}>Log in</ChunkyButton>
          <Link to="/forgot-password" className="text-center text-sm text-accent underline">Forgot your password?</Link>
        </form>
        <div className="my-5 flex items-center gap-3 text-xs text-muted">
          <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
        </div>
        <ChunkyButton variant="neutral" full onClick={() => window.location.assign(`${API_BASE}/auth/google`)}>
          Continue with Google
        </ChunkyButton>
        <p className="mt-5 text-center text-sm text-muted">
          No account?{' '}
          <Link to="/signup" className="font-semibold text-accent hover:underline">Sign up</Link>
        </p>
      </Card>
    </PageShell>
  );
}
