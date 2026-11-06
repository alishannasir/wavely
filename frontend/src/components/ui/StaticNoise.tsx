import { useEffect, useRef } from 'react';

/** Grey "TV static" shown on the stranger panel while nobody is connected. Pauses when hidden / reduced motion. */
export default function StaticNoise({ className = '' }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const W = 160;
    const H = 120;
    canvas.width = W;
    canvas.height = H;
    const img = ctx.createImageData(W, H);
    const draw = () => {
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        const v = 20 + Math.random() * 90;
        d[i] = d[i + 1] = d[i + 2] = v;
        d[i + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
    };
    draw();
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const id = setInterval(() => {
      if (!document.hidden) draw();
    }, 85); // ~12 fps
    return () => clearInterval(id);
  }, []);

  return <canvas ref={ref} aria-hidden className={`h-full w-full [image-rendering:pixelated] ${className}`} />;
}
