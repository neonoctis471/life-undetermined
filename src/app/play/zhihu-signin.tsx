"use client";

import { useEffect, useSyncExternalStore } from "react";

import { ArrowUpRight } from "./glyphs";

/*
 * Signing in with Zhihu is what opens the game: the platform counts a work's
 * players by OAuth authorisations, so a play that nobody authorised is a play
 * that never happened as far as the event is concerned.
 *
 * It still reads none of the player's data and grants us nothing — the token is
 * discarded the moment the handshake completes. The one thing it must never do
 * is lock the work away: anyone the handshake actually fails is let through, so
 * an outage on Zhihu's side costs us the count, not the work.
 *
 * Self-contained on purpose — it owns its own storage and query-flag handling,
 * so the page's game state and hook order stay untouched. The address bar and
 * localStorage are read through a store rather than through setState, because
 * they are external systems that the component only observes.
 */

const SIGNED_IN_KEY = "zhihu-five-years-game:signed-in";
/*
 * Set only when someone tried to sign in and the handshake failed. Signing in
 * is required to play, but a broken or unreachable Zhihu must never be able to
 * turn the whole work into a wall nobody can get past — so the gate falls open
 * for anyone it has actually failed.
 */
const BYPASS_KEY = "zhihu-five-years-game:signin-unavailable";
/*
 * Written the moment the player leaves for the consent page. The bypass above
 * only covers handshakes that come back to us; when Zhihu's own page is the
 * thing that breaks — an unapproved callback, an outage — the player never
 * returns through the callback at all, and without this they would come back to
 * the same locked door with no way to say "it did not work".
 */
const ATTEMPTED_KEY = "zhihu-five-years-game:signin-attempted";

/*
 * Whether signing in is required to play at all. It is a switch rather than a
 * constant because the work has to stay reachable during judging: if Zhihu's
 * consent page starts failing, flipping this off in the deployment and
 * redeploying reopens the game without touching code. Public by design — it
 * decides what the page renders, and it is not a secret.
 */
const REQUIRE_SIGN_IN = process.env.NEXT_PUBLIC_ZHIHU_REQUIRE_SIGNIN === "1";

type Outcome = "ok" | "failed" | "unavailable" | "declined";
interface Status {
  signedIn: boolean;
  bypassed: boolean;
  attempted: boolean;
  outcome: Outcome | null;
}

const SERVER_STATUS: Status = { signedIn: false, bypassed: false, attempted: false, outcome: null };

let lastOutcome: Outcome | null = null;
let cached: Status | null = null;
const listeners = new Set<() => void>();

function read(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    // Private mode or blocked storage: the player is simply asked again.
    return false;
  }
}

function write(key: string): void {
  try {
    window.localStorage.setItem(key, "1");
  } catch {
    /* Nothing depends on this persisting beyond the visit. */
  }
}

