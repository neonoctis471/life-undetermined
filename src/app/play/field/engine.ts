import { hashSeed, mulberry32 } from "./rng";
import { TIMELINE, type FieldTarget } from "./target";

/*
 * Canvas 2D renderer for the line field: a family of isoparametric curves
 * (sinusoid-modulated lines, parameters offset line by line) plus transverse
 * lines that give the mesh its surface. Parameters chase the FieldTarget with
 * critically damped springs; nothing here is a timed animation.
 */

type TierName = "full" | "mobile" | "lite";

interface TierConfig {
  lines: number;
  mesh: number;
  samples: number;
  dprCap: number;
  minFrameMs: number;
}

const TIERS: Record<TierName, TierConfig> = {
  full: { lines: 64, mesh: 34, samples: 120, dprCap: 2, minFrameMs: 0 },
  mobile: { lines: 36, mesh: 16, samples: 72, dprCap: 2, minFrameMs: 0 },
  lite: { lines: 24, mesh: 0, samples: 48, dprCap: 1.5, minFrameMs: 32 },
};
const NEXT_TIER: Record<TierName, TierName | null> = { full: "mobile", mobile: "lite", lite: null };

const TAU = Math.PI * 2;
const INK = "17, 17, 17";
const GREEN = "47, 191, 74";
const SANS = '-apple-system, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';
const LABEL_FONT = `500 12px ${SANS}`;
const AXIS_FONT = `11px ui-monospace, "SF Mono", Menlo, Consolas, ${SANS}`;
/** Average frame interval above which the renderer steps down a tier. */
const SLOW_FRAME_MS = 24;
/** When nothing is changing the drift only needs ~30 fps. */
const IDLE_FRAME_MS = 33;
const MOBILE_BREAKPOINT = 760;

interface Line {
  offset: number;
  side: 1 | -1;
  local: number;
  freq: number;
  phase: number;
  phase2: number;
  weight: number;
}

class Spring {
  velocity = 0;
  target: number;

  constructor(
    public value: number,
    private readonly stiffness: number,
  ) {
    this.target = value;
  }

  step(dt: number): void {
    const k = this.stiffness;
    const acceleration = k * (this.target - this.value) - 2 * Math.sqrt(k) * this.velocity;
    this.velocity += acceleration * dt;
    this.value += this.velocity * dt;
  }

  snap(): void {
    this.value = this.target;
    this.velocity = 0;
  }

  get settled(): boolean {
    return Math.abs(this.target - this.value) < 5e-4 && Math.abs(this.velocity) < 5e-4;
  }
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};

function pickTier(): TierName {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const cores = nav.hardwareConcurrency ?? 8;
  const memory = nav.deviceMemory ?? 8;
  if (cores <= 2 || memory <= 2) return "lite";
  return window.innerWidth < MOBILE_BREAKPOINT ? "mobile" : "full";
}

/** How undetermined life is at time u: 0 = already lived (collapsed), 1 = fully open. */
function openness(u: number, now: number): number {
  const distance = u - now;
  if (distance <= -0.035) return 0;
  if (distance <= 0) return 0.05 * smoothstep(-0.035, 0, distance);
  const grown = Math.min(1, distance / Math.max(0.1, 0.92 - now));
  return 0.05 + 0.95 * Math.pow(grown, 0.62);
}

export interface LineFieldOptions {
  reducedMotion: boolean;
}

export class LineFieldEngine {
  private readonly ctx: CanvasRenderingContext2D;
  private tier: TierName;
  /** Degraded or reduced-motion rendering: only draw when something changes. */
  private staticMode: boolean;
  private reducedMotion: boolean;
  private lines: Line[] = [];
  private seed = 1;
  private commonPhase = 0;
  private commonFreq = 1;
  private width = 0;
  private height = 0;
  private running = false;
  private rafId = 0;
  private lastFrame = 0;
  private lastDraw = 0;
  private clock = 0;
  private target: FieldTarget | null = null;
  private waitStartedAt: number | null = null;
  private impactStartedAt: number | null = null;
  private previousKey: number | null | undefined = undefined;
  private readonly pointer = { x: 0, y: 0, strength: 0, target: 0, movedAt: 0 };
  private frameIntervals: number[] = [];
  private framesSeen = 0;
  private readonly cleanup: (() => void)[] = [];
  private readonly springs = {
    now: new Spring(0, 5),
    pinch: new Spring(0, 5),
    spread: new Spring(1, 7),
    split: new Spring(0, 9),
    emphUp: new Spring(0, 10),
    emphDown: new Spring(0, 10),
    chosenUp: new Spring(0, 7),
    chosenDown: new Spring(0, 7),
    fork: new Spring(0, 3.2),
    duel: new Spring(0, 2.6),
    energy: new Spring(0.4, 3),
    hero: new Spring(1, 3.5),
    key: new Spring(0, 6),
  };

