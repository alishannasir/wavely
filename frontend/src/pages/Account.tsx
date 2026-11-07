import { FormEvent, ReactNode, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AppShell from '../components/nav/AppShell';
import ChunkyButton from '../components/ui/ChunkyButton';
import Modal from '../components/ui/Modal';
import VerifyBanner from '../components/VerifyBanner';
import { api } from '../lib/api';
import { inputCls } from '../lib/ui';
import { useAuth, User } from '../store/auth';

function Section({ title, children, tone = 'plain' }: { title: string; children: ReactNode; tone?: 'plain' | 'danger' }) {
  return (
    <section className={`rounded-2xl bg-white p-4 shadow-sm ${tone === 'danger' ? 'border border-danger/30' : ''}`}>
      <h2 className={`mb-3 font-display text-lg font-semibold ${tone === 'danger' ? 'text-danger' : 'text-brand'}`}>{title}</h2>
      {children}
    </section>
  );
}

function Msg({ ok, text }: { ok?: boolean; text: string | null }) {
  if (!text) return null;
  return <p role={ok ? 'status' : 'alert'} className={`text-sm font-semibold ${ok ? 'text-emerald-700' : 'text-danger'}`}>{text}</p>;
}

function ChangePassword() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (next !== again) return setMsg({ ok: false, text: 'The two new passwords do not match' });
    setBusy(true);
    setMsg(null);
    try {
      const res = await api<{ access_token: string; user: User }>('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      useAuth.getState().setToken(res.access_token); // this device stays signed in; the others are signed out
      useAuth.getState().setUser(res.user);
      setCurrent('');
      setNext('');
      setAgain('');
      setMsg({ ok: true, text: 'Password changed. You were signed out on your other devices.' });
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <input type="password" required placeholder="Current password" aria-label="Current password" autoComplete="current-password" className={inputCls} value={current} onChange={(e) => setCurrent(e.target.value)} />
      <input type="password" required minLength={8} placeholder="New password (8+ characters)" aria-label="New password" autoComplete="new-password" className={inputCls} value={next} onChange={(e) => setNext(e.target.value)} />
      <input type="password" required minLength={8} placeholder="Repeat the new password" aria-label="Repeat the new password" autoComplete="new-password" className={inputCls} value={again} onChange={(e) => setAgain(e.target.value)} />
      <Msg ok={msg?.ok} text={msg?.text ?? null} />
      <ChunkyButton disabled={busy} className="self-start">Change password</ChunkyButton>
    </form>
  );
}

function ChangeEmail() {
  const [password, setPassword] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await api('/auth/change-email', { method: 'POST', body: JSON.stringify({ password, newEmail }) });
      setPassword('');
      setMsg({ ok: true, text: `We sent a confirmation link to ${newEmail}. Your email changes when you click it.` });
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <input type="email" required placeholder="New email address" aria-label="New email address" autoComplete="email" className={inputCls} value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
      <input type="password" required placeholder="Your password" aria-label="Your password" autoComplete="current-password" className={inputCls} value={password} onChange={(e) => setPassword(e.target.value)} />
      <Msg ok={msg?.ok} text={msg?.text ?? null} />
      <ChunkyButton disabled={busy} className="self-start">Send confirmation link</ChunkyButton>
    </form>
  );
}

