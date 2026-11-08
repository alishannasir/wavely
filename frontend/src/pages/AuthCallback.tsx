import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth, User } from '../store/auth';
import LoadingLogo from '../components/brand/LoadingLogo';

export default function AuthCallback() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const started = useRef(false); // React StrictMode runs effects twice in development; the code works only once

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const code = params.get('code');
    if (!code) {
      navigate('/login');
      return;
    }
    // Remove the one-time code from the address bar/history right away.
    window.history.replaceState(null, '', '/auth/callback');
    api<{ access_token: string; user: User }>('/auth/exchange', {
      method: 'POST',
      body: JSON.stringify({ code }),
    })
      .then(({ access_token }) => {
        useAuth.getState().setToken(access_token);
        return api<User>('/users/me');
      })
      .then((user) => {
        useAuth.getState().setUser(user);
        // OAuth signups have no birthdate yet; onboarding collects it (18+ gate).
        navigate(user.birthdate ? '/chat' : '/onboarding');
      })
      .catch(() => {
        useAuth.getState().logout(); // a half-set session (token saved, profile failed) must not stay
        navigate('/login');
      });
  }, [params, navigate]);

  return <main className="min-h-screen flex flex-col items-center justify-center gap-3 text-muted">
      <LoadingLogo size={96} />
      <p>Signing you in…</p>
    </main>;
}
