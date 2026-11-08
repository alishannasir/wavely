import { ReactNode, RefObject, useEffect, useRef, useState } from 'react';

const BAR_W = 200; // the folded bar
const BAR_H = 34;
const EDGE_GAP = 6;
const MIN_W = 220;
const MIN_H = 150;
const MOVE_THRESHOLD = 4; // below this a press on the bar is a click, not a drag
const KEY = 'wavely-chat-dock-v2';

type Corner = 'tl' | 'tr' | 'bl' | 'br';

interface Saved {
  /** Top-left corner of the panel as a fraction of the video area; null = docked at the bottom edge, in the middle. */
  x: number | null;
  y: number | null;
  /** Size when open, in pixels. */
  w: number;
  h: number;
  open: boolean;
}
const DEFAULT: Saved = { x: null, y: null, w: 300, h: 230, open: false };

function load(): Saved {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (raw && typeof raw.w === 'number' && typeof raw.h === 'number') return { ...DEFAULT, ...raw };
  } catch {
    /* storage can be blocked: use the defaults */
  }
  return DEFAULT;
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
 * The chat lives as a small bar on the edge of the video area. Click the bar to open it, drag the bar to move it, and
 * drag any corner to make it bigger or smaller. Folded, it shows a dot when someone writes.
 */