  constructor(
    private readonly canvas: HTMLCanvasElement,
    options: LineFieldOptions,
  ) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas is unavailable");
    this.ctx = ctx;
    this.reducedMotion = options.reducedMotion;
    this.staticMode = options.reducedMotion;
    this.tier = pickTier();
    this.publishTier();
    this.resize();

    const onResize = () => {
      this.resize();
      this.kick();
    };
    const onVisibility = () => {
      if (document.hidden) this.stop();
      else this.kick();
    };
    const onPointer = (event: PointerEvent) => {
      if (this.reducedMotion) return;
      this.pointer.x = event.clientX;
      this.pointer.y = event.clientY;
      this.pointer.target = 1;
      this.pointer.movedAt = performance.now();
      this.kick();
    };
    const onRelease = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") this.pointer.target = 0;
    };
    const onLeave = () => {
      this.pointer.target = 0;
    };
    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pointermove", onPointer, { passive: true });
    window.addEventListener("pointerdown", onPointer, { passive: true });
    window.addEventListener("pointerup", onRelease, { passive: true });
    window.addEventListener("pointercancel", onRelease, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    window.addEventListener("blur", onLeave);
    this.cleanup.push(() => {
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("pointerup", onRelease);
      window.removeEventListener("pointercancel", onRelease);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("blur", onLeave);
    });
  }

  setSeed(seed: string): void {
    const value = hashSeed(seed);
    if (value === this.seed && this.lines.length > 0) return;
    this.seed = value;
    this.buildLines();
    this.kick();
  }

  setTarget(target: FieldTarget): void {
    const first = this.target === null;
    this.target = target;
    const now = performance.now();
    if (target.creep !== target.now) this.waitStartedAt ??= now;
    else this.waitStartedAt = null;
    if (this.previousKey === null && target.keyU !== null && !first) this.impactStartedAt = now;
    this.previousKey = target.keyU;

    const s = this.springs;
    s.now.target = target.now;
    s.pinch.target = target.pinch;
    s.spread.target = target.spread;
    s.split.target = target.split;
    s.emphUp.target = target.emphasis === 1 ? 1 : 0;
    s.emphDown.target = target.emphasis === -1 ? 1 : 0;
    s.chosenUp.target = target.chosen === 1 ? 1 : 0;
    s.chosenDown.target = target.chosen === -1 ? 1 : 0;
    s.fork.target = target.fork;
    s.duel.target = target.duel;
    s.energy.target = target.energy;
    s.hero.target = target.layout === "hero" ? 1 : 0;
    s.key.target = target.keyU === null ? 0 : 1;
    // A restored game (or reduced motion) appears directly in its current state.
    if (first || this.reducedMotion) for (const spring of Object.values(s)) spring.snap();
    // A new screen costs React a few long frames; judge the field's speed only in steady state.
    this.frameIntervals = [];
    this.framesSeen = 0;
    this.kick();
  }

  setReducedMotion(reduced: boolean): void {
    this.reducedMotion = reduced;
    this.staticMode = reduced || this.staticMode;
    if (reduced) {
      this.pointer.target = 0;
      this.pointer.strength = 0;
      for (const spring of Object.values(this.springs)) spring.snap();
    }
    this.kick();
  }

  destroy(): void {
    this.stop();
    for (const dispose of this.cleanup) dispose();
  }

  // -------------------------------------------------------------------------
  // Loop
  // -------------------------------------------------------------------------

  private kick(): void {
    if (typeof document !== "undefined" && document.hidden) return;
    if (this.reducedMotion) {
      this.draw(performance.now());
      return;
    }
    if (this.running) return;
    this.running = true;
    this.lastFrame = 0;
    this.rafId = requestAnimationFrame(this.frame);
  }

  private stop(): void {
    this.running = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = 0;
  }

  private readonly frame = (timestamp: number): void => {
    this.rafId = 0;
    if (!this.running) return;
    const idle = this.isSettled() && this.pointer.strength < 0.01;
    const minInterval = Math.max(TIERS[this.tier].minFrameMs, idle ? IDLE_FRAME_MS : 0);
    if (minInterval && timestamp - this.lastDraw < minInterval) {
      this.rafId = requestAnimationFrame(this.frame);
      return;
    }
    const interval = this.lastFrame ? timestamp - this.lastFrame : 16.7;
    const dt = Math.min(0.05, interval / 1000);
    if (!idle) this.monitor(interval);
    this.lastFrame = timestamp;
    this.lastDraw = timestamp;
    this.update(dt, timestamp);
    this.draw(timestamp);
    if (this.staticMode && this.isSettled() && this.pointer.strength < 0.01 && this.impact(timestamp) === 0) {
      this.running = false;
      return;
    }
    this.rafId = requestAnimationFrame(this.frame);
  };

  private isSettled(): boolean {
    return this.waitStartedAt === null && Object.values(this.springs).every((spring) => spring.settled);
  }

  /** Steps down a tier when frames are consistently slow; finally stops the drift. */
  private monitor(interval: number): void {
    this.framesSeen += 1;
    if (this.staticMode || this.framesSeen < 30) return;
    this.frameIntervals.push(interval);
    if (this.frameIntervals.length < 90) return;
    const average = this.frameIntervals.reduce((sum, value) => sum + value, 0) / this.frameIntervals.length;
    this.frameIntervals = [];
    if (average <= SLOW_FRAME_MS) return;
    const next = NEXT_TIER[this.tier];
    if (next) {
      this.tier = next;
      this.buildLines();
      this.resize();
    } else {
      this.staticMode = true;
    }
    this.publishTier();
  }

  private publishTier(): void {
    document.documentElement.dataset.fieldTier = this.staticMode ? `${this.tier}-static` : this.tier;
  }

  private update(dt: number, timestamp: number): void {
    const target = this.target;
    if (!target) return;
    const s = this.springs;
    if (this.waitStartedAt !== null) {
      // Approach the creep target asymptotically: time keeps passing, it never arrives on its own.
      const elapsed = (timestamp - this.waitStartedAt) / 1000;
      s.now.target = target.now + (target.creep - target.now) * (1 - Math.exp(-elapsed / 5));
    } else {
      s.now.target = target.now;
    }
    for (const spring of Object.values(s)) spring.step(dt);
    this.clock += dt * (0.25 + s.energy.value * 0.9);
    if (timestamp - this.pointer.movedAt > 1600) this.pointer.target = 0;
    const rate = this.pointer.target > this.pointer.strength ? 10 : 1.4;
    this.pointer.strength += (this.pointer.target - this.pointer.strength) * Math.min(1, dt * rate);
  }

  private impact(timestamp: number): number {
    if (this.impactStartedAt === null) return 0;
    const elapsed = (timestamp - this.impactStartedAt) / 1000;
    if (elapsed > 3.2) {
      this.impactStartedAt = null;
      return 0;
    }
    return Math.exp(-elapsed / 0.8) * Math.min(1, elapsed / 0.08);
  }

  // -------------------------------------------------------------------------
  // Geometry
  // -------------------------------------------------------------------------

  private buildLines(): void {
    const random = mulberry32(this.seed);
    const count = TIERS[this.tier].lines;
    this.commonPhase = random() * TAU;
    this.commonFreq = 0.8 + random() * 0.45;
    const lines: Line[] = [];
    for (let index = 0; index < count; index += 1) {
      const evenly = -1 + (2 * (index + 0.5)) / count;
      const offset = Math.min(1, Math.max(-1, evenly + (random() - 0.5) * (1.6 / count)));
      lines.push({
        offset,
        side: offset >= 0 ? 1 : -1,
        local: (Math.abs(offset) - 0.5) * 2,
        freq: 0.75 + random() * 0.6,
        phase: random() * TAU,
        phase2: random() * TAU,
        weight: 0.55 + random() * 0.45,
      });
    }
    this.lines = lines.sort((a, b) => a.offset - b.offset);
  }

  private resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, TIERS[this.tier].dprCap);
    this.width = rect.width;
    this.height = rect.height;
    this.canvas.width = Math.max(1, Math.round(rect.width * dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * dpr));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (this.lines.length === 0) this.buildLines();
  }

  private draw(timestamp: number): void {
    const { ctx, width: W, height: H } = this;
    ctx.clearRect(0, 0, W, H);
    const target = this.target;
    if (!target || W === 0 || this.lines.length === 0) return;

    const config = TIERS[this.tier];
    const s = this.springs;
    const mobile = W < MOBILE_BREAKPOINT;
    const hero = clamp01(s.hero.value);
    const x0 = mobile ? 0 : lerp(W * 0.47, 0, hero);
    const x1 = mobile ? W : lerp(W * 0.985, W, hero);
    const cy = mobile ? lerp(H * 0.165, H * 0.245, hero) : lerp(H * 0.48, H * 0.54, hero);
    const half = mobile ? lerp(H * 0.095, H * 0.125, hero) : lerp(H * 0.25, H * 0.32, hero);
    const now = s.now.value;
    const pinch = clamp01(s.pinch.value);
    const spread = s.spread.value;
    const split = clamp01(s.split.value);
    const fork = clamp01(s.fork.value);
    const duel = clamp01(s.duel.value);
    const energy = s.energy.value;
    const keyVisible = clamp01(s.key.value);
    const keyU = target.keyU ?? TIMELINE.YEAR_4;
    const emphUp = clamp01(s.emphUp.value);
    const emphDown = clamp01(s.emphDown.value);
    const chosenUp = clamp01(s.chosenUp.value);
    const chosenDown = clamp01(s.chosenDown.value);
    const clock = this.reducedMotion ? 0 : this.clock;
    const impact = this.reducedMotion ? 0 : this.impact(timestamp);
    const samples = config.samples;
    const count = this.lines.length;

    // Per-sample values shared by every line.
    const us = new Float32Array(samples + 1);
    const xs = new Float32Array(samples + 1);
    const common = new Float32Array(samples + 1);
    const width = new Float32Array(samples + 1);
    const splitW = new Float32Array(samples + 1);
    const forkW = new Float32Array(samples + 1);
    const amp = new Float32Array(samples + 1);
    const twist = new Float32Array(samples + 1);
    const heroAmp = mobile ? 0.25 : 0.5;
    for (let i = 0; i <= samples; i += 1) {
      const u = i / samples;
      us[i] = u;
      xs[i] = x0 + u * (x1 - x0);
      common[i] =
        cy +
        half *
          (Math.sin(TAU * this.commonFreq * 0.9 * u + clock * 0.25 + this.commonPhase) * 0.08 +
            Math.sin(TAU * 2.1 * u - clock * 0.17 + this.commonPhase * 1.3) * 0.035) *
          (1 - 0.5 * duel);
      const open = lerp(1, openness(u, now), pinch);
      const forked = fork * smoothstep(keyU, keyU + 0.16, u);
      forkW[i] = forked;
      width[i] = lerp(open * spread, spread, forked);
      splitW[i] = split * smoothstep(now, now + 0.16, u) * (1 - forked);
      amp[i] = (0.03 + 0.19 * Math.max(open, forked)) * (1 - 0.85 * duel * forked) * (0.55 + 0.7 * energy) * (1 + hero * heroAmp);
      // Lines shear sideways by their offset, and the shear drifts along the axis: the family
      // reads as a twisting surface and the transverse lines curve instead of standing upright.
      twist[i] =
        Math.sin(TAU * 0.55 * u + clock * 0.12 + this.commonPhase * 0.7) * half * 0.24 * Math.max(open, forked) * (1 - duel * forked);
    }

    const ys = new Float32Array(count * (samples + 1));
    const lx = new Float32Array(count * (samples + 1));
    const pointer = this.pointer;
    const pushRadius = mobile ? 70 : 110;
    const pushing = pointer.strength > 0.01;

    for (let l = 0; l < count; l += 1) {
      const line = this.lines[l]!;
      const row = l * (samples + 1);
      for (let i = 0; i <= samples; i += 1) {
        const u = us[i]!;
        let offset = line.offset;
        const sp = splitW[i]!;
        if (sp > 0) offset = lerp(offset, line.side * (0.58 + line.local * 0.34), sp);
        const fk = forkW[i]!;
        if (fk > 0) {
          const bundleCenter = line.side > 0 ? 0 : -0.62;
          offset = lerp(offset, bundleCenter + line.local * 0.3 * (1 - duel), fk);
        }
        let wave =
          (Math.sin(TAU * line.freq * 1.35 * u + clock * 0.35 + line.phase) * 0.62 +
            Math.sin(TAU * line.freq * 2.6 * u - clock * 0.23 + line.phase2) * 0.38) *
          line.weight;
        if (impact > 0) wave += impact * 1.6 * Math.exp(-(((u - keyU) / 0.05) ** 2)) * Math.sin(u * 70 - timestamp * 0.009);
        // Positive offsets go up: +1 is the upper bundle.
        let y = common[i]! - half * (offset * width[i]! + wave * amp[i]!);
        const x = xs[i]! + twist[i]! * line.offset;
        lx[row + i] = x;
        if (pushing) {
          const dx = x - pointer.x;
          const dy = y - pointer.y;
          const distance2 = dx * dx + dy * dy;
          if (distance2 < pushRadius * pushRadius) {
            const falloff = 1 - distance2 / (pushRadius * pushRadius);
            y += (dy >= 0 ? 1 : -1) * falloff * falloff * pushRadius * 0.45 * pointer.strength;
          }
        }
        ys[row + i] = y;
      }
    }

    // --- strokes, batched by style ---------------------------------------
    const baseAlpha = count >= 60 ? 0.2 : count >= 36 ? 0.28 : 0.36;
    const nowIndex = Math.round(clamp01(now) * samples);
    const keyIndex = Math.round(clamp01(keyU) * samples);
    const base = new Path2D();
    const strong = new Path2D();
    const faint = new Path2D();
    const green = new Path2D();
    const addSegment = (path: Path2D, row: number, from: number, to: number) => {
      if (to <= from) return;
      path.moveTo(lx[row + from]!, ys[row + from]!);
      for (let i = from + 1; i <= to; i += 1) path.lineTo(lx[row + i]!, ys[row + i]!);
    };
    const bundleOf = (line: Line) => {
      const emphasized = line.side > 0 ? emphUp : emphDown;
      const other = line.side > 0 ? emphDown : emphUp;
      const dismissed = line.side > 0 ? chosenDown : chosenUp;
      if (dismissed > 0.5) return faint;
      if (emphasized > 0.5) return strong;
      if (other > 0.5) return faint;
      return base;
    };
    for (let l = 0; l < count; l += 1) {
      const line = this.lines[l]!;
      const row = l * (samples + 1);
      if (fork > 0.02) {
        addSegment(base, row, 0, keyIndex);
        addSegment(line.side > 0 ? strong : green, row, keyIndex, samples);
      } else if (split > 0.05) {
        addSegment(base, row, 0, nowIndex);
        addSegment(bundleOf(line), row, nowIndex, samples);
      } else {
        addSegment(base, row, 0, samples);
      }
    }
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.lineWidth = mobile ? 0.7 : 0.75;
    ctx.strokeStyle = `rgba(${INK}, ${baseAlpha})`;
    ctx.stroke(base);
    ctx.strokeStyle = `rgba(${INK}, ${Math.min(0.62, baseAlpha * 1.9)})`;
    ctx.stroke(strong);
    ctx.strokeStyle = `rgba(${INK}, ${baseAlpha * 0.35})`;
    ctx.stroke(faint);
    ctx.strokeStyle = `rgba(${GREEN}, ${Math.min(0.7, baseAlpha * 1.7) * fork})`;
    ctx.stroke(green);

    // Transverse lines give the family its surface where life is still open. On a phone the
    // opening's tangle is too dense for them, so they only fade in once the story begins.
    const meshAlpha = mobile ? 1 - hero : 1;
    if (config.mesh > 0 && meshAlpha > 0.05) {
      const mesh = new Path2D();
      const first = Math.min(samples, Math.max(0, pinch > 0.5 ? nowIndex + 2 : 0));
      const stepCount = config.mesh;
      for (let j = 0; j < stepCount; j += 1) {
        const i = Math.round(first + ((samples - first) * (j + 0.5)) / stepCount);
        if (i > samples || width[i]! < 0.14) continue;
        const gap = splitW[i]! > 0.3 || forkW[i]! > 0.3;
        let started = false;
        for (let l = 0; l < count; l += 1) {
          const line = this.lines[l]!;
          const previous = this.lines[l - 1];
          const x = lx[l * (samples + 1) + i]!;
          const y = ys[l * (samples + 1) + i]!;
          if (!started || (gap && previous && previous.side !== line.side)) {
            mesh.moveTo(x, y);
            started = true;
          } else {
            mesh.lineTo(x, y);
          }
        }
      }
      ctx.lineWidth = 0.6;
      ctx.strokeStyle = `rgba(${INK}, ${baseAlpha * 0.5 * meshAlpha})`;
      ctx.stroke(mesh);
    }

    const storyAlpha = 1 - hero;
    const commonAt = (u: number) => common[Math.round(clamp01(u) * samples)]!;
    const xAt = (u: number) => x0 + clamp01(u) * (x1 - x0);

    // The lived line: one crisp stroke from graduation to now (or to the key point).
    if (pinch > 0.3) {
      const end = fork > 0.02 ? keyIndex : nowIndex;
      const lived = new Path2D();
      lived.moveTo(xs[0]!, common[0]!);
      for (let i = 1; i <= end; i += 1) lived.lineTo(xs[i]!, common[i]!);
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = `rgba(${INK}, ${0.85 * pinch})`;
      ctx.stroke(lived);
    }

    // Two lives: black continues, green is the life not lived.
    if (duel > 0.02) {
      const original = new Path2D();
      const parallel = new Path2D();
      original.moveTo(xs[keyIndex]!, common[keyIndex]!);
      parallel.moveTo(xs[keyIndex]!, common[keyIndex]!);
      for (let i = keyIndex + 1; i <= samples; i += 1) {
        original.lineTo(xs[i]!, common[i]!);
        parallel.lineTo(xs[i]!, common[i]! + half * 0.62 * width[i]! * forkW[i]!);
      }
      ctx.lineWidth = 1.7;
      ctx.strokeStyle = `rgba(${INK}, ${0.9 * duel})`;
      ctx.stroke(original);
      ctx.strokeStyle = `rgba(${GREEN}, ${duel})`;
      ctx.stroke(parallel);
    }

    // Facts: ticks on the lived line.
    if (storyAlpha > 0.05) {
      ctx.lineWidth = 1;
      ctx.strokeStyle = `rgba(${INK}, ${0.75 * storyAlpha})`;
      const ticks = new Path2D();
      for (const fact of target.facts) {
        const x = xAt(fact.u);
        const y = commonAt(fact.u);
        ticks.moveTo(x, y - 5);
        ticks.lineTo(x, y + 5);
      }
      ctx.stroke(ticks);
    }

    // The present: a dashed vertical and a small ring.
    if (storyAlpha > 0.05 && pinch > 0.3 && duel < 0.98) {
      const x = xAt(now);
      const y = commonAt(now);
      ctx.save();
      ctx.setLineDash([2, 4]);
      ctx.lineWidth = 1;
      ctx.strokeStyle = `rgba(${INK}, ${0.28 * storyAlpha * (1 - duel)})`;
      ctx.beginPath();
      ctx.moveTo(x, cy - half * 1.05);
      ctx.lineTo(x, cy + half * 1.05);
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = "#f4f4f1";
      ctx.strokeStyle = `rgba(${INK}, ${0.9 * storyAlpha * (1 - duel)})`;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(x, y, 3.6, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }

    // The key decision: a solid point, with one ring when life hits it.
    if (keyVisible > 0.01) {
      const x = xAt(keyU);
      const y = commonAt(keyU);
      ctx.fillStyle = `rgba(${INK}, ${keyVisible})`;
      ctx.beginPath();
      ctx.arc(x, y, 4.8, 0, TAU);
      ctx.fill();
      if (impact > 0) {
        ctx.lineWidth = 1;
        ctx.strokeStyle = `rgba(${INK}, ${0.5 * impact})`;
        ctx.beginPath();
        ctx.arc(x, y, 4.8 + (1 - impact) * 34, 0, TAU);
        ctx.stroke();
      }
    }

    this.drawLabels({ W, x0, x1, cy, half, now, split, fork, duel, emphUp, emphDown, storyAlpha, common, width, samples, mobile });

    // Keep the reading column quiet on desktop.
    if (!mobile) {
      const fadeStart = W * 0.4;
      const fadeEnd = W * 0.5;
      const strength = lerp(0.92, 0.55, hero);
      ctx.save();
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = `rgba(0, 0, 0, ${strength})`;
      ctx.fillRect(0, 0, fadeStart, H);
      const gradient = ctx.createLinearGradient(fadeStart, 0, fadeEnd, 0);
      gradient.addColorStop(0, `rgba(0, 0, 0, ${strength})`);
      gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = gradient;
      ctx.fillRect(fadeStart, 0, fadeEnd - fadeStart, H);
      ctx.restore();
    }
  }

  private drawLabels(view: {
    W: number;
    x0: number;
    x1: number;
    cy: number;
    half: number;
    now: number;
    split: number;
    fork: number;
    duel: number;
    emphUp: number;
    emphDown: number;
    storyAlpha: number;
    common: Float32Array;
    width: Float32Array;
    samples: number;
    mobile: boolean;
  }): void {
    const { ctx } = this;
    const { x0, x1, cy, half, now, split, fork, duel, emphUp, emphDown, storyAlpha, common, width, samples, mobile } = view;
    if (storyAlpha < 0.05) return;
    const xAt = (u: number) => x0 + clamp01(u) * (x1 - x0);
    const index = (u: number) => Math.round(clamp01(u) * samples);

    // The time axis.
    const axisY = cy + half * (mobile ? 1.05 : 1.12);
    ctx.lineWidth = 1;
    ctx.strokeStyle = `rgba(${INK}, ${0.3 * storyAlpha})`;
    ctx.beginPath();
    ctx.moveTo(x0, axisY);
    ctx.lineTo(x1, axisY);
    for (const u of [TIMELINE.start, TIMELINE.year1, TIMELINE.year3, TIMELINE.year5]) {
      ctx.moveTo(xAt(u), axisY - 3);
      ctx.lineTo(xAt(u), axisY + 3);
    }
    ctx.stroke();
    ctx.font = AXIS_FONT;
    ctx.fillStyle = `rgba(${INK}, ${0.55 * storyAlpha})`;
    ctx.textBaseline = "top";
    ctx.textAlign = "center";
    const labels: [number, string][] = [
      [TIMELINE.year1, "1 年"],
      [TIMELINE.year3, "3 年"],
      [TIMELINE.year5, "5 年"],
    ];
    ctx.textAlign = "left";
    ctx.fillText("毕业", xAt(TIMELINE.start) - (mobile ? 0 : 10), axisY + 7);
    ctx.textAlign = "center";
    for (const [u, text] of labels) ctx.fillText(text, xAt(u), axisY + 7);
    if (duel < 0.5) {
      ctx.fillStyle = `rgba(${INK}, ${0.85 * storyAlpha})`;
      ctx.fillText("此刻", Math.min(x1 - 14, Math.max(x0 + 14, xAt(now))), axisY + 7 + 15);
    }

    // Bundle annotations, as in an editorial diagram, on a paper chip so lines never cross the text.
    ctx.font = LABEL_FONT;
    ctx.textBaseline = "middle";
    const labelU = 0.9;
    const i = index(labelU);
    const x = Math.min(xAt(labelU), x1 - 8);
    ctx.textAlign = "right";
    const label = (text: string, y: number, alpha: number) => {
      const textWidth = ctx.measureText(text).width;
      ctx.fillStyle = `rgba(244, 244, 241, ${0.86 * Math.min(1, alpha * 1.4)})`;
      ctx.fillRect(x - textWidth - 6, y - 10, textWidth + 12, 20);
      ctx.fillStyle = `rgba(${INK}, ${alpha})`;
      ctx.fillText(text, x, y);
    };
    if (split > 0.5 && fork < 0.1) {
      const upperY = common[i]! - half * 0.58 * width[i]! - (mobile ? 20 : 30);
      const lowerY = common[i]! + half * 0.58 * width[i]! + (mobile ? 20 : 30);
      label("顺势发展的可能", upperY, (emphDown > 0.5 ? 0.4 : 0.85) * split * storyAlpha);
      label("意料之外的变化", lowerY, (emphUp > 0.5 ? 0.4 : 0.85) * split * storyAlpha);
    }
    if (fork > 0.5) {
      const originalY = common[i]! - (mobile ? 14 : 18);
      const parallelY = common[i]! + half * 0.62 * width[i]! + (mobile ? 16 : 22);
      label(duel > 0.5 ? "你走过的五年" : "原来的五年", originalY, 0.85 * fork * storyAlpha);
      label("另一种可能", parallelY, 0.85 * fork * storyAlpha);
    }
  }
}
