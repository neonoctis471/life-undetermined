import "server-only";

import { getZhihuEnvironment } from "@/config/server-env";

import { ZhihuSearchResponseSchema } from "./contracts";
import { toEvidence, ZhihuUnavailableError, type ZhihuSearchProvider } from "./provider";

// The outbound host is fixed; no URL from a model or a client is ever requested.
const ENDPOINT = "https://developer.zhihu.com/api/v1/content/zhihu_search";
const RESULT_COUNT = "10";
const MAX_RESPONSE_CHARS = 1_000_000;

type ZhihuEnvironment = ReturnType<typeof getZhihuEnvironment>;

export function createZhihuHttpProvider(
  env: ZhihuEnvironment = getZhihuEnvironment(),
  fetchImpl: typeof fetch = fetch,
): ZhihuSearchProvider {
  return {
    async search(query, timeoutMs) {
      const url = new URL(ENDPOINT);
      url.searchParams.set("Query", query);
      url.searchParams.set("Count", RESULT_COUNT);
      let response: Response;
      try {
        response = await fetchImpl(url, {
          headers: {
            Authorization: `Bearer ${env.ZHIHU_ACCESS_SECRET}`,
            "X-Request-Timestamp": String(Math.floor(Date.now() / 1000)),
          },
          signal: AbortSignal.timeout(timeoutMs),
          redirect: "error",
          cache: "no-store",
        });
      } catch {
        throw new ZhihuUnavailableError("zhihu search request failed");
      }
      if (!response.ok) throw new ZhihuUnavailableError(`zhihu search returned HTTP ${response.status}`);
      if (!(response.headers.get("content-type") ?? "").includes("json")) {
        throw new ZhihuUnavailableError("zhihu search returned a non-JSON body");
      }
      let text: string;
      try {
        text = await response.text();
      } catch {
        throw new ZhihuUnavailableError("zhihu search response could not be read");
      }
      if (text.length > MAX_RESPONSE_CHARS) throw new ZhihuUnavailableError("zhihu search response is too large");
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        throw new ZhihuUnavailableError("zhihu search response is not JSON");
      }
      const parsed = ZhihuSearchResponseSchema.safeParse(json);
      if (!parsed.success) throw new ZhihuUnavailableError("zhihu search response has an unexpected shape");
      if (parsed.data.Code !== 0) throw new ZhihuUnavailableError(`zhihu search returned code ${parsed.data.Code}`);
      return (parsed.data.Data?.Items ?? []).flatMap((item) => {
        const evidence = toEvidence(item);
        return evidence ? [evidence] : [];
      });
    },
  };
}
