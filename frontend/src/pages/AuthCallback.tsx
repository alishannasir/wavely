import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth, User } from '../store/auth';

export default function AuthCallback() {
  const navigate = useNavigate();
  const [params] = useSearchParams();

  useEffect(() => {
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
        navigate(user.birthdate ? '/home' : '/onboarding');
      })
      .catch(() => navigate('/login'));
  }, [params, navigate]);

  return <main className="min-h-screen flex items-center justify-center text-zinc-400">Signing you in…</main>;
}
