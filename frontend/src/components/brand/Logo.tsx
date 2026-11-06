import { BRAND } from '../../brand';

interface Props {
  size?: number;
  /** full = mark + wordmark, mark = icon only, mono = all white (for coloured backgrounds). */
  variant?: 'full' | 'mark' | 'mono';
  className?: string;
}

/** Our own mark: a rounded "screen" with a speech-bubble tail and a smiling face. */
export function LogoMark({ size = 36, mono = false }: { size?: number; mono?: boolean }) {
  const body = mono ? '#fff' : 'rgb(var(--c-brand))';
  const face = mono ? 'rgb(var(--c-brand))' : '#fff';
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={BRAND.name}>
      <path d="M14 6h36a10 10 0 0 1 10 10v26a10 10 0 0 1-10 10H34l-12 10v-10h-8A10 10 0 0 1 4 42V16A10 10 0 0 1 14 6z" fill={body} />
      <circle cx="23" cy="26" r="3.6" fill={face} />
      <circle cx="41" cy="26" r="3.6" fill={face} />
      <path d="M21 37c4 5 18 5 22 0" fill="none" stroke={face} strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

export default function Logo({ size = 36, variant = 'full', className = '' }: Props) {
  if (variant === 'mark') return <LogoMark size={size} />;
  const mono = variant === 'mono';
  const word = BRAND.name.toLowerCase();
  const split = Math.max(1, word.length - 2); // "wave" + "ly"
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <LogoMark size={size} mono={mono} />
      <span className="font-display font-semibold leading-none" style={{ fontSize: size * 0.72 }}>
        <span className={mono ? 'text-white' : 'text-brand'}>{word.slice(0, split)}</span>
        <span className={mono ? 'text-white' : 'text-accent'}>{word.slice(split)}</span>
      </span>
    </span>
  );
}
