import { useState } from 'react';
import Modal from './ui/Modal';
import ChunkyButton from './ui/ChunkyButton';

interface Props {
  onAccept: () => Promise<void>;
  onCancel: () => void;
}

/** Shown before the first chat: 18+ confirmation, rules and the safety reminder. */
export default function RulesModal({ onAccept, onCancel }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      await onAccept();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onCancel} labelledBy="rules-title" className="max-w-lg">
      <h2 id="rules-title" className="mb-3 text-center font-display text-2xl font-semibold text-brand">
        Before you start
      </h2>
      <p className="mb-3 text-sm text-muted">By pressing “I agree”, you confirm you are 18 or older and agree to:</p>
      <ul className="mb-4 list-disc space-y-1 pl-5 text-sm">
        <li>Keep your face visible and be respectful.</li>
        <li>No nudity, sexual content, harassment, hate or threats.</li>
        <li>Never share personal information such as your address or passwords.</li>
        <li>Anyone you meet is a stranger. You can go to the next person or leave at any time.</li>
      </ul>
      <p className="mb-4 rounded-xl bg-brand-50 p-3 text-xs text-muted">
        <strong className="text-ink">Safety reminder:</strong> use the Report button if someone breaks these rules. Reports
        include a screenshot and are reviewed by moderators. Rule violators are banned, including by device and IP.
      </p>
      {error && <p className="mb-3 text-sm font-semibold text-danger">{error}</p>}
      <div className="flex gap-3">
        <ChunkyButton variant="neutral" onClick={onCancel} className="flex-1">
          Cancel
        </ChunkyButton>
        <ChunkyButton onClick={accept} disabled={busy} className="flex-1">
          I agree
        </ChunkyButton>
      </div>
    </Modal>
  );
}
