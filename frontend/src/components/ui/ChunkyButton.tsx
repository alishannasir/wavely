import { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router-dom';

type Variant = 'accent' | 'danger' | 'brand' | 'neutral';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  accent: 'bg-accent text-white hover:bg-accent-700 [--lip:12_74_153]',
  danger: 'bg-danger text-white hover:bg-danger-700 [--lip:158_31_54]',
  brand: 'bg-brand text-white hover:bg-brand-700 [--lip:55_35_135]',
  neutral: 'bg-surface-2 text-ink border border-line hover:bg-white [--lip:221_224_234]',
};
const SIZES: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-sm rounded-lg',
  md: 'px-5 py-3 text-base rounded-xl',
  lg: 'px-8 py-4 text-xl rounded-2xl',
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  /** Render as a router link instead of a button. */
  to?: string;
  full?: boolean;
}

/** The pressable button used everywhere: flat fill (AA contrast) with a darker "lip" that sinks on press. */
export default function ChunkyButton({
  variant = 'accent',
  size = 'md',
  icon,
  to,
  full,
  className = '',
  children,
  disabled,
  ...rest
}: Props) {
  const cls = [
    'inline-flex items-center justify-center gap-2 font-display font-semibold select-none transition',
    'shadow-[inset_0_1px_0_rgb(255_255_255/0.25),0_4px_0_rgb(var(--lip))]',
    'active:translate-y-[2px] active:shadow-[inset_0_1px_0_rgb(255_255_255/0.25),0_2px_0_rgb(var(--lip))]',
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
    VARIANTS[variant],
    SIZES[size],
    full ? 'w-full' : '',
    disabled ? 'opacity-50 pointer-events-none' : '',
    className,
  ].join(' ');
  const content = (
    <>
      {icon}
      {children}
    </>
  );
  if (to) {
    return (
      <Link to={to} className={cls} aria-disabled={disabled}>
        {content}
      </Link>
    );
  }
  return (
    <button className={cls} disabled={disabled} {...rest}>
      {content}
    </button>
  );
}
