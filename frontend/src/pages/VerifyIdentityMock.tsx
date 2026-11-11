import { FormEvent, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import PageShell, { Card } from '../components/ui/PageShell';
import ChunkyButton from '../components/ui/ChunkyButton';
import { api } from '../lib/api';

/**
 * Stand-in for the identity provider's hosted page, for development and testing only (the backend refuses it
 * in production). A real provider replaces this page with its own.
 */
export default function VerifyIdentityMock() {
  const [params] = useSearchParams();
  const ref = params.get('ref') ?? '';
  const [sex, setSex] = useState<'MALE' | 'FEMALE'>('FEMALE');
  const [birthdate, setBirthdate] = useState('1995-05-05');
  const [country, setCountry] = useState('US');
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!import.meta.env.DEV && import.meta.env.VITE_MOCK_IDENTITY !== 'true') {
    return (
      <PageShell center>
        <Card className="text-center">Not available.</Card>
      </PageShell>
    );
  }

  const submit = async (outcome: 'approve' | 'decline', e?: FormEvent) => {
    e?.preventDefault();
    setError(null);
    try {
      await api('/identity/mock/complete', {
        method: 'POST',
        body: JSON.stringify(outcome === 'approve' ? { ref, outcome, sex, birthdate, country } : { ref, outcome }),
      });
      setDone(outcome === 'approve' ? 'Approved. You can close this tab and go back to the call.' : 'Declined. You can close this tab.');
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <PageShell center>
      <Card>
        <h1 className="mb-1 font-display text-2xl font-semibold text-brand">Mock identity check</h1>
        <p className="mb-4 text-sm text-muted">Test page. No document is read. Pretend to be the provider.</p>
        {done ? (
          <p role="status">{done}</p>
        ) : (
          <form onSubmit={(e) => void submit('approve', e)} className="flex flex-col gap-3">
            <label className="text-sm">Sex on document
              <select className="mt-1 w-full rounded-lg border border-line p-2" value={sex} onChange={(e) => setSex(e.target.value as 'MALE' | 'FEMALE')}>
                <option value="FEMALE">Female</option>
                <option value="MALE">Male</option>
              </select>
            </label>
            <label className="text-sm">Date of birth
              <input type="date" className="mt-1 w-full rounded-lg border border-line p-2" value={birthdate} onChange={(e) => setBirthdate(e.target.value)} />
            </label>
            <label className="text-sm">Document country (2 letters)
              <input maxLength={2} className="mt-1 w-full rounded-lg border border-line p-2 uppercase" value={country} onChange={(e) => setCountry(e.target.value)} />
            </label>
            {error && <p role="alert" className="text-sm text-danger">{error}</p>}
            <ChunkyButton type="submit">Approve</ChunkyButton>
            <ChunkyButton type="button" variant="neutral" onClick={() => void submit('decline')}>Decline</ChunkyButton>
          </form>
        )}
      </Card>
    </PageShell>
  );
}
