import { afterEach, describe, expect, it, vi } from "vitest";

import { getZhihuOAuthEnvironment } from "@/config/server-env";
import { buildAuthorizeUrl, exchangeAuthorizationCode } from "@/zhihu/oauth";
import {
  cookieDomain,
  isReturnableOrigin,
  parseState,
  serializeState,
  stateCookie,
} from "@/app/api/v1/zhihu/oauth/shared";

const APP = { appId: "439", appKey: "test-key", redirectUri: "https://example.com/api/v1/zhihu/oauth/callback" };

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("buildAuthorizeUrl", () => {
  it("sends the parameters the service asks for", () => {
    const url = new URL(buildAuthorizeUrl(APP, "nonce-1"));
    expect(url.origin + url.pathname).toBe("https://openapi.zhihu.com/authorize");
    expect(url.searchParams.get("app_id")).toBe("439");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("redirect_uri")).toBe(APP.redirectUri);
    expect(url.searchParams.get("state")).toBe("nonce-1");
  });

  it("never carries the app key", () => {
    expect(buildAuthorizeUrl(APP, "nonce-1")).not.toContain(APP.appKey);
  });
});

describe("exchangeAuthorizationCode", () => {
  it("posts the five required form fields", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ access_token: "secret-token" }));
    vi.stubGlobal("fetch", fetchMock);

    await exchangeAuthorizationCode(APP, "code-1");

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://openapi.zhihu.com/access_token");
    expect(init.method).toBe("POST");
    const sent = new URLSearchParams(String(init.body));
    expect(Object.fromEntries(sent)).toEqual({
      grant_type: "authorization_code",
      app_id: "439",
      app_key: "test-key",
      code: "code-1",
      redirect_uri: APP.redirectUri,
    });
  });

  it("reports success without ever handing back the token", async () => {
    vi.stubGlobal("fetch", async () => jsonResponse({ access_token: "secret-token" }));
    const result = await exchangeAuthorizationCode(APP, "code-1");
    expect(result).toEqual({ ok: true });
    expect(JSON.stringify(result)).not.toContain("secret-token");
  });

  it("treats the service's 200-with-error-body as a failure", async () => {
    vi.stubGlobal("fetch", async () => jsonResponse({ code: 20001, data: "Access denied: not exists" }));
    expect(await exchangeAuthorizationCode(APP, "bad")).toEqual({ ok: false, reason: "Access denied: not exists" });
  });

  it("fails closed when the network or body is unusable", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new Error("offline");
    });
    expect(await exchangeAuthorizationCode(APP, "code-1")).toEqual({ ok: false, reason: "network" });

    vi.stubGlobal("fetch", async () => new Response("<html>", { status: 200 }));
    expect(await exchangeAuthorizationCode(APP, "code-1")).toEqual({ ok: false, reason: "malformed" });

    vi.stubGlobal("fetch", async () => new Response("", { status: 502 }));
    expect(await exchangeAuthorizationCode(APP, "code-1")).toEqual({ ok: false, reason: "http_502" });
  });
});

describe("getZhihuOAuthEnvironment", () => {
  const valid = {
    ZHIHU_OAUTH_APP_ID: "439",
    ZHIHU_OAUTH_APP_KEY: "k",
    ZHIHU_OAUTH_REDIRECT_URI: "https://example.com/api/v1/zhihu/oauth/callback",
  };

  it("accepts a complete configuration", () => {
    expect(getZhihuOAuthEnvironment(valid)).toEqual(valid);
  });

  it("returns null instead of throwing when unset, so the game still boots", () => {
    expect(getZhihuOAuthEnvironment({})).toBeNull();
    expect(getZhihuOAuthEnvironment({ ...valid, ZHIHU_OAUTH_APP_ID: "not-a-number" })).toBeNull();
    expect(getZhihuOAuthEnvironment({ ...valid, ZHIHU_OAUTH_REDIRECT_URI: "/relative" })).toBeNull();
  });
});

describe("return-origin handling", () => {
  const PROD = "https://indeterminate.eilnoctis.com/api/v1/zhihu/oauth/callback";

  it("shares the nonce cookie across the sibling hosts the game is served on", () => {
    expect(cookieDomain(PROD)).toBe("eilnoctis.com");
    expect(cookieDomain("https://eilnoctis.com/cb")).toBe("eilnoctis.com");
    // A Domain attribute would be rejected for these.
    expect(cookieDomain("http://localhost:3012/cb")).toBeNull();
    expect(cookieDomain("http://127.0.0.1:3012/cb")).toBeNull();
  });

  it("marks the cookie Secure and HttpOnly on https only", () => {
    const secure = stateCookie("n", PROD, 600);
    expect(secure).toContain("HttpOnly");
    expect(secure).toContain("SameSite=Lax");
    expect(secure).toContain("Domain=eilnoctis.com");
    expect(secure).toContain("Secure");
    expect(stateCookie("n", "http://localhost:3012/cb", 600)).not.toContain("Secure");
  });

  it("round-trips the origin the player started from", () => {
    const raw = serializeState("nonce", "https://eilnoctis.com");
    expect(parseState(raw)).toEqual({ state: "nonce", returnOrigin: "https://eilnoctis.com" });
    expect(parseState("nonce")).toEqual({ state: "nonce", returnOrigin: null });
    expect(parseState(null)).toBeNull();
  });

  it("refuses to send the player anywhere outside the registered domain", () => {
    expect(isReturnableOrigin("https://eilnoctis.com", PROD)).toBe(true);
    expect(isReturnableOrigin("https://preview.eilnoctis.com", PROD)).toBe(true);
    expect(isReturnableOrigin("https://evil.com", PROD)).toBe(false);
    // The suffix must be a real label boundary, not a prefix match.
    expect(isReturnableOrigin("https://eilnoctis.com.evil.com", PROD)).toBe(false);
    expect(isReturnableOrigin("https://noteilnoctis.com", PROD)).toBe(false);
    expect(isReturnableOrigin("javascript:alert(1)", PROD)).toBe(false);
    expect(isReturnableOrigin("not a url", PROD)).toBe(false);
  });
});
