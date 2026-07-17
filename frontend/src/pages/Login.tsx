import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, API_BASE } from '../lib/api';
import { useAuth, User } from '../store/auth';

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const res = await api<{ access_token: string; user: User }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      useAuth.getState().setToken(res.access_token);
      useAuth.getState().setUser(res.user);
      navigate('/home');
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <main className="min-h-screen flex flex-col justify-center gap-6 p-6 max-w-md mx-auto">
      <h1 className="text-3xl font-bold">Welcome back</h1>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <input
          type="email"
          required
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-xl bg-zinc-900 border border-zinc-700 px-4 py-3 focus:outline-none focus:border-emerald-500"
        />
        <input
          type="password"
          required
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-xl bg-zinc-900 border border-zinc-700 px-4 py-3 focus:outline-none focus:border-emerald-500"
        />
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <button className="rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold py-3 transition-colors">
          Log in
        </button>
      </form>
      <a
        href={`${API_BASE}/auth/google`}
        className="rounded-xl border border-zinc-700 hover:border-zinc-500 py-3 text-center transition-colors"
      >
        Continue with Google
      </a>
      <p className="text-zinc-400 text-sm text-center">
        No account?{' '}
        <Link to="/signup" className="text-emerald-400">
          Sign up
        </Link>
      </p>
    </main>
  );
}
