import { z } from "zod";

import { IntentCandidateSchema, SearchQueryTextSchema } from "@/ai/contracts";
import { ShortTextSchema } from "@/contracts/game";

/*
 * Experience cards. A Zhihu card only ever comes from a real zhihu_search item
 * and always carries its author and original link. When nothing usable is
 * found, a visually different AI card labelled SUPPLEMENT_LABEL is used.
 * Neither kind ever enters GameState or the player's Facts.
 */

export const SUPPLEMENT_LABEL = "参考思路 · 非知乎内容";

/*
 * How many experience cards a response may carry. It lives here, with the
 * schema that enforces it, because the two were once separate numbers: raising
 * the selection limit alone made every response fail this schema and the block
 * reported "nothing found" while the logs happily showed three relevant cards.
 */
export const MAX_CARDS = 3;

/** Avatars come from Zhihu's own image CDN; nothing else may be rendered. */
export function isZhihuImageUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      (url.hostname.endsWith(".zhimg.com") || url.hostname === "zhimg.com" || url.hostname.endsWith(".zhihu.com"))
    );
  } catch {
    return false;
  }
}

export function isZhihuUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (url.hostname === "zhihu.com" || url.hostname.endsWith(".zhihu.com"));
  } catch {
    return false;
  }
}

/** Loose view of one zhihu_search item; unknown fields are ignored. */
export const ZhihuSearchItemSchema = z.object({
  Title: z.string().optional(),
  ContentType: z.string().optional(),
  ContentID: z.union([z.string(), z.number()]).optional(),
  ContentText: z.string().optional(),
  Url: z.string().optional(),
  AuthorName: z.string().optional(),
  AuthorAvatar: z.string().optional(),
  /** Zhihu's own credential line, e.g. 「银行话题下的优秀答主」. */
  AuthorBadgeText: z.string().optional(),
  VoteUpCount: z.union([z.number(), z.string()]).optional(),
  CommentCount: z.union([z.number(), z.string()]).optional(),
  AuthorityLevel: z.union([z.number(), z.string()]).optional(),
  /** The service's own relevance judgement for this query. */
  RankingScore: z.union([z.number(), z.string()]).optional(),
});

export const ZhihuSearchResponseSchema = z.object({
  Code: z.number(),
  Data: z.object({ Items: z.array(z.unknown()).optional() }).optional(),
});

/** A validated search result, kept verbatim for provenance. */
export interface ZhihuEvidence {
  id: string;
  title: string;
  authorName: string;
  /** null when the item carried no avatar, or one from an unexpected host. */
  authorAvatar: string | null;
  /** Zhihu's verification line for this author; null when unbadged. */
  authorBadge: string | null;
  url: string;
  contentType: string;
  text: string;
  voteUpCount: number;
  commentCount: number;
  authorityLevel: number;
  rankingScore: number;
}

const CardLineSchema = z.string().trim().min(1).max(200);

export const ZhihuCardSchema = z
  .object({
    /** ZHIHU_ADAPTED when AI condensed the original text, ZHIHU_ORIGINAL when only an excerpt is shown. */
    provenance: z.enum(["ZHIHU_ADAPTED", "ZHIHU_ORIGINAL"]),
    id: z.string().trim().min(1).max(64),
    title: z.string().trim().min(1).max(160),
    authorName: z.string().trim().min(1).max(80),
    authorAvatar: z
      .string()
      .max(500)
      .refine(isZhihuImageUrl, { message: "must be an https Zhihu image URL" })
      .nullable(),
    authorBadge: z.string().trim().min(1).max(60).nullable(),
    url: z.string().max(500).refine(isZhihuUrl, { message: "must be an https zhihu.com URL" }),
    contentType: z.string().max(20),
    excerpt: z.string().trim().min(1).max(200),
    /** Model-judged fit (0-10) to the player's Intent and Situation; null when the summary produced no scores. */
    relevance: z.number().int().min(0).max(10).nullable(),
    conditions: z.array(CardLineSchema).max(4),
    whatTheyDid: CardLineSchema.nullable(),
    whatHappened: CardLineSchema.nullable(),
    similarities: z.array(CardLineSchema).max(3),
    differences: z.array(CardLineSchema).max(3),
    voteUpCount: z.number().int().nonnegative(),
    commentCount: z.number().int().nonnegative(),
  })
  .strict();

export const SupplementCardSchema = z
  .object({
    provenance: z.literal("AI_SUPPLEMENT"),
    id: z.string().trim().min(1).max(64),
    label: z.literal(SUPPLEMENT_LABEL),
    points: z.array(CardLineSchema).min(1).max(3),
  })
  .strict();

export const ExperienceCardSchema = z.union([ZhihuCardSchema, SupplementCardSchema]);
export type ZhihuCard = z.infer<typeof ZhihuCardSchema>;
export type SupplementCard = z.infer<typeof SupplementCardSchema>;
export type ExperienceCard = z.infer<typeof ExperienceCardSchema>;

export const ExperienceRequestSchema = z
  .object({
    intent: IntentCandidateSchema,
    /** null for the prefetch right after the Intent is confirmed. */
    situation: z
      .object({
        timeLabel: ShortTextSchema,
        concreteContext: z.string().trim().min(1).max(1_200),
        tensions: z.array(ShortTextSchema).max(6),
      })
      .strict()
      .nullable(),
    queries: z.array(SearchQueryTextSchema).min(1).max(3),
  })
  .strict();
export type ExperienceRequest = z.infer<typeof ExperienceRequestSchema>;

export const ExperienceResponseDataSchema = z
  .object({
    source: z.enum(["ZHIHU", "AI_SUPPLEMENT", "NONE"]),
    cards: z.array(ExperienceCardSchema).max(MAX_CARDS),
  })
  .strict()
  .superRefine((value, context) => {
    const supplements = value.cards.filter((card) => card.provenance === "AI_SUPPLEMENT").length;
    const consistent =
      value.source === "NONE"
        ? value.cards.length === 0
        : value.source === "AI_SUPPLEMENT"
          ? value.cards.length > 0 && supplements === value.cards.length
          : value.cards.length > 0 && supplements === 0;
    if (!consistent) context.addIssue({ code: "custom", path: ["cards"], message: "cards do not match source" });
  });
export type ExperienceResponseData = z.infer<typeof ExperienceResponseDataSchema>;
