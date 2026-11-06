import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PageShell, { Card } from '../components/ui/PageShell';
import ChunkyButton from '../components/ui/ChunkyButton';
import { api } from '../lib/api';
import { inputCls } from '../lib/ui';
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
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
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
      navigate('/chat');
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <PageShell center>
      <Card>
        <h1 className="mb-1 text-center font-display text-3xl font-semibold text-brand">Almost there</h1>
        <p className="mb-5 text-center text-muted">Tell us a bit about yourself.</p>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <input type="text" required minLength={2} placeholder="Display name" aria-label="Display name" className={inputCls} value={form.displayName} onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))} />
          <label className="flex flex-col gap-1 text-sm text-muted">
            Date of birth (18+ required)
            <input type="date" required className={inputCls} value={form.birthdate} onChange={(e) => setForm((f) => ({ ...f, birthdate: e.target.value }))} />
          </label>
          <select aria-label="Gender" className={inputCls} value={form.gender} onChange={(e) => setForm((f) => ({ ...f, gender: e.target.value }))}>
            <option value="MALE">Male</option>
            <option value="FEMALE">Female</option>
            <option value="OTHER">Other</option>
          </select>
          <input type="url" placeholder="Avatar URL (optional)" aria-label="Avatar URL" className={inputCls} value={form.avatarUrl} onChange={(e) => setForm((f) => ({ ...f, avatarUrl: e.target.value }))} />
          {error && <p role="alert" className="text-sm font-semibold text-danger">{error}</p>}
          <ChunkyButton full disabled={busy}>Continue</ChunkyButton>
        </form>
      </Card>
    </PageShell>
  );
}
