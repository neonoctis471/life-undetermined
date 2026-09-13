"use client";

import { useEffect, useSyncExternalStore } from "react";

/*
 * A voluntary "sign in with Zhihu" affordance. It is deliberately powerless:
 * signing in unlocks nothing, changes no copy, reads none of the player's data,
 * and the game is complete without ever touching it. It exists so that a player
 * who wants to can have this play counted as an authorised use of the work.
 *
 * Self-contained on purpose — it owns its own storage and query-flag handling,
 * so the page's game state and hook order stay untouched. The address bar and
 * localStorage are read through a store rather than through setState, because
 * they are external systems that the component only observes.
 */

const SIGNED_IN_KEY = "zhihu-five-years-game:signed-in";

type Outcome = "ok" | "failed" | "unavailable" | "declined";
interface Status {
  signedIn: boolean;
  outcome: Outcome | null;
}

const SERVER_STATUS: Status = { signedIn: false, outcome: null };

let lastOutcome: Outcome | null = null;
let cached: Status | null = null;
const listeners = new Set<() => void>();

function read(): boolean {
  try {
    return window.localStorage.getItem(SIGNED_IN_KEY) === "1";
  } catch {
    // Private mode or blocked storage: the button simply stays available.
    return false;
  }
}

// Cached so the snapshot keeps its identity between renders.
function snapshot(): Status {
  return (cached ??= { signedIn: read(), outcome: lastOutcome });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function invalidate(): void {
  cached = null;
  for (const listener of listeners) listener();
}

/** Reads the flag the callback route left behind, then clears it from the URL. */
function consumeCallbackFlag(): void {
  const flag = new URLSearchParams(window.location.search).get("zhihu") as Outcome | null;
  if (!flag) return;

  if (flag === "ok") {
    try {
      window.localStorage.setItem(SIGNED_IN_KEY, "1");
    } catch {
      /* Nothing depends on this persisting; the thanks still shows this visit. */
    }
  }
  lastOutcome = flag;

  // Strip the flag so a refresh does not replay the message.
  const url = new URL(window.location.href);
  url.searchParams.delete("zhihu");
  window.history.replaceState(null, "", url.toString());
  invalidate();
}

export function ZhihuSignIn() {
  const status = useSyncExternalStore(subscribe, snapshot, () => SERVER_STATUS);
  // Idempotent: the flag is gone after the first pass, so a re-run does nothing.
  useEffect(consumeCallbackFlag, []);

  if (status.signedIn) {
    return (
      <p className="muted zhihu-signin is-done">
        已用知乎账号登录 <span aria-hidden="true">✓</span> 感谢支持这个作品。
      </p>
    );
  }

  return (
    <div className="zhihu-signin">
      <a className="link-button" href="/api/v1/zhihu/oauth/start">
        用知乎账号登录，支持这个作品 <span aria-hidden="true">↗</span>
      </a>
      <p className="muted">
        {status.outcome === "failed" && "刚才没登录成功，可以再试一次。"}
        {status.outcome === "unavailable" && "登录暂时不可用，不影响游戏。"}
        {(status.outcome === null || status.outcome === "declined") &&
          "完全可选。不登录一样能玩完整个游戏，我们也不会读取或保存你的任何知乎数据。"}
      </p>
    </div>
  );
}
