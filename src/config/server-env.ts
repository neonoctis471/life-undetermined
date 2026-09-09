import "server-only";

import { z } from "zod";

const AiEnvironmentSchema = z.object({
  OPENAI_BASE_URL: z.string().url(),
  OPENAI_API_KEY: z.string().min(1),
}).passthrough();

const ZhihuEnvironmentSchema = z.object({
  ZHIHU_ACCESS_SECRET: z.string().min(1),
}).passthrough();

type EnvironmentSource = Record<string, string | undefined>;

export const getAiEnvironment = (source: EnvironmentSource = process.env) =>
  AiEnvironmentSchema.parse(source);

export const getZhihuEnvironment = (source: EnvironmentSource = process.env) =>
  ZhihuEnvironmentSchema.parse(source);
