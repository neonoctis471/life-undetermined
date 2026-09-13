import { exchangeAuthorizationCode } from "@/zhihu/oauth";

import { STATE_COOKIE, backToGame, parseState, readCookie, readOAuthApp } from "../shared";

export const runtime = "nodejs";
export const maxDuration = 30;

/*
 * Every outcome is logged, including the ones that worked. Silence on the happy
 * path sounds tidy right up until a handshake comes back empty and there is no
 * way to tell "the player changed their mind" from "the provider refused us" —
 * which is exactly the hole this once fell into.
 *
 * What is logged is deliberately narrow: parameter names, the provider's own
 * error strings, and whether a code arrived — never the code, never the token.
 */
export async function GET(request: Request): Promise<Response> {
  const app = readOAuthApp();
  if (!app) {
    console.warn("[zhihu-oauth] callback hit with no OAuth app configured");
    return backToGame("unavailable", { app: null, request });
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const stored = parseState(readCookie(request.headers.get("cookie"), STATE_COOKIE));
  const returnOrigin = stored?.returnOrigin ?? null;

  const error = url.searchParams.get("error") ?? url.searchParams.get("error_code");
  const detail = url.searchParams.get("error_description") ?? url.searchParams.get("error_msg");
  console.info(
    `[zhihu-oauth] callback params=[${[...url.searchParams.keys()].join(",") || "none"}]` +
      ` code=${code ? "yes" : "no"} state=${state ? "yes" : "no"} cookie=${stored ? "yes" : "no"}` +
      ` error=${error ?? "-"} detail=${(detail ?? "-").slice(0, 200)}`,
  );

  // An explicit refusal from the provider is a failure, not a change of heart.
  if (error) return backToGame("failed", { app, request, returnOrigin });
  // Cancelling on the consent page is a normal choice.
  if (!code) return backToGame("declined", { app, request, returnOrigin });

  if (!state || !stored || state !== stored.state) {
    console.warn(`[zhihu-oauth] state mismatch (returned=${state ? "yes" : "no"}, stored=${stored ? "yes" : "no"})`);
    return backToGame("failed", { app, request, returnOrigin });
  }

  const result = await exchangeAuthorizationCode(app, code);
  console.info(`[zhihu-oauth] exchange ${result.ok ? "ok" : `failed: ${result.reason}`}`);
  return backToGame(result.ok ? "ok" : "failed", { app, request, returnOrigin });
}
