import { useState } from 'react';
import ChunkyButton from '../ui/ChunkyButton';
import Modal from '../ui/Modal';
import { api } from '../../lib/api';

export interface GateInfo {
  sessionId: string;
  state: 'paused' | 'blocked';
  /** I have a verified adult identity. */
  me: boolean;
  /** The other person has. */
  peer: boolean;
  reason: string | null;
}

const BLOCKED_TEXT: Record<string, string> = {
  DECLINED_BY_USER: 'One of you chose not to verify.',
  ID_DECLINED: 'A check could not confirm an adult identity.',
  TIMEOUT: 'Verification was not finished in time.',
  GEO_COUNTRY_NOT_ALLOWED: 'This is not available in one of your countries.',
  GEO_NOT_ENOUGH_SIGNALS: 'We could not confirm where you both are.',
};

/**
 * Shown to both people when a friend call turned sexual. The room stays paused until both have passed an ID check.
 * Nothing here can be closed with the X: the person either verifies or says no.
 */
export default function VerifyGateModal({
  gate,
  onDecline,
  onEnd,
}: {
  gate: GateInfo | null;
  onDecline: () => void;
  onEnd: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!gate) return null;

  const verify = async () => {
    setBusy(true);
    setError(null);
    try {
      const { url } = await api<{ url: string }>('/identity/sessions', { method: 'POST' });
      window.open(url, '_blank', 'noopener'); // a new tab, so the call stays open while they verify
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (gate.state === 'blocked') {
    return (
      <Modal open hideClose labelledBy="gate-title" className="text-center">
        <div className="mb-2 text-4xl" aria-hidden>🔒</div>
        <h2 id="gate-title" className="mb-2 font-display text-2xl font-semibold text-brand">This room stays private chat only</h2>
        <p className="mb-5 text-muted">{BLOCKED_TEXT[gate.reason ?? ''] ?? 'Verification did not complete.'} Camera and microphone stay off.</p>
        <ChunkyButton onClick={onEnd}>End call</ChunkyButton>
      </Modal>
    );
  }

  return (
    <Modal open hideClose labelledBy="gate-title" className="text-center">
      <div className="mb-2 text-4xl" aria-hidden>🪪</div>
      <h2 id="gate-title" className="mb-2 font-display text-2xl font-semibold text-brand">Verify to continue</h2>
      <p className="mb-4 text-muted">
        This conversation looks adult. To continue, <strong>both of you</strong> must confirm you are an adult with an ID
        check. Camera, microphone and chat are paused until then.
      </p>
      <ul className="mb-5 space-y-1 text-left text-sm">
        <li>{gate.me ? '✅' : '⬜'} You {gate.me ? 'are verified' : 'have not verified yet'}</li>
        <li>{gate.peer ? '✅' : '⬜'} Your friend {gate.peer ? 'is verified' : 'has not verified yet'}</li>
      </ul>
      {error && <p role="alert" className="mb-3 text-sm text-danger">{error}</p>}
      <div className="flex flex-col gap-2">
        {!gate.me && (
          <ChunkyButton disabled={busy} onClick={() => void verify()}>
            {busy ? 'Opening…' : 'Verify now'}
          </ChunkyButton>
        )}
        {gate.me && <p className="text-sm text-muted">Waiting for your friend…</p>}
        <button onClick={onDecline} className="text-sm text-muted hover:text-ink">No thanks, keep it private chat only</button>
      </div>
    </Modal>
  );
}
