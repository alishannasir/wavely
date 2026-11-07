import { useEffect, useState } from 'react';
import { BRAND } from '../../brand';

const SAD_MOUTH = 'M21 43c4-5 18-5 22 0';
const HAPPY_MOUTH = 'M21 37c4 5 18 5 22 0';
const CYCLE = '2.6s';
// sad (hold) -> smile (hold) -> sad
const TIMES = '0;0.2;0.45;0.8;1';
const SPLINES = '0.4 0 0.2 1;0.4 0 0.2 1;0.4 0 0.2 1;0.4 0 0.2 1';

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return;
    const on = () => setReduced(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}

/**
 * The Wavely mark for loading screens: the face starts sad (frown, drooping eyes, a tear)
 * and turns into a smile, then loops. With reduced motion it just shows the smile.
 */
export default function LoadingLogo({ size = 96, className = '' }: { size?: number; className?: string }) {
  const reduced = usePrefersReducedMotion();
  const anim = (attr: string, values: string, spline = true) =>
    reduced ? null : (
      <animate
        attributeName={attr}
        values={values}
        keyTimes={TIMES}
        dur={CYCLE}
        repeatCount="indefinite"
        {...(spline ? { calcMode: 'spline', keySplines: SPLINES } : {})}
      />
    );

  return (
    <span role="status" aria-label="Loading" className={`inline-flex flex-col items-center ${className}`}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        aria-hidden="true"
        className={reduced ? '' : 'animate-logo-bob'}
      >
        <path
          d="M14 6h36a10 10 0 0 1 10 10v26a10 10 0 0 1-10 10H34l-12 10v-10h-8A10 10 0 0 1 4 42V16A10 10 0 0 1 14 6z"
          fill="rgb(var(--c-brand))"
        />
        <circle cx="23" cy={reduced ? 26 : 29} r="3.6" fill="#fff">
          {anim('cy', '29;29;26;26;29')}
        </circle>
        <circle cx="41" cy={reduced ? 26 : 29} r="3.6" fill="#fff">
          {anim('cy', '29;29;26;26;29')}
        </circle>
        {!reduced && (
          <ellipse cx="22" cy="36" rx="1.8" ry="2.6" fill="#9AD7FF" opacity="1">
            {anim('opacity', '1;1;0;0;1', false)}
          </ellipse>
        )}
        <path
          d={reduced ? HAPPY_MOUTH : SAD_MOUTH}
          fill="none"
          stroke="#fff"
          strokeWidth="4"
          strokeLinecap="round"
        >
          {anim('d', `${SAD_MOUTH};${SAD_MOUTH};${HAPPY_MOUTH};${HAPPY_MOUTH};${SAD_MOUTH}`)}
        </path>
      </svg>
      <span className="sr-only">Loading {BRAND.name}…</span>
    </span>
  );
}
