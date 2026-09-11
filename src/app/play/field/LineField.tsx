"use client";

import { useEffect, useRef } from "react";

import { LineFieldEngine } from "./engine";
import type { FieldTarget } from "./target";

/** The single visual device: the player's life as a family of lines. Decorative for assistive tech. */
export function LineField({ target, seed }: { target: FieldTarget; seed: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<LineFieldEngine | null>(null);
  const targetKey = JSON.stringify(target);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let engine: LineFieldEngine;
    try {
      engine = new LineFieldEngine(canvas, { reducedMotion: reduced.matches });
    } catch {
      return; // No 2D canvas: the game stays fully usable without the field.
    }
    engineRef.current = engine;
    const onChange = () => engine.setReducedMotion(reduced.matches);
    reduced.addEventListener("change", onChange);
    return () => {
      reduced.removeEventListener("change", onChange);
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    engineRef.current?.setSeed(seed);
  }, [seed]);

  useEffect(() => {
    engineRef.current?.setTarget(JSON.parse(targetKey) as FieldTarget);
  }, [targetKey]);

  return <canvas ref={canvasRef} className="line-field" aria-hidden="true" />;
}
