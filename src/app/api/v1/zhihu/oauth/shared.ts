import "server-only";

import { getZhihuOAuthEnvironment } from "@/config/server-env";
import type { ZhihuOAuthApp } from "@/zhihu/oauth";

/*
 * The handshake carries no session. The only thing that has to survive the trip
 * through Zhihu is a short-lived nonce plus the origin the player left from —
 * the game is served on several hosts, each with its own localStorage, and
 * landing someone back on a different one would look like their save vanished.
 * Both ride in one cookie scoped to the shared registrable domain.
 */
export const STATE_COOKIE = "zhihu_oauth_state";
export const STATE_COOKIE_PATH = "/api/v1/zhihu/oauth";
export const STATE_MAX_AGE_SECONDS = 600;

export type OAuthOutcome = "ok" | "failed" | "unavailable" | "declined";

export function readOAuthApp(): ZhihuOAuthApp | null {
  const env = getZhihuOAuthEnvironment();
  if (!env) return null;
  return {
    appId: env.ZHIHU_OAUTH_APP_ID,
    appKey: env.ZHIHU_OAUTH_APP_KEY,
    redirectUri: env.ZHIHU_OAUTH_REDIRECT_URI,
  };
}

/** `null` for localhost and bare IPs, where a Domain attribute would be rejected. */
export function cookieDomain(redirectUri: string): string | null {
  const host = new URL(redirectUri).hostname;
  if (!host.includes(".") || /^[\d.]+$/.test(host)) return null;
  const labels = host.split(".");
  return labels.length > 2 ? labels.slice(-2).join(".") : host;
}

/** The public origin of this request; behind Vercel's proxy `request.url` is internal. */
export function requestOrigin(request: Request): string | null {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!host) return null;
  const protocol = request.headers.get("x-forwarded-proto") ?? "https";
  return `${protocol}://${host}`;
}

/**
 * Only hosts under the same registrable domain as the registered callback may
 * be returned to, so a tampered cookie cannot turn this into an open redirect.
 */
export function isReturnableOrigin(origin: string, redirectUri: string): boolean {
  let host: string;
  try {
    const url = new URL(origin);
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
    host = url.hostname;
  } catch {
    return false;
  }
  const domain = cookieDomain(redirectUri);
  if (!domain) return host === new URL(redirectUri).hostname;
  return host === domain || host.endsWith(`.${domain}`);
}

export function serializeState(state: string, returnOrigin: string | null): string {
  return returnOrigin ? `${state}|${encodeURIComponent(returnOrigin)}` : state;
}

export function parseState(raw: string | null): { state: string; returnOrigin: string | null } | null {
  if (!raw) return null;
  const [state, encoded] = raw.split("|");
  if (!state) return null;
  if (!encoded) return { state, returnOrigin: null };
  try {
    return { state, returnOrigin: decodeURIComponent(encoded) };
  } catch {
    return { state, returnOrigin: null };
  }
}

export function stateCookie(value: string, redirectUri: string, maxAge: number): string {
  const domain = cookieDomain(redirectUri);
  return [
    `${STATE_COOKIE}=${value}`,
    `Path=${STATE_COOKIE_PATH}`,
    domain ? `Domain=${domain}` : "",
    `Max-Age=${maxAge}`,
    "HttpOnly",
    // Lax, so the cookie survives Zhihu's top-level redirect back to the callback.
    "SameSite=Lax",
    new URL(redirectUri).protocol === "https:" ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
}

/*
 * The two ends of this handshake do not agree on a name. Zhihu returns the
 * authorization code as `authorization_code`, while its own token endpoint
 * refuses anything but `code` — reading the standard OAuth name here silently
 * loses every successful authorisation, which is exactly what it did.
 */
export function readAuthorizationCode(url: URL): string | null {
  const code = url.searchParams.get("authorization_code") ?? url.searchParams.get("code");
  return code && code.length > 0 ? code : null;
}

export function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return null;
}

/** Lands the player back in the game, on the host they started from where possible. */
export function backToGame(
  outcome: OAuthOutcome,
  options: { app: ZhihuOAuthApp | null; request: Request; returnOrigin?: string | null },
): Response {
  const { app, request, returnOrigin } = options;
  const fallback = app ? new URL(app.redirectUri).origin : (requestOrigin(request) ?? new URL(request.url).origin);
  const origin = app && returnOrigin && isReturnableOrigin(returnOrigin, app.redirectUri) ? returnOrigin : fallback;

  const target = new URL("/play", origin);
  target.searchParams.set("zhihu", outcome);

  const headers = new Headers({ Location: target.toString() });
  // Expire the nonce on every exit path, including the ones that never set it.
  if (app) headers.append("Set-Cookie", stateCookie("", app.redirectUri, 0));
  return new Response(null, { status: 302, headers });
}
