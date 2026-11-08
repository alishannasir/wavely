/** A round profile picture, or the first letter of the name on the brand colour when there is none. */
export default function Avatar({ name, src, size = 40, className = '' }: { name?: string | null; src?: string | null; size?: number; className?: string }) {
  const initial = (name ?? '?').trim().slice(0, 1).toUpperCase() || '?';
  const box = { width: size, height: size };
  return src ? (
    <img src={src} alt="" width={size} height={size} style={box} className={`shrink-0 rounded-full bg-surface-2 object-cover ${className}`} />
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