export default function FloatingChat({
  containerRef,
  messageCount,
  children,
}: {
  containerRef: RefObject<HTMLElement>;
  /** How many messages there are; a rise while folded lights the dot. */
  messageCount: number;
  children: ReactNode;
}) {
  const [s, setS] = useState<Saved>(load);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const seen = useRef(messageCount);
  const gesture = useRef<
    | { kind: 'move'; px: number; py: number; left: number; top: number; moved: boolean }
    | { kind: 'resize'; corner: Corner; px: number; py: number; left: number; top: number; w: number; h: number }
    | null
  >(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const read = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [containerRef]);

  useEffect(() => {
    if (s.open) seen.current = messageCount;
  }, [s.open, messageCount]);
  const unread = s.open ? 0 : Math.max(0, messageCount - seen.current);

  // Size and position in pixels, always inside the video area.
  const w = s.open ? clamp(s.w, MIN_W, box.w - 2 * EDGE_GAP || s.w) : BAR_W;
  const h = s.open ? clamp(s.h, MIN_H, box.h - 2 * EDGE_GAP || s.h) : BAR_H;
  const dockedLeft = (box.w - BAR_W) / 2;
  const dockedTop = box.h - BAR_H - EDGE_GAP;
  const left = box.w ? clamp(s.x === null ? dockedLeft : s.x * box.w, 0, box.w - w) : 0;
  const top = box.h ? clamp(s.y === null ? dockedTop : s.y * box.h, 0, box.h - h) : 0;

  const put = (patch: Partial<Saved>, persist = true) =>
    setS((cur) => {
      const next = { ...cur, ...patch };
      if (persist) save(next);
      return next;
    });
  const place = (l: number, t: number) => ({ x: box.w ? l / box.w : null, y: box.h ? t / box.h : null });

  /** Opening unfolds the bar upwards, folding goes back to the bar: the edge it sits on stays where it is. */
  function toggle() {
    if (!box.w) return;
    if (!s.open) {
      const ow = clamp(s.w, MIN_W, box.w - 2 * EDGE_GAP);
      const oh = clamp(s.h, MIN_H, box.h - 2 * EDGE_GAP);
      const l = clamp(left + (BAR_W - ow) / 2, 0, box.w - ow);
      const t = clamp(top + BAR_H - oh, 0, box.h - oh);
      put({ open: true, ...place(l, t) });
    } else {
      const l = clamp(left + (w - BAR_W) / 2, 0, box.w - BAR_W);
      const t = clamp(top + h - BAR_H, 0, box.h - BAR_H);
      put({ open: false, ...place(l, t) });
    }
  }

  function onBarDown(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    gesture.current = { kind: 'move', px: e.clientX, py: e.clientY, left, top, moved: false };
  }
  function onBarMove(e: React.PointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (!g || g.kind !== 'move') return;
    const dx = e.clientX - g.px;
    const dy = e.clientY - g.py;
    if (!g.moved && Math.hypot(dx, dy) < MOVE_THRESHOLD) return;
    g.moved = true;
    put(place(clamp(g.left + dx, 0, box.w - w), clamp(g.top + dy, 0, box.h - h)), false);
  }
  function onBarUp() {
    const g = gesture.current;
    gesture.current = null;
    if (!g || g.kind !== 'move') return;
    if (g.moved) setS((cur) => (save(cur), cur));
    else toggle();
  }
  function onBarKey(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggle();
      return;
    }
    const step = 24;
    const d: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const m = d[e.key];
    if (!m) return;
    e.preventDefault();
    put(place(clamp(left + m[0], 0, box.w - w), clamp(top + m[1], 0, box.h - h)));
  }

  function onGripDown(corner: Corner) {
    return (e: React.PointerEvent<HTMLDivElement>) => {
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      gesture.current = { kind: 'resize', corner, px: e.clientX, py: e.clientY, left, top, w, h };
    };
  }
  function onGripMove(e: React.PointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (!g || g.kind !== 'resize') return;
    const dx = e.clientX - g.px;
    const dy = e.clientY - g.py;
    const L = g.corner.includes('l');
    const T = g.corner.includes('t');
    // The corner opposite the one being dragged stays put; the panel cannot grow past the video area.
    const maxW = L ? g.left + g.w : box.w - g.left;
    const maxH = T ? g.top + g.h : box.h - g.top;
    const nw = clamp(g.w + (L ? -dx : dx), MIN_W, maxW);
    const nh = clamp(g.h + (T ? -dy : dy), MIN_H, maxH);
    put({ w: nw, h: nh, ...place(L ? g.left + g.w - nw : g.left, T ? g.top + g.h - nh : g.top) }, false);
  }
  function onGripUp() {
    if (gesture.current?.kind === 'resize') setS((cur) => (save(cur), cur));
    gesture.current = null;
  }

  const grip = (corner: Corner) => {
    const pos = { tl: 'left-0 top-0 cursor-nwse-resize', tr: 'right-0 top-0 cursor-nesw-resize', bl: 'bottom-0 left-0 cursor-nesw-resize', br: 'bottom-0 right-0 cursor-nwse-resize' }[corner];
    return (
      <div
        key={corner}
        aria-hidden
        onPointerDown={onGripDown(corner)}
        onPointerMove={onGripMove}
        onPointerUp={onGripUp}
        onPointerCancel={onGripUp}
        className={`absolute z-10 h-4 w-4 touch-none ${pos}`}
      />
    );
  };

  return (
    <div
      className="absolute z-20 flex flex-col overflow-hidden rounded-2xl border border-white/40 bg-white/90 shadow-xl backdrop-blur-md"
      style={{ left, top, width: w, height: h, visibility: box.w ? 'visible' : 'hidden' }}
    >
      <div
        role="button"
        tabIndex={0}
        aria-expanded={s.open}
        aria-label={s.open ? 'Chat. Click to fold it, drag to move it.' : 'Open chat. Drag to move it.'}
        onPointerDown={onBarDown}
        onPointerMove={onBarMove}
        onPointerUp={onBarUp}
        onPointerCancel={() => (gesture.current = null)}
        onKeyDown={onBarKey}
        className="flex shrink-0 cursor-pointer touch-none select-none items-center justify-between px-3 text-xs font-semibold text-muted active:cursor-grabbing"
        style={{ height: BAR_H }}
      >
        <span className="flex items-center gap-1.5">
          <span aria-hidden>💬</span> Chat
          {unread > 0 && (
            <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-white" aria-label={`${unread} new messages`}>
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </span>
        <span aria-hidden className="text-base leading-none">{s.open ? '⌄' : '⌃'}</span>
      </div>
      {/* One element in both states, so folding never remounts the chat (a half-typed message is kept). */}
      <div className={s.open ? 'min-h-0 flex-1 border-t border-line' : 'hidden'}>{children}</div>
      {s.open && (['tl', 'tr', 'bl', 'br'] as Corner[]).map(grip)}
    </div>
  );
}
