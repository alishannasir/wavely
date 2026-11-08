import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Avatar from './Avatar';
import { useAuth, User } from '../../store/auth';

/** Your picture and name in the top bar; opens a short menu (profile, friends, premium, log out). */
export default function ProfileMenu({ user }: { user: User }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  const item = 'block w-full px-4 py-2 text-left text-sm hover:bg-surface-2';
  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-full py-1 pl-1 pr-3 hover:bg-surface-2"
      >
        <Avatar name={user.displayName} src={user.avatarUrl} size={32} />
        <span className="max-w-[10rem] truncate font-display text-base text-ink">{user.displayName ?? 'You'}</span>
        <span aria-hidden className="text-xs text-muted">▾</span>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-40 mt-2 w-48 overflow-hidden rounded-2xl border border-line bg-white py-1 shadow-lg">
          <Link role="menuitem" to="/me" className={item} onClick={() => setOpen(false)}>Profile</Link>
          <Link role="menuitem" to="/friends" className={item} onClick={() => setOpen(false)}>Friends</Link>
          <Link role="menuitem" to="/upgrade" className={item} onClick={() => setOpen(false)}>Premium</Link>
          <button role="menuitem" type="button" className={`${item} border-t border-line text-muted`} onClick={() => { setOpen(false); useAuth.getState().logout(); }}>
            Log out
          </button>
        </div>
      )}
    </div>
  );
}
