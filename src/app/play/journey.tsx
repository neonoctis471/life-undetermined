"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";

import type { RecapSection } from "@/game/flow";

import { ArrowUpRight, CloseMark } from "./glyphs";

const STOPS = ["毕业那天", "第 8 天", "第 7 个月", "第 4 年", "五年以后", "两段人生"];

export function JourneyTrack({
  current,
  hovered,
  waiting,
  recaps,
}: {
  current: number;
  hovered: number;
  waiting: boolean;
  recaps: (RecapSection[] | null)[];
}) {
  const [open, setOpen] = useState<number | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  /*
   * A native dialog, for what it gives away free: Escape, focus kept inside,
   * and the top layer. Opening and closing it is a DOM call rather than state,
   * so the element and the React state stay in step through either route out.
   */
  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    if (open === null) node.close();
    else if (!node.open) node.showModal();
  }, [open]);

  const sections = open === null ? null : recaps[open];
  return (
    <>
      <ol className="journey-track" aria-label="人生旅程" data-waiting={waiting} style={{ "--branch": hovered } as CSSProperties}>
        {STOPS.map((label, index) => {
          const recap = recaps[index];
          const inner = (
            <>
              <span className="journey-number">{String(index).padStart(2, "0")}</span>
              <span className="journey-stop">{label}</span>
            </>
          );
          return (
            <li key={label} data-past={index < current} data-openable={recap !== null} aria-current={index === current ? "step" : undefined}>
              {recap ? (
                <button type="button" className="journey-open" onClick={() => setOpen(index)} aria-label={`回看${label}`}>
                  {inner}
                </button>
              ) : (
                inner
              )}
              <span className="journey-line" aria-hidden="true" />
            </li>
          );
        })}
      </ol>

      <dialog
        className="recap"
        ref={dialog}
        onClose={() => setOpen(null)}
        // Clicking the backdrop lands on the dialog itself; the panel stops its own clicks.
        onClick={(event) => {
          if (event.target === dialog.current) setOpen(null);
        }}
      >
        {open !== null && sections && (
          <div className="recap-panel">
            <header className="recap-head">
              <p className="eyebrow">
                <span className="chapter-chip">{String(open).padStart(2, "0")}</span>
                {STOPS[open]}
              </p>
              <button type="button" className="recap-close" onClick={() => setOpen(null)} aria-label="关闭回顾">
                <CloseMark />
              </button>
            </header>
            <div className="recap-body">
              {sections.map((section) => (
                <section key={section.heading}>
                  <h4>{section.heading}</h4>
                  {section.lines.map((line, index) => (
                    <p key={`${index}-${line.slice(0, 12)}`}>{line}</p>
                  ))}
                </section>
              ))}
            </div>
            <p className="recap-foot muted">这里只是回看，不会改变你已经走过的路。</p>
          </div>
        )}
      </dialog>
    </>
  );
}


export function HeroArtwork() {
  const artwork = useRef<HTMLDivElement>(null);
  const onMove = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const shift = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
    artwork.current?.style.setProperty("--shift", shift.toFixed(3));
  };
  return (
    <div className="hero-artwork" ref={artwork} onPointerMove={onMove} onPointerLeave={() => artwork.current?.style.setProperty("--shift", "0")} aria-hidden="true">
      <div className="art-offset" />
      <div className="art-poster">
        <span className="art-corner art-corner-tl" />
        <span className="art-corner art-corner-br" />
        <div className="art-topline"><span>人生未定式</span><span>00 — 05</span></div>
        <span className="art-five">05</span>
        <div className="art-orbit orbit-a" />
        <div className="art-orbit orbit-b" />
        <div className="art-emblem">
          <Image src="/brand/icon.png" alt="" width={440} height={440} priority sizes="(max-width: 700px) 280px, 440px" />
        </div>
        <svg className="art-paths" viewBox="0 0 420 180" fill="none">
          <path className="art-path-a" d="M210 180V113L74 40H16" />
          <path className="art-path-b" d="M210 180V113L346 40H404" />
          <path d="M210 180V44" strokeDasharray="3 8" />
          <circle cx="210" cy="113" r="7" fill="currentColor" stroke="none" />
        </svg>
        <div className="art-bottomline"><span>一种选择</span><span>另一种可能</span></div>
      </div>
      <div className="art-caption"><span>五年。</span><span>再走一遍。<b><ArrowUpRight /></b></span></div>
    </div>
  );
}

export function StageFocus({ view }: { view: string }) {
  const previous = useRef(view);
  useEffect(() => {
    if (previous.current === view) return;
    previous.current = view;
    const frame = requestAnimationFrame(() => {
      const heading = document.querySelector<HTMLElement>(".stage h1, .stage h2");
      heading?.setAttribute("tabindex", "-1");
      heading?.focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: "instant" });
    });
    return () => cancelAnimationFrame(frame);
  }, [view]);
  return null;
}