/** Account and security: email, password, a copy of your data, and deleting the account. */
export default function Account() {
  const navigate = useNavigate();
  const user = useAuth((s) => s.user);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [showDelete, setShowDelete] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  if (!user) {
    navigate('/');
    return null;
  }
  const hasPassword = user.authProvider === 'EMAIL';

  async function download() {
    setExporting(true);
    setExportError(null);
    try {
      const data = await api<unknown>('/users/me/export');
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'my-data.json';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError((err as Error).message);
    } finally {
      setExporting(false);
    }
  }

  async function deleteAccount(e: FormEvent) {
    e.preventDefault();
    setDeleting(true);
    setDeleteError(null);
    try {
      await api('/users/me/delete', { method: 'POST', body: JSON.stringify(hasPassword ? { password: deletePassword } : { confirm: deletePassword }) });
      useAuth.getState().logout();
      navigate('/');
    } catch (err) {
      setDeleteError((err as Error).message);
      setDeleting(false);
    }
  }

  return (
    <AppShell title="Account">
      <div className="mx-auto flex max-w-lg flex-col gap-4">
        <h1 className="hidden font-display text-3xl font-semibold text-brand md:block">Account &amp; security</h1>

        {user.isGuest ? (
          <div className="rounded-2xl bg-brand p-4 text-white">
            <p className="font-display text-lg font-semibold">You are using a guest session</p>
            <p className="mb-3 text-sm text-white/90">Create a free account to add friends, keep your history and manage your password and email.</p>
            <ChunkyButton to="/signup" variant="neutral" size="sm">Create an account</ChunkyButton>
          </div>
        ) : (
          <>
            <Section title="Email">
              <p className="mb-2 text-sm">
                <strong>{user.email}</strong>{' '}
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${user.emailVerifiedAt ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}>
                  {user.emailVerifiedAt ? 'confirmed' : 'not confirmed'}
                </span>
              </p>
              <VerifyBanner className="mb-3" />
              {hasPassword ? <ChangeEmail /> : <p className="text-sm text-muted">Your account signs in with Google, so its email is managed there.</p>}
            </Section>

            {hasPassword && (
              <Section title="Password">
                <ChangePassword />
                <p className="mt-3 text-sm text-muted">Forgot it? <Link className="text-accent underline" to="/forgot-password">Reset it by email</Link>.</p>
              </Section>
            )}

            <Section title="Your data">
              <p className="mb-3 text-sm text-muted">Download a copy of what we hold about you (profile, friends, messages, calls, subscriptions) as a JSON file.</p>
              <ChunkyButton variant="neutral" onClick={() => void download()} disabled={exporting} className="self-start">{exporting ? 'Preparing…' : 'Download my data'}</ChunkyButton>
              <Msg text={exportError} />
            </Section>
          </>
        )}

        <Section title="Delete account" tone="danger">
          <p className="mb-3 text-sm text-muted">
            This permanently removes your messages, friends, blocks and subscriptions and cannot be undone. If you appear in a safety report, only your
            identity is removed: the report itself is kept in anonymised form.
          </p>
          <ChunkyButton variant="danger" onClick={() => { setShowDelete(true); setDeletePassword(''); setDeleteError(null); }}>Delete my account…</ChunkyButton>
        </Section>
      </div>

      <Modal open={showDelete} onClose={() => setShowDelete(false)} labelledBy="delete-title">
        <h2 id="delete-title" className="mb-2 font-display text-xl font-semibold text-danger">Delete your account?</h2>
        <p className="mb-3 text-sm text-muted">
          {hasPassword ? 'Enter your password to confirm.' : 'Type DELETE to confirm.'} Any active subscription is cancelled.
        </p>
        <form onSubmit={deleteAccount} className="flex flex-col gap-3">
          <input
            type={hasPassword ? 'password' : 'text'}
            required
            autoFocus
            aria-label={hasPassword ? 'Password' : 'Type DELETE'}
            placeholder={hasPassword ? 'Your password' : 'DELETE'}
            className={inputCls}
            value={deletePassword}
            onChange={(e) => setDeletePassword(e.target.value)}
          />
          <Msg text={deleteError} />
          <div className="flex gap-3">
            <ChunkyButton type="button" variant="neutral" className="flex-1" onClick={() => setShowDelete(false)}>Cancel</ChunkyButton>
            <ChunkyButton variant="danger" className="flex-1" disabled={deleting}>Delete forever</ChunkyButton>
          </div>
        </form>
      </Modal>
    </AppShell>
  );
}
