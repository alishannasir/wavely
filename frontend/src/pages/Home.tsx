import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import RulesModal from '../components/RulesModal';
import { useAuth, User } from '../store/auth';
import { useFilters } from '../store/filters';
import { useBillingStatus } from '../lib/billing';

const inputCls =
  'rounded-xl bg-zinc-900 border border-zinc-700 px-4 py-3 focus:outline-none focus:border-emerald-500';

export default function Home() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { data: billing } = useBillingStatus(Boolean(user));
  const filters = useFilters();
  const [showRules, setShowRules] = useState(false);

  if (!user) {
    navigate('/');
    return null;
  }

  const trialDaysLeft = Math.max(
    0,
    Math.ceil((new Date(user.trialEndsAt).getTime() - Date.now()) / 86_400_000),
  );
  const isPaid = billing?.plan === 'MONTHLY' || billing?.plan === 'ANNUAL';
  const capped = billing && (billing.dailyMinutes !== null || billing.dailyMatches !== null);

  return (
    <main className="min-h-screen flex flex-col gap-6 p-6 max-w-md mx-auto">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Hey, {user.displayName ?? 'there'}</h1>
        <span className="flex items-center gap-4">
          {user.isGuest ? (
            <Link to="/signup" className="text-sm text-emerald-400 hover:text-emerald-300">
              Sign up
            </Link>
          ) : (
            <Link to="/friends" className="text-sm text-emerald-400 hover:text-emerald-300">
              Friends
            </Link>
          )}
          <button
            onClick={() => {
              logout();
              navigate('/');
            }}
            className="text-sm text-zinc-400 hover:text-zinc-200"
          >
            Log out
          </button>
        </span>
      </header>

      {user.isGuest && (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm">
          You're chatting as a guest. <Link to="/signup" className="font-semibold text-emerald-400">Create a free account</Link> to add friends, message them and use filters.
        </div>
      )}

      {billing && (
        <div className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 text-sm">
          <span>
            Plan:{' '}
            <strong>
              {billing.plan === 'TRIAL' ? 'Free trial' : billing.plan === 'FREE' ? 'Free' : 'Premium'}
            </strong>
          </span>
          {!isPaid && (
            <Link to="/upgrade" className="font-semibold text-emerald-400 hover:text-emerald-300">
              Go Premium
            </Link>
          )}
        </div>
      )}

      {trialDaysLeft > 0 && (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm">
          Free trial: <strong>{trialDaysLeft} day{trialDaysLeft === 1 ? '' : 's'}</strong> of full access left.
        </div>
      )}

      {capped && billing && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 text-sm flex flex-col gap-1 text-zinc-300">
          {billing.dailyMinutes !== null && (
            <span>
              Chat time today: {billing.usage.minutesUsed} / {billing.dailyMinutes} min
            </span>
          )}
          {billing.dailyMatches !== null && (
            <span>
              Matches today: {billing.usage.matchesUsed} / {billing.dailyMatches}
            </span>
          )}
        </div>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-zinc-400">Match preferences</h2>
        {billing?.filtersEnabled ? (
          <div className="flex gap-3">
            <select
              className={`${inputCls} flex-1`}
              value={filters.preferredGender ?? ''}
              onChange={(e) => filters.setPreferredGender(e.target.value || null)}
            >
              <option value="">Any gender</option>
              <option value="MALE">Male</option>
              <option value="FEMALE">Female</option>
              <option value="OTHER">Other</option>
            </select>
            <input
              type="text"
              maxLength={2}
              placeholder="Country (US)"
              className={`${inputCls} w-32 uppercase`}
              value={filters.preferredCountry ?? ''}
              onChange={(e) => filters.setPreferredCountry(e.target.value.toUpperCase() || null)}
            />
          </div>
        ) : (
          <p className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 text-sm text-zinc-400">
            Gender and country filters are a{' '}
            <Link to="/upgrade" className="text-emerald-400">
              Premium
            </Link>{' '}
            feature.
          </p>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <p className="text-sm text-zinc-400">Login streak: reach 10 days for a reward</p>
        <div className="flex gap-1.5">
          {Array.from({ length: 10 }).map((_, i) => (
            <span
              key={i}
              className={`h-2.5 w-2.5 rounded-full ${
                i < user.currentStreak ? 'bg-emerald-400' : 'bg-zinc-700'
              }`}
            />
          ))}
        </div>
      </section>

      <div className="mt-auto">
        <button
          onClick={() => (user.rulesAcceptedAt ? navigate('/call') : setShowRules(true))}
          className="w-full rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold py-4 text-lg transition-colors"
        >
          Start Chat
        </button>
      </div>
      {showRules && (
        <RulesModal
          onCancel={() => setShowRules(false)}
          onAccept={async () => {
            const updated = await api<User>('/users/me/accept-rules', { method: 'POST' });
            useAuth.getState().setUser(updated);
            setShowRules(false);
            navigate('/call');
          }}
        />
      )}
    </main>
  );
}
