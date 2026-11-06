import { flagEmoji } from '../../lib/flag';

/** Country flag + code. Some systems (e.g. Windows) cannot draw flag emoji, so the code is always shown too. */
export default function FlagPill({ country, className = '' }: { country: string | null | undefined; className?: string }) {
  if (!country) return null;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-xs font-semibold text-muted ${className}`}>
      <span aria-hidden>{flagEmoji(country)}</span>
      {country.toUpperCase()}
    </span>
  );
}
