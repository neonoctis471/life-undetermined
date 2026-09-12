"use client";

import { useEffect } from "react";

/**
 * The depth behind the line field: haze, two grids, ring and polygon line art.
 *
 * It sits between the paper gradient and the canvas, so the lines stay the
 * subject and this only gives them somewhere to be. Each layer takes a
 * different share of the pointer so the stack reads as depth rather than as a
 * picture sliding around.
 */

/**
 * Writes --mx / --my (roughly -0.5..0.5) on the root element. Its own listener
 * rather than the engine's: the engine's pointer signal drives the comb through
 * the lines and has its own smoothing and idle decay, and tangling the two
 * would make both harder to reason about. One passive listener coalesced into a
 * frame costs a style recalc on four decorative layers.
 */
function usePointerParallax() {
  useEffect(() => {
    const coarse = window.matchMedia("(pointer: coarse)");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (coarse.matches || reduced.matches) return;

    const root = document.documentElement;
    let frame = 0;
    let x = 0;
    let y = 0;

    const apply = () => {
      frame = 0;
      root.style.setProperty("--mx", x.toFixed(3));
      root.style.setProperty("--my", y.toFixed(3));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(apply);
    };
    const onMove = (event: PointerEvent) => {
      x = event.clientX / window.innerWidth - 0.5;
      y = event.clientY / window.innerHeight - 0.5;
      schedule();
    };
    const onLeave = () => {
      x = 0;
      y = 0;
      schedule();
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("blur", onLeave);
    document.documentElement.addEventListener("pointerleave", onLeave);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("blur", onLeave);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      root.style.removeProperty("--mx");
      root.style.removeProperty("--my");
    };
  }, []);
}

export function Backdrop() {
  usePointerParallax();
  return (
    <div className="backdrop" aria-hidden="true">
      <div className="bd-haze" />
      <div className="bd-grid" />
      <div className="bd-rings">
        <span className="bd-ring bd-ring-a" />
        <span className="bd-ring bd-ring-b" />
        <span className="bd-ring bd-ring-c" />
      </div>
      <div className="bd-polys">
        <svg className="bd-poly bd-poly-a" viewBox="0 0 300 300">
          <polygon points="150,18 279,93 279,207 150,282 21,207 21,93" />
          <polygon points="150,54 248,110 248,190 150,246 52,190 52,110" />
        </svg>
        <svg className="bd-poly bd-poly-b" viewBox="0 0 320 320">
          <polygon points="160,24 278,82 296,208 198,292 74,268 28,146 74,52" />
          <polygon points="160,64 242,104 254,192 186,246 98,228 64,144 98,86" />
        </svg>
        <svg className="bd-poly bd-poly-c" viewBox="0 0 240 240">
          <polygon points="120,18 206,70 222,152 164,222 76,222 18,152 34,70" />
        </svg>
        <svg className="bd-poly bd-poly-d" viewBox="0 0 280 280">
          <polygon points="140,24 240,84 256,196 140,256 36,196 48,84" />
          <polygon points="140,52 218,98 228,182 140,228 62,182 74,98" />
        </svg>
      </div>
    </div>
  );
}
