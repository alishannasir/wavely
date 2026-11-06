import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useBillingStatus } from '../lib/billing';
import { useAuth } from '../store/auth';

const PLANS = [
  { code: 'MONTHLY', name: 'Monthly', price: '$9.99/mo', blurb: 'Billed monthly. Cancel anytime.' },
  { code: 'ANNUAL', name: 'Annual', price: '$59.99/yr', blurb: 'Best value.' },
] as const;

const PERKS = ['No ads', 'Unlimited chat time and matches', 'Gender and country filters'];

function UpgradeInner() {
  const { data: billing } = useBillingStatus();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isPaid = billing?.plan === 'MONTHLY' || billing?.plan === 'ANNUAL';

  async function checkout(plan: 'MONTHLY' | 'ANNUAL') {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ url: string }>('/billing/checkout', {
        method: 'POST',
        body: JSON.stringify({ plan }),
      });
      window.location.assign(res.url);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  async function portal() {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ url: string }>('/billing/portal', { method: 'POST' });
      window.location.assign(res.url);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen flex flex-col justify-center gap-6 p-6 max-w-md mx-auto">
      <h1 className="text-3xl font-bold">Go Premium</h1>
      <ul className="flex flex-col gap-2 text-zinc-300">
        {PERKS.map((perk) => (
          <li key={perk} className="flex items-center gap-2">
            <span className="text-emerald-400">\u2713</span> {perk}
          </li>
        ))}
      </ul>

      {isPaid ? (
        <div className="flex flex-col gap-3">
          <p className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm">
            You are on the <strong>{billing?.plan === 'ANNUAL' ? 'Annual' : 'Monthly'}</strong> plan.
          </p>
          <button
            onClick={portal}
            disabled={busy}
            className="rounded-xl border border-zinc-700 hover:border-zinc-500 py-3 transition-colors disabled:opacity-50"
          >
            Manage billing
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {PLANS.map((plan) => (
            <button
              key={plan.code}
              onClick={() => checkout(plan.code)}
              disabled={busy}
              className="rounded-xl border border-zinc-700 hover:border-emerald-400 p-4 text-left transition-colors disabled:opacity-50"
            >
              <span className="flex items-baseline justify-between">
                <strong>{plan.name}</strong>
                <span className="text-emerald-400 font-semibold">{plan.price}</span>
              </span>
              <span className="text-sm text-zinc-400">{plan.blurb}</span>
            </button>
          ))}
        </div>
      )}

      {error && <p className="text-red-400 text-sm">{error}</p>}
      <Link to="/home" className="text-center text-sm text-zinc-400 hover:text-zinc-200">
        Back home
      </Link>
    </main>
  );
}

export default function Upgrade() {
  const isGuest = useAuth((s) => s.user?.isGuest);
  if (isGuest) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 max-w-md mx-auto text-center">
        <h1 className="text-2xl font-bold">Create an account first</h1>
        <p className="text-zinc-400">Premium needs a free account so your subscription is saved.</p>
        <Link to="/signup" className="rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold px-6 py-3">
          Create an account
        </Link>
      </main>
    );
  }
  return <UpgradeInner />;
}
