import "server-only";

import { z } from "zod";

const AiEnvironmentSchema = z.object({
  OPENAI_BASE_URL: z.string().url(),
  OPENAI_API_KEY: z.string().trim().min(1),
  OPENAI_MODEL_FAST: z.string().trim().min(1).max(128),
  OPENAI_MODEL_DEEP: z.string().trim().min(1).max(128),
});

const ZhihuEnvironmentSchema = z.object({
  ZHIHU_ACCESS_SECRET: z.string().trim().min(1),
});

/*
 * Optional: only the voluntary "sign in with Zhihu" button needs these. The
 * game is fully playable without them, so a deployment that has not set them
 * simply turns the button into a no-op instead of failing to boot.
 */
const ZhihuOAuthEnvironmentSchema = z.object({
  ZHIHU_OAUTH_APP_ID: z.string().trim().regex(/^\d+$/, "app id must be numeric"),
  ZHIHU_OAUTH_APP_KEY: z.string().trim().min(1),
  // Must equal the callback registered for the app, character for character.
  ZHIHU_OAUTH_REDIRECT_URI: z.string().url(),
});

type EnvironmentSource = Record<string, string | undefined>;

export const getAiEnvironment = (source: EnvironmentSource = process.env) =>
  AiEnvironmentSchema.parse(source);

export const getZhihuEnvironment = (source: EnvironmentSource = process.env) =>
  ZhihuEnvironmentSchema.parse(source);

/** `null` rather than a throw: an unconfigured OAuth app must not break the game. */
export const getZhihuOAuthEnvironment = (source: EnvironmentSource = process.env) => {
  const parsed = ZhihuOAuthEnvironmentSchema.safeParse(source);
  return parsed.success ? parsed.data : null;
};
