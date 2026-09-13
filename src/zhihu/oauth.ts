import "server-only";

/*
 * Zhihu OAuth, used for one purpose only: letting a player voluntarily sign in
 * so the hackathon platform can count this play as an authorised use.
 *
 * The access token is deliberately never returned from this module. It is read
 * from the exchange response, checked for presence, and dropped. Nothing about
 * the player is stored, so the game keeps working exactly the same whether or
 * not anyone ever signs in, and there is no session to protect.
 *
 * Endpoint contract verified against the live service on 2026-09-13 with dummy
 * credentials; the error bodies name each missing parameter.
 */

const AUTHORIZE_ENDPOINT = "https://openapi.zhihu.com/authorize";
const TOKEN_ENDPOINT = "https://openapi.zhihu.com/access_token";
const EXCHANGE_TIMEOUT_MS = 10_000;

export interface ZhihuOAuthApp {
  appId: string;
  appKey: string;
  redirectUri: string;
}

/** `redirectUri` must match the one registered for the app, character for character. */
export function buildAuthorizeUrl(app: Omit<ZhihuOAuthApp, "appKey">, state: string): string {
  const url = new URL(AUTHORIZE_ENDPOINT);
  url.searchParams.set("app_id", app.appId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", app.redirectUri);
  url.searchParams.set("state", state);
  return url.toString();
}

export type ExchangeResult = { ok: true } | { ok: false; reason: string };

/**
 * Trades the authorization code for a token and throws the token away. The
 * boolean is the entire result: the caller has no way to leak what it cannot
 * see. `reason` is only ever the service's own error string or a status code,
 * never a response body that could contain a token.
 */
export async function exchangeAuthorizationCode(app: ZhihuOAuthApp, code: string): Promise<ExchangeResult> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    app_id: app.appId,
    app_key: app.appKey,
    code,
    redirect_uri: app.redirectUri,
  });

  let response: Response;
  try {
    response = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(EXCHANGE_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    return { ok: false, reason: "network" };
  }

  if (!response.ok) return { ok: false, reason: `http_${response.status}` };

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return { ok: false, reason: "malformed" };
  }

  // The service answers 200 for its own errors, shaped {code, data: "message"}.
  const record = typeof payload === "object" && payload !== null ? (payload as Record<string, unknown>) : {};
  const token = record.access_token;
  if (typeof token === "string" && token.length > 0) return { ok: true };

  const message = typeof record.data === "string" ? record.data : "unknown";
  return { ok: false, reason: message.slice(0, 120) };
}
