import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import PageShell, { Card } from '../components/ui/PageShell';
import ChunkyButton from '../components/ui/ChunkyButton';
import { api, API_BASE } from '../lib/api';
import { resetSocket } from '../lib/socket';
import { inputCls } from '../lib/ui';
import { useAuth, User } from '../store/auth';

export default function Signup() {
  const navigate = useNavigate();
  const isGuest = useAuth((st) => st.user?.isGuest);
  const [form, setForm] = useState({ email: '', password: '', displayName: '', birthdate: '', gender: 'OTHER' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await api<{ access_token: string; user: User }>(isGuest ? '/auth/upgrade-guest' : '/auth/register', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      resetSocket(); // reconnect with the new (full account) token
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
        <h1 className="mb-1 text-center font-display text-3xl font-semibold text-brand">Create your account</h1>
        {isGuest && <p className="mb-4 text-center text-sm text-muted">Unlock friends, messaging and filters. Your guest session carries over.</p>}
        <form onSubmit={submit} className="mt-4 flex flex-col gap-3">
          <input type="email" required placeholder="Email" aria-label="Email" autoComplete="email" className={inputCls} value={form.email} onChange={(e) => set('email', e.target.value)} />
          <input type="password" required minLength={8} placeholder="Password (8+ characters)" aria-label="Password" autoComplete="new-password" className={inputCls} value={form.password} onChange={(e) => set('password', e.target.value)} />
          <input type="text" required minLength={2} placeholder="Display name" aria-label="Display name" className={inputCls} value={form.displayName} onChange={(e) => set('displayName', e.target.value)} />
          <label className="flex flex-col gap-1 text-sm text-muted">
            Date of birth (18+ required)
            <input type="date" required className={inputCls} value={form.birthdate} onChange={(e) => set('birthdate', e.target.value)} />
          </label>
          <select aria-label="Gender" className={inputCls} value={form.gender} onChange={(e) => set('gender', e.target.value)}>
            <option value="MALE">Male</option>
            <option value="FEMALE">Female</option>
            <option value="OTHER">Other</option>
          </select>
          {error && <p role="alert" className="text-sm font-semibold text-danger">{error}</p>}
          <ChunkyButton full disabled={busy}>Sign up</ChunkyButton>
        </form>
        <div className="my-5 flex items-center gap-3 text-xs text-muted">
          <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
        </div>
        <ChunkyButton variant="neutral" full onClick={() => window.location.assign(`${API_BASE}/auth/google`)}>
          Continue with Google
        </ChunkyButton>
        <p className="mt-5 text-center text-sm text-muted">
          Have an account? <Link to="/login" className="font-semibold text-accent hover:underline">Log in</Link>
        </p>
        <p className="mt-3 text-center text-xs text-muted">I confirm that I am at least 18 years old and accept the <Link to="/rules" className="text-accent underline">rules</Link>.</p>
      </Card>
    </PageShell>
  );
}
