import { randomUUID } from "node:crypto";

import { buildAuthorizeUrl } from "@/zhihu/oauth";

import {
  STATE_MAX_AGE_SECONDS,
  backToGame,
  readOAuthApp,
  requestOrigin,
  serializeState,
  stateCookie,
} from "../shared";

export const runtime = "nodejs";

/** Opens Zhihu's consent page. Signing in is voluntary and changes nothing in the game. */
export function GET(request: Request): Response {
  const app = readOAuthApp();
  if (!app) return backToGame("unavailable", { app: null, request });

  const state = randomUUID();
  const cookie = serializeState(state, requestOrigin(request));
  return new Response(null, {
    status: 302,
    headers: new Headers({
      Location: buildAuthorizeUrl(app, state),
      "Set-Cookie": stateCookie(cookie, app.redirectUri, STATE_MAX_AGE_SECONDS),
    }),
  });
}
