/**
 * Only pictures that cannot phone home are shown: the small embedded ones the app creates, and Google's own account
 * photos. Anything else (an old web link someone saved) falls back to the letter, so nobody can use a profile picture
 * to see who is looking at it.
 */
export function safeAvatarSrc(src: string | null | undefined): string | null {
  if (!src) return null;
  if (/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(src)) return src;
  try {
    const u = new URL(src);
    if (u.protocol === 'https:' && /(^|\.)googleusercontent\.com$/.test(u.hostname)) return src;
  } catch {
    /* not a link */
  }
  return null;
}

/** A round profile picture, or the first letter of the name on the brand colour when there is none. */
export default function Avatar({ name, src, size = 40, className = '' }: { name?: string | null; src?: string | null; size?: number; className?: string }) {
  const initial = (name ?? '?').trim().slice(0, 1).toUpperCase() || '?';
  const box = { width: size, height: size };
  const safe = safeAvatarSrc(src);
  return safe ? (
    <img src={safe} alt="" width={size} height={size} style={box} referrerPolicy="no-referrer" className={`shrink-0 rounded-full bg-surface-2 object-cover ${className}`} />
  ) : (
    <span
      aria-hidden
      style={{ ...box, fontSize: size * 0.45 }}
      className={`flex shrink-0 items-center justify-center rounded-full bg-brand font-display font-semibold text-white ${className}`}
    >
      {initial}
    </span>
  );
}
