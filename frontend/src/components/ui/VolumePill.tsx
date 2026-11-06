/** Dark pill with a speaker icon and a volume slider (0..1), shown over the stranger's video. */
export default function VolumePill({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-2 rounded-full bg-stage/70 px-3 py-2 text-white backdrop-blur">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M3 9v6h4l5 4V5L7 9H3zm13.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4z" />
      </svg>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label="Volume"
        className="h-1.5 w-32 cursor-pointer accent-accent"
      />
    </div>
  );
}
