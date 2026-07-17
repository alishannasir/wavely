import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth, User } from '../store/auth';

export default function Onboarding() {
  const navigate = useNavigate();
  const user = useAuth((s) => s.user);
  const [form, setForm] = useState({
    displayName: user?.displayName ?? '',
    birthdate: '',
    gender: user?.gender ?? 'OTHER',
    avatarUrl: user?.avatarUrl ?? '',
  });
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const updated = await api<User>('/users/me', {
        method: 'PATCH',
        body: JSON.stringify({
          displayName: form.displayName,
          birthdate: form.birthdate,
          gender: form.gender,
          ...(form.avatarUrl ? { avatarUrl: form.avatarUrl } : {}),
        }),
      });
      useAuth.getState().setUser(updated);
      navigate('/home');
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const inputCls =
    'rounded-xl bg-zinc-900 border border-zinc-700 px-4 py-3 focus:outline-none focus:border-emerald-500';

  return (
    <main className="min-h-screen flex flex-col justify-center gap-6 p-6 max-w-md mx-auto">
      <h1 className="text-3xl font-bold">Almost there</h1>
      <p className="text-zinc-400">Tell us a bit about yourself.</p>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <input type="text" required minLength={2} placeholder="Display name" className={inputCls} value={form.displayName} onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))} />
        <label className="flex flex-col gap-1 text-sm text-zinc-400">
          Date of birth (18+ required)
          <input type="date" required className={inputCls} value={form.birthdate} onChange={(e) => setForm((f) => ({ ...f, birthdate: e.target.value }))} />
        </label>
        <select className={inputCls} value={form.gender} onChange={(e) => setForm((f) => ({ ...f, gender: e.target.value }))}>
          <option value="MALE">Male</option>
          <option value="FEMALE">Female</option>
          <option value="OTHER">Other</option>
        </select>
        <input type="url" placeholder="Avatar URL (optional)" className={inputCls} value={form.avatarUrl} onChange={(e) => setForm((f) => ({ ...f, avatarUrl: e.target.value }))} />
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <button className="rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold py-3 transition-colors">
          Continue
        </button>
      </form>
    </main>
  );
}
