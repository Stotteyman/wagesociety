import { useEffect, useRef } from 'react';

/**
 * Hero graphic — "the pour".
 *
 * Derived from the crest itself (public/brand/wage-crest.png): the W is two beer
 * glasses, and each glass reads bottom-to-top as deep red base, amber body, then
 * a white foam cap. Every column below is that same glass, filling and settling.
 * So it doubles as an earnings meter — which is the whole point of the product.
 *
 * 2D canvas on purpose: no WebGL context to lose, no Three.js in the bundle, and
 * hard square edges match the crest's flat extruded facets rather than fighting them.
 */

// Sampled from public/brand/wage-crest.png — the official Discord bot avatar.
const RED = '#E43000';    // the chevron, and the base of each glass
const AMBER = '#FC9000';  // the beer
const FOAM = '#FCFCFC';   // the head on the glass, and the lettering

export default function WageHero() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf: number | null = null;
    let visible = !document.hidden;
    let w = 0, h = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    // Deterministic per-column offset so the field looks organic without calling
    // Math.random every frame.
    const seeded = (i: number) => {
      const x = Math.sin(i * 127.1) * 43758.5453;
      return x - Math.floor(x);
    };

    const draw = (tMs: number) => {
      const t = tMs * 0.001;
      const gap = 5;
      const barW = 10;
      const step = barW + gap;
      const count = Math.max(1, Math.ceil(w / step));
      const base = h;          // glasses stand on the bottom edge
      const maxFill = h * 0.94;

      ctx.clearRect(0, 0, w, h);

      for (let i = 0; i < count; i++) {
        const x = i * step;
        const s = seeded(i);

        // Two out-of-phase waves plus a per-column offset, so there is no visible repeat.
        const wave =
          0.42 * Math.sin(t * 0.75 + i * 0.34) +
          0.30 * Math.sin(t * 0.47 + i * 0.15 + s * 6.28) +
          0.28 * s;
        const fill = Math.max(6, (0.26 + 0.74 * Math.abs(wave)) * maxFill);
        const top = base - fill;

        // Each column is a glass: deep red at the base, amber through the body.
        const grad = ctx.createLinearGradient(0, base, 0, top);
        grad.addColorStop(0, RED);
        grad.addColorStop(0.34, AMBER);
        grad.addColorStop(1, AMBER);
        ctx.fillStyle = grad;
        ctx.globalAlpha = 0.30 + 0.42 * (fill / maxFill);
        ctx.fillRect(x, top, barW, fill);

        // The head on the beer.
        ctx.fillStyle = FOAM;
        ctx.globalAlpha = 0.55 + 0.35 * (fill / maxFill);
        ctx.fillRect(x, top, barW, 3);
      }

      ctx.globalAlpha = 1;
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!visible) return;
      draw(now);
    };

    const onVisibility = () => {
      visible = !document.hidden;
      if (visible && raf === null && !reducedMotion) frame(performance.now());
    };
    const onResize = () => { resize(); if (reducedMotion) draw(0); };

    resize();
    if (reducedMotion) draw(0);
    else frame(performance.now());

    window.addEventListener('resize', onResize, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      if (raf !== null) cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return (
    <div>
      <img
        src="/brand/wage-crest.png"
        alt="W.A.G.E. Society"
        width={512}
        height={512}
        className="mx-auto w-full max-w-[290px] drop-shadow-[0_18px_50px_rgba(252,144,0,0.22)]"
      />
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="pointer-events-none mt-4 h-[96px] w-full"
        style={{
          maskImage: 'linear-gradient(90deg, transparent, #000 14%, #000 86%, transparent)',
          WebkitMaskImage: 'linear-gradient(90deg, transparent, #000 14%, #000 86%, transparent)',
        }}
      />
    </div>
  );
}
