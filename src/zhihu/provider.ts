import { isZhihuUrl, ZhihuSearchItemSchema, type ZhihuEvidence } from "./contracts";

/** Injectable for tests; the HTTP implementation lives in http-provider.ts (server-only). */
export interface ZhihuSearchProvider {
  search(query: string, timeoutMs: number): Promise<ZhihuEvidence[]>;
}

/** Zhihu failures never carry the access secret or upstream bodies. */
export class ZhihuUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ZhihuUnavailableError";
  }
}

const toCount = (value: unknown): number => {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
};

/** Accepts only items with a title, author, text and an https zhihu.com link. */
export function toEvidence(raw: unknown): ZhihuEvidence | null {
  const parsed = ZhihuSearchItemSchema.safeParse(raw);
  if (!parsed.success) return null;
  const item = parsed.data;
  const url = item.Url?.trim();
  if (!url || !isZhihuUrl(url)) return null;
  const title = item.Title?.replace(/\s*-\s*知乎\s*$/, "").trim();
  const authorName = item.AuthorName?.trim();
  const text = item.ContentText?.replace(/\s+/g, " ").trim();
  if (!title || !authorName || !text) return null;
  return {
    id: String(item.ContentID ?? url).slice(0, 64),
    title: title.slice(0, 160),
    authorName: authorName.slice(0, 80),
    url,
    contentType: (item.ContentType ?? "").slice(0, 20),
    text: text.slice(0, 4_000),
    voteUpCount: toCount(item.VoteUpCount),
    authorityLevel: toCount(item.AuthorityLevel),
  };
}
