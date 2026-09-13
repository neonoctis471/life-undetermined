import { exchangeAuthorizationCode } from "@/zhihu/oauth";

import { STATE_COOKIE, backToGame, parseState, readCookie, readOAuthApp } from "../shared";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Completes the handshake and immediately discards the token. Nothing about the
 * player is read or stored; the only lasting effect is that Zhihu now counts
 * this person as having authorised the app.
 */
export async function GET(request: Request): Promise<Response> {
  const app = readOAuthApp();
  if (!app) return backToGame("unavailable", { app: null, request });

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const stored = parseState(readCookie(request.headers.get("cookie"), STATE_COOKIE));
  const returnOrigin = stored?.returnOrigin ?? null;

  // Cancelling on Zhihu's consent page is a normal choice, not an error.
  if (!code) return backToGame("declined", { app, request, returnOrigin });
  if (!state || !stored || state !== stored.state) {
    console.warn("[zhihu-oauth] state mismatch");
    return backToGame("failed", { app, request, returnOrigin });
  }

  const result = await exchangeAuthorizationCode(app, code);
  if (!result.ok) console.warn(`[zhihu-oauth] exchange failed: ${result.reason}`);
  return backToGame(result.ok ? "ok" : "failed", { app, request, returnOrigin });
}
