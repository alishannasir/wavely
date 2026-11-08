import { useEffect, useState } from 'react';

const QUERY = '(min-width: 768px)';
const read = () => typeof window !== 'undefined' && !!window.matchMedia?.(QUERY).matches;

/** True on a tablet or desktop (Tailwind's `md`). Used where the layout differs enough that one tree cannot do both. */
export function useIsDesktop(): boolean {
  const [yes, setYes] = useState(read);
  useEffect(() => {
    const mq = window.matchMedia?.(QUERY);
    if (!mq) return;
    const on = () => setYes(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return yes;
}
