import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import PageShell, { Card } from '../components/ui/PageShell';
import ChunkyButton from '../components/ui/ChunkyButton';
import { api } from '../lib/api';
import { useAuth, User } from '../store/auth';

type State = 'working' | 'ok' | 'error';

/** Landing page for one-time email links. The link is used once, as soon as the page opens. */
function EmailLink({ endpoint, title, success }: { endpoint: string; title: string; success: string }) {
  const token = useSearchParams()[0].get('token') ?? '';
  const [state, setState] = useState<State>('working');
  const [error, setError] = useState('');
  const started = useRef(false); // React StrictMode runs effects twice in development: a link must be used only once

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (!token) {
      setError('This link is incomplete.');
      setState('error');
      return;
    }
    api(endpoint, { method: 'POST', body: JSON.stringify({ token }) })
      .then(async () => {
        setState('ok');
        // If this browser is signed in, pick up the new verified / changed email.
        if (useAuth.getState().sessionExpiresAt) {
          try {
            useAuth.getState().setUser(await api<User>('/users/me'));
          } catch {
            /* the session may have ended (e.g. after an email change): nothing to refresh */
          }
        }
      })
      .catch((e: Error) => {
        setError(e.message);
        setState('error');
      });
  }, [endpoint, token]);

  return (
    <PageShell center>
      <Card className="text-center">
        <h1 className="mb-3 font-display text-3xl font-semibold text-brand">{title}</h1>
        {state === 'working' && <p role="status" className="text-muted">One moment…</p>}
        {state === 'ok' && (
          <div role="status">
            <div className="mb-2 text-4xl" aria-hidden>✅</div>
            <p className="mb-4 font-semibold">{success}</p>
            <ChunkyButton to="/chat">Continue</ChunkyButton>
          </div>
        )}
        {state === 'error' && (
          <div role="alert">
            <p className="mb-4 font-semibold text-danger">{error}</p>
            <Link to="/account" className="text-sm text-accent underline">Go to your account</Link>
          </div>
        )}
      </Card>
    </PageShell>
  );
}

export const VerifyEmail = () => <EmailLink endpoint="/auth/verify-email" title="Confirming your email" success="Your email is confirmed. Friends, messages and Premium are unlocked." />;
export const ConfirmEmailChange = () => <EmailLink endpoint="/auth/confirm-email-change" title="Confirming your new email" success="Your email address was changed. Sign in again with the new address if you are asked to." />;
