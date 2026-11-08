import { FormEvent, useRef, useState } from 'react';
import Modal from '../ui/Modal';
import ChunkyButton from '../ui/ChunkyButton';
import Avatar from '../ui/Avatar';
import { api } from '../../lib/api';
import { resizeToAvatar } from '../../lib/avatar';
import { inputCls } from '../../lib/ui';
import { useAuth, User } from '../../store/auth';

/** Change your display name and profile picture. */
export default function EditProfileModal({ open, onClose, user }: { open: boolean; onClose: () => void; user: User }) {
  const [name, setName] = useState(user.displayName ?? '');
  // undefined = keep the current picture, null = remove it, string = a newly chosen one
  const [photo, setPhoto] = useState<string | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  const shown = photo === undefined ? user.avatarUrl : photo;
  const trimmed = name.trim();
  const nameOk = trimmed.length >= 2 && trimmed.length <= 32;
  const changed = trimmed !== (user.displayName ?? '') || photo !== undefined;

  async function choose(f: File | undefined) {
    if (!f) return;
    setError(null);
    try {
      setPhoto(await resizeToAvatar(f));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!nameOk || !changed || busy) return;
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {};
      if (trimmed !== (user.displayName ?? '')) body.displayName = trimmed;
      if (photo !== undefined) body.avatarUrl = photo;
      const updated = await api<User>('/users/me', { method: 'PATCH', body: JSON.stringify(body) });
      useAuth.getState().setUser(updated);
      setPhoto(undefined);
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} labelledBy="edit-profile-title" className="max-w-sm">
      <h2 id="edit-profile-title" className="mb-4 font-display text-xl font-semibold text-brand">Edit profile</h2>
      <form onSubmit={save} className="flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <Avatar name={trimmed || user.displayName} src={shown} size={80} />
          <div className="flex flex-col items-start gap-2">
            <input ref={file} type="file" accept="image/*" className="hidden" onChange={(e) => void choose(e.target.files?.[0])} aria-label="Choose a picture" />
            <ChunkyButton type="button" size="sm" variant="neutral" onClick={() => file.current?.click()}>
              {shown ? 'Change picture' : 'Add a picture'}
            </ChunkyButton>
            {shown && (
              <button type="button" onClick={() => setPhoto(null)} className="text-sm text-muted underline hover:text-ink">
                Remove picture
              </button>
            )}
          </div>
        </div>
        <label className="flex flex-col gap-1 text-sm text-muted">
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={32} autoComplete="nickname" className={inputCls} />
          <span className="text-xs">2 to 32 characters. Other people see this name.</span>
        </label>
        {error && <p role="alert" className="text-sm font-semibold text-danger">{error}</p>}
        <div className="flex gap-2">
          <ChunkyButton type="button" variant="neutral" className="flex-1" onClick={onClose}>Cancel</ChunkyButton>
          <ChunkyButton className="flex-1" disabled={!nameOk || !changed || busy}>{busy ? 'Saving…' : 'Save'}</ChunkyButton>
        </div>
      </form>
    </Modal>
  );
}
