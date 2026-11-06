import { ReactNode } from 'react';

/** Page background with tiled line-art doodles. `brand` = white doodles on violet, `light` = grey on the page colour. */
export default function DoodleBackground({
  tone = 'light',
  className = '',
  children,
}: {
  tone?: 'brand' | 'light';
  className?: string;
  children?: ReactNode;
}) {
  return <div className={`${tone === 'brand' ? 'doodle-brand bg-brand text-white' : 'doodle-light bg-page text-ink'} ${className}`}>{children}</div>;
}
