import { useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../store/auth';

/** Shown to signed-in accounts whose email is not confirmed yet. */
export default function VerifyBanner({ className = '' }: { className?: string }) {
  const user = useAuth((s) => s.user);
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);
  if (!user || user.isGuest || !user.email || user.emailVerifiedAt) return null;

  async function resend() {
    setState('sending');
    setError(null);
    try {
      await api('/auth/verify-email/resend', { method: 'POST' });
      setState('sent');
    } catch (err) {
      setError((err as Error).message);
      setState('idle');
    }
  }

  return (
    <div role="status" className={`rounded-2xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 ${className}`}>
      <strong>Confirm your email</strong> ({user.email}) to unlock friends, messages and Premium.{' '}
      {state === 'sent' ? (
        <span>We sent you a new link. Check your inbox.</span>
      ) : (
        <button onClick={() => void resend()} disabled={state === 'sending'} className="font-semibold underline">
          {state === 'sending' ? 'Sending…' : 'Send the link again'}
        </button>
      )}
      {error && <span role="alert" className="ml-2 font-semibold text-danger">{error}</span>}
    </div>
  );
}
