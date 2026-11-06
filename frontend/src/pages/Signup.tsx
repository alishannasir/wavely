import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, API_BASE } from '../lib/api';
import { resetSocket } from '../lib/socket';
import { useAuth, User } from '../store/auth';

export default function Signup() {
  const navigate = useNavigate();
  const isGuest = useAuth((st) => st.user?.isGuest);
  const [form, setForm] = useState({
    email: '',
    password: '',
    displayName: '',
    birthdate: '',
    gender: 'OTHER',
  });
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const res = await api<{ access_token: string; user: User }>(isGuest ? '/auth/upgrade-guest' : '/auth/register', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      resetSocket(); // reconnect with the new (full account) token
      useAuth.getState().setToken(res.access_token);
      useAuth.getState().setUser(res.user);
      navigate('/home');
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const inputCls =
    'rounded-xl bg-zinc-900 border border-zinc-700 px-4 py-3 focus:outline-none focus:border-emerald-500';

  return (
    <main className="min-h-screen flex flex-col justify-center gap-6 p-6 max-w-md mx-auto">
      <h1 className="text-3xl font-bold">Create your account</h1>
      {isGuest && <p className="text-sm text-zinc-400">Unlock friends, messaging and filters. Your guest session carries over.</p>}
      <form onSubmit={submit} className="flex flex-col gap-4">
        <input type="email" required placeholder="Email" className={inputCls} value={form.email} onChange={(e) => set('email', e.target.value)} />
        <input type="password" required minLength={8} placeholder="Password (8+ characters)" className={inputCls} value={form.password} onChange={(e) => set('password', e.target.value)} />
        <input type="text" required minLength={2} placeholder="Display name" className={inputCls} value={form.displayName} onChange={(e) => set('displayName', e.target.value)} />
        <label className="flex flex-col gap-1 text-sm text-zinc-400">
          Date of birth (18+ required)
          <input type="date" required className={inputCls} value={form.birthdate} onChange={(e) => set('birthdate', e.target.value)} />
        </label>
        <select className={inputCls} value={form.gender} onChange={(e) => set('gender', e.target.value)}>
          <option value="MALE">Male</option>
          <option value="FEMALE">Female</option>
          <option value="OTHER">Other</option>
        </select>
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <button className="rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold py-3 transition-colors">
          Sign up
        </button>
      </form>
      <a
        href={`${API_BASE}/auth/google`}
        className="rounded-xl border border-zinc-700 hover:border-zinc-500 py-3 text-center transition-colors"
      >
        Continue with Google
      </a>
      <p className="text-zinc-400 text-sm text-center">
        Have an account?{' '}
        <Link to="/login" className="text-emerald-400">
          Log in
        </Link>
      </p>
    </main>
  );
}
