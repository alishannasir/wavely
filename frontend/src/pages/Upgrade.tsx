import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useBillingStatus } from '../lib/billing';
import { useAuth } from '../store/auth';
import AppShell from '../components/nav/AppShell';
import VerifyBanner from '../components/VerifyBanner';
import { Card } from '../components/ui/PageShell';
import ChunkyButton from '../components/ui/ChunkyButton';

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
    <AppShell title="Premium">
      <Card className="max-w-lg">
        <VerifyBanner className="mb-4" />
        <h1 className="mb-4 text-center font-display text-3xl font-semibold text-brand">Go Premium</h1>
        <ul className="mb-6 flex flex-col gap-2">
          {PERKS.map((perk) => (
            <li key={perk} className="flex items-center gap-2">
              <span className="text-accent" aria-hidden>✔</span> {perk}
            </li>
          ))}
        </ul>

        {isPaid ? (
          <div className="flex flex-col gap-3">
            <p className="rounded-2xl bg-brand-50 p-4 text-sm">
              You are on the <strong>{billing?.plan === 'ANNUAL' ? 'Annual' : 'Monthly'}</strong> plan.
            </p>
            <ChunkyButton variant="neutral" onClick={portal} disabled={busy}>Manage billing</ChunkyButton>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {PLANS.map((plan) => (
              <button
                key={plan.code}
                onClick={() => checkout(plan.code)}
                disabled={busy}
                className={`rounded-2xl border-2 p-4 text-left transition hover:border-brand disabled:opacity-50 ${plan.code === 'ANNUAL' ? 'border-brand bg-brand-50' : 'border-line bg-white'}`}
              >
                <span className="flex items-baseline justify-between">
                  <strong className="font-display text-lg">{plan.name}{plan.code === 'ANNUAL' ? ' · best value' : ''}</strong>
                  <span className="font-display text-lg font-semibold text-brand">{plan.price}</span>
                </span>
                <span className="text-sm text-muted">{plan.blurb}</span>
              </button>
            ))}
          </div>
        )}

        {error && <p role="alert" className="mt-3 text-sm font-semibold text-danger">{error}</p>}
        <Link to="/chat" className="mt-5 block text-center text-sm text-muted hover:text-ink">Back to chat</Link>
      </Card>
    </AppShell>
  );
}

export default function Upgrade() {
  const user = useAuth((s) => s.user);
  const isGuest = user?.isGuest;
  if (!user) return <Navigate to="/" replace />;
  if (isGuest) {
    return (
      <AppShell title="Premium">
        <Card className="mt-6 text-center">
          <h1 className="mb-2 font-display text-2xl font-semibold text-brand">Create an account first</h1>
          <p className="mb-5 text-muted">Premium needs a free account so your subscription is saved.</p>
          <ChunkyButton to="/signup">Create an account</ChunkyButton>
        </Card>
      </AppShell>
    );
  }
  return <UpgradeInner />;
}