// Cached so the snapshot keeps its identity between renders.
function snapshot(): Status {
  return (cached ??= {
    signedIn: read(SIGNED_IN_KEY),
    bypassed: read(BYPASS_KEY),
    attempted: read(ATTEMPTED_KEY),
    outcome: lastOutcome,
  });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function invalidate(): void {
  cached = null;
  for (const listener of listeners) listener();
}

/** Remembers that this player has already been sent to the consent page once. */
function markAttempt(): void {
  write(ATTEMPTED_KEY);
}

function letThrough(): void {
  write(BYPASS_KEY);
  invalidate();
}

/** Reads the flag the callback route left behind, then clears it from the URL. */
function consumeCallbackFlag(): void {
  const flag = new URLSearchParams(window.location.search).get("zhihu") as Outcome | null;
  if (!flag) return;

  if (flag === "ok") write(SIGNED_IN_KEY);
  // A failed or unavailable handshake earns the player a way in regardless.
  if (flag === "failed" || flag === "unavailable") write(BYPASS_KEY);
  lastOutcome = flag;

  // Strip the flag so a refresh does not replay the message.
  const url = new URL(window.location.href);
  url.searchParams.delete("zhihu");
  window.history.replaceState(null, "", url.toString());
  invalidate();
}

/*
 * Every outcome says something. An attempt that comes back and changes nothing
 * on screen is the worst of the three — the player cannot tell whether it
 * worked, and neither can we.
 */
function note(outcome: Outcome | null): string {
  switch (outcome) {
    case "failed":
      return "刚才没能登录成功，可以再试一次。不登录也能玩完整个游戏。";
    case "declined":
      return "刚才没有完成授权。想支持的话可以再试一次；不登录也能玩完整个游戏。";
    case "unavailable":
      return "知乎登录暂时不可用，不影响你玩完整个游戏。";
    default:
      return "完全可选。不登录一样能玩完整个游戏，我们也不会读取或保存你的任何知乎数据。";
  }
}

/*
 * The hero's action area. Until the player has signed in — or has been let
 * through by a failure — the only way forward is the consent page; afterwards
 * this is the ordinary start button it has always been.
 */
export function ZhihuGate({ onStart, startLabel }: { onStart(): void; startLabel: string }) {
  const status = useSyncExternalStore(subscribe, snapshot, () => SERVER_STATUS);
  // Idempotent: the flag is gone after the first pass, so a re-run does nothing.
  useEffect(consumeCallbackFlag, []);

  if (!REQUIRE_SIGN_IN || status.signedIn || status.bypassed) {
    return (
      <>
        <div className="hero-action">
          <button className="btn btn-primary" onClick={onStart}>
            {startLabel}
            <span aria-hidden="true"><ArrowUpRight /></span>
          </button>
          <span className="hero-duration">约 8–10 分钟</span>
        </div>
        {status.signedIn ? (
          <p className="muted zhihu-signin is-done">
            已用知乎账号登录 <span aria-hidden="true">✓</span> 感谢支持这个作品。
          </p>
        ) : status.bypassed ? (
          <p className="muted zhihu-signin is-done">知乎登录暂时不可用，已经为你放行，不影响你玩完整个游戏。</p>
        ) : (
          // Sign-in is not being required: offer it, do not insist on it.
          <div className="zhihu-signin">
            <a className="link-button" href="/api/v1/zhihu/oauth/start" onClick={markAttempt}>
              用知乎账号登录，支持这个作品 <ArrowUpRight />
            </a>
            <p className="muted">{note(status.outcome)}</p>
          </div>
        )}
      </>
    );
  }

  return (
    <div className="zhihu-gate">
      <div className="hero-action">
        <a className="btn btn-primary" href="/api/v1/zhihu/oauth/start" onClick={markAttempt}>
          用知乎账号登录，开始
          <span aria-hidden="true"><ArrowUpRight /></span>
        </a>
        <span className="hero-duration">约 8–10 分钟</span>
      </div>
      <p className="muted">
        {status.outcome
          ? note(status.outcome)
          : "这是知乎黑客松参赛作品，需要用知乎账号登录后体验。登录只用于确认你来过，我们不会读取或保存你的任何知乎数据。"}
      </p>
      {status.attempted && (
        <button className="link-button" onClick={letThrough}>
          授权页打不开，或者试过没成功？直接开始 <span aria-hidden="true">→</span>
        </button>
      )}
    </div>
  );
}

/** A quiet thank-you at the ending, and a second chance for anyone let through. */
export function ZhihuSignIn() {
  const status = useSyncExternalStore(subscribe, snapshot, () => SERVER_STATUS);

  if (status.signedIn) {
    return (
      <p className="muted zhihu-signin is-done ending">
        已用知乎账号登录 <span aria-hidden="true">✓</span> 感谢支持这个作品。
      </p>
    );
  }

  return (
    <div className="zhihu-signin ending">
      <a className="link-button" href="/api/v1/zhihu/oauth/start">
        用知乎账号登录，支持这个作品 <ArrowUpRight />
      </a>
      <p className="muted">
        走完了两条路，如果这一趟对你有用，登录一下就是最好的支持。不读取也不保存你的任何知乎数据。
      </p>
    </div>
  );
}
