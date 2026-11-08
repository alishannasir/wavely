import { ReactNode, RefObject, useCallback, useEffect, useRef, useState } from 'react';

type Size = 'S' | 'M' | 'L';
const SIZES: Record<Size, { w: number; h: number }> = {
  S: { w: 300, h: 240 },
  M: { w: 380, h: 340 },
  L: { w: 480, h: 460 },
};
const HEADER_H = 36;
const KEY = 'wavely-chat-panel';

interface Saved {
  /** Centre of the panel as a fraction of the video area (0..1), so it survives window resizes. */
  fx: number;
  fy: number;
  size: Size;
  collapsed: boolean;
}

const isPhone = () => typeof window !== 'undefined' && window.matchMedia?.('(max-width: 767px)').matches;
// By default the panel sits in the middle of the screen, across the seam between the two videos
// (lower down on a phone, where the videos are stacked and it would hide the other person).
const defaults = (): Saved => ({ fx: 0.5, fy: isPhone() ? 0.8 : 0.5, size: 'S', collapsed: false });

function load(): Saved {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (raw && typeof raw.fx === 'number' && typeof raw.fy === 'number' && raw.size in SIZES) return { ...defaults(), ...raw };
  } catch {
    /* storage can be blocked: use the defaults */
  }
  return defaults();
}
function save(s: Saved) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));

/**
 * A small chat window that floats over the videos. Drag it by its top bar (or move it with the arrow keys while the
 * bar is focused), make it bigger or smaller with S / M / L, or fold it away with the minus button.
 */
export default function FloatingChat({ containerRef, children }: { containerRef: RefObject<HTMLElement>; children: ReactNode }) {
  const [state, setState] = useState<Saved>(load);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const drag = useRef<{ px: number; py: number; fx: number; fy: number } | null>(null);

  // Follow the size of the video area.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const read = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [containerRef]);

  const panelW = Math.min(SIZES[state.size].w, box.w * 0.94 || SIZES[state.size].w);
  const panelH = state.collapsed ? HEADER_H : Math.min(SIZES[state.size].h, box.h * 0.85 || SIZES[state.size].h);

  /** Keeps the panel fully inside the video area. */
  const fit = useCallback(
    (fx: number, fy: number) => {
      if (!box.w || !box.h) return { fx, fy };
      const mx = panelW / 2 / box.w;
      const my = panelH / 2 / box.h;
      return { fx: clamp(fx, mx, 1 - mx), fy: clamp(fy, my, 1 - my) };
    },
    [box.w, box.h, panelW, panelH],
  );

  const update = (patch: Partial<Saved>) =>
    setState((s) => {
      const next = { ...s, ...patch };
      save(next);
      return next;
    });

  const pos = fit(state.fx, state.fy);

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest('button')) return; // the size buttons are not part of the handle
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { px: e.clientX, py: e.clientY, fx: pos.fx, fy: pos.fy };
  }
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || !box.w || !box.h) return;
    const next = fit(d.fx + (e.clientX - d.px) / box.w, d.fy + (e.clientY - d.py) / box.h);
    setState((s) => ({ ...s, ...next }));
  }
  function onPointerUp() {
    if (!drag.current) return;
    drag.current = null;
    setState((s) => {
      save(s);
      return s;
    });
  }
  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const step = 0.03;
    const move: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const m = move[e.key];
    if (!m || !box.w) return;
    e.preventDefault();
    const next = fit(pos.fx + m[0], pos.fy + m[1]);
    update(next);
  }

  const btn = 'rounded-md px-1.5 py-0.5 text-xs font-semibold transition hover:bg-black/10';

  return (
    <div
      className="absolute z-20 flex flex-col overflow-hidden rounded-2xl border border-white/40 bg-white/90 shadow-xl backdrop-blur-md"
      style={{ left: `${pos.fx * 100}%`, top: `${pos.fy * 100}%`, width: panelW, height: panelH, transform: 'translate(-50%, -50%)' }}
    >
      <div
        role="group"
        tabIndex={0}
        aria-label="Chat window. Drag this bar to move it, or use the arrow keys."
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
        className="flex shrink-0 cursor-grab touch-none select-none items-center justify-between gap-2 border-b border-line bg-surface-2/80 px-2 active:cursor-grabbing"
        style={{ height: HEADER_H }}
      >
        <span className="flex items-center gap-1.5 text-xs font-semibold text-muted">
          <span aria-hidden className="tracking-widest">⋮⋮</span> Chat
        </span>
        <span className="flex items-center gap-0.5">
          {(['S', 'M', 'L'] as Size[]).map((s) => (
            <button
              key={s}
              type="button"
              aria-label={`Chat size ${s}`}
              aria-pressed={state.size === s && !state.collapsed}
              onClick={() => update({ size: s, collapsed: false })}
              className={`${btn} ${state.size === s && !state.collapsed ? 'bg-brand text-white hover:bg-brand' : 'text-muted'}`}
            >
              {s}
            </button>
          ))}
          <button type="button" aria-label="Move chat back to the middle" title="Back to the middle" onClick={() => update({ ...defaults(), size: state.size, collapsed: state.collapsed })} className={`${btn} text-muted`}>
            ◎
          </button>
          <button
            type="button"
            aria-label={state.collapsed ? 'Open chat' : 'Fold chat away'}
            aria-expanded={!state.collapsed}
            onClick={() => update({ collapsed: !state.collapsed })}
            className={`${btn} text-muted`}
          >
            {state.collapsed ? '+' : '–'}
          </button>
        </span>
      </div>
      {/* Kept mounted while folded so a half-typed message is not lost. */}
      <div className={state.collapsed ? 'hidden' : 'min-h-0 flex-1'}>{children}</div>
    </div>
  );
}
