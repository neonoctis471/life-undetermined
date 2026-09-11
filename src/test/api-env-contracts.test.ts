import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  ApiErrorSchema,
  successResponseSchema,
} from "@/contracts/api";
import {
  getAiEnvironment,
  getZhihuEnvironment,
} from "@/config/server-env";

describe("API response contracts", () => {
  it("builds a typed success envelope", () => {
    const schema = successResponseSchema(z.object({ status: z.literal("ok") }));
    const value = schema.parse({
      data: { status: "ok" },
      meta: {
        requestId: "11111111-1111-4111-8111-111111111111",
        eventVersion: 0,
        nextStep: "SUBMIT_INTENT",
      },
    });

    expect(value.data.status).toBe("ok");
  });

  it("rejects unstable error codes", () => {
    expect(
      ApiErrorSchema.safeParse({
        error: {
          code: "RANDOM_PROVIDER_FAILURE",
          message: "failed",
          requestId: "11111111-1111-4111-8111-111111111111",
          retryable: true,
        },
      }).success,
    ).toBe(false);
  });

  it("uses retryable as the only public API retry field", () => {
    const error = {
      code: "AI_TIMEOUT",
      message: "please retry",
      requestId: "11111111-1111-4111-8111-111111111111",
      retryable: true,
    };

    expect(ApiErrorSchema.parse({ error })).toEqual({ error });
    expect(ApiErrorSchema.safeParse({
      error: { ...error, retryable: undefined, recoverable: true },
    }).success).toBe(false);
    expect(ApiErrorSchema.safeParse({
      error: { ...error, recoverable: true },
    }).success).toBe(false);
  });
});

describe("server-only environment contracts", () => {
  it("accepts and trims explicit AI and Zhihu server variables", () => {
    expect(
      getAiEnvironment({
        OPENAI_BASE_URL: "https://api.example.com",
        OPENAI_API_KEY: "  test-key  ",
        OPENAI_MODEL_FAST: " fast-model ",
        OPENAI_MODEL_DEEP: "deep-model",
      }),
    ).toEqual({
      OPENAI_BASE_URL: "https://api.example.com",
      OPENAI_API_KEY: "test-key",
      OPENAI_MODEL_FAST: "fast-model",
      OPENAI_MODEL_DEEP: "deep-model",
    });

    expect(
      getZhihuEnvironment({
        ZHIHU_ACCESS_SECRET: "  test-secret  ",
      }),
    ).toEqual({ ZHIHU_ACCESS_SECRET: "test-secret" });
  });

  it("rejects missing secrets and ignores public lookalikes", () => {
    expect(() =>
      getAiEnvironment({
        NEXT_PUBLIC_OPENAI_API_KEY: "must-not-count",
      }),
    ).toThrow();
  });

  it("rejects whitespace-only secrets", () => {
    expect(() =>
      getAiEnvironment({
        OPENAI_BASE_URL: "https://api.example.com",
        OPENAI_API_KEY: " \n\t ",
      }),
    ).toThrow();
    expect(() => getZhihuEnvironment({ ZHIHU_ACCESS_SECRET: "   " })).toThrow();
  });

  it("returns only allowlisted server keys", () => {
    expect(
      getAiEnvironment({
        OPENAI_BASE_URL: "https://api.example.com",
        OPENAI_API_KEY: "test-key",
        OPENAI_MODEL_FAST: "fast-model",
        OPENAI_MODEL_DEEP: "deep-model",
        PRIVATE_INTERNAL_TOKEN: "private-value",
        NEXT_PUBLIC_OPENAI_API_KEY: "public-lookalike",
        NEXT_PUBLIC_OPENAI_MODEL_FAST: "public-lookalike",
      }),
    ).toEqual({
      OPENAI_BASE_URL: "https://api.example.com",
      OPENAI_API_KEY: "test-key",
      OPENAI_MODEL_FAST: "fast-model",
      OPENAI_MODEL_DEEP: "deep-model",
    });
  });

  it("requires both server-only model names", () => {
    const base = { OPENAI_BASE_URL: "https://api.example.com", OPENAI_API_KEY: "test-key" };
    expect(() => getAiEnvironment({ ...base, OPENAI_MODEL_FAST: "fast-model" })).toThrow();
    expect(() => getAiEnvironment({ ...base, OPENAI_MODEL_FAST: "  ", OPENAI_MODEL_DEEP: "deep-model" })).toThrow();
    expect(() =>
      getAiEnvironment({ ...base, NEXT_PUBLIC_OPENAI_MODEL_FAST: "fast", NEXT_PUBLIC_OPENAI_MODEL_DEEP: "deep" }),
    ).toThrow();

    expect(
      getZhihuEnvironment({
        ZHIHU_ACCESS_SECRET: "test-secret",
        PRIVATE_INTERNAL_TOKEN: "private-value",
        NEXT_PUBLIC_ZHIHU_ACCESS_SECRET: "public-lookalike",
      }),
    ).toEqual({ ZHIHU_ACCESS_SECRET: "test-secret" });
  });
});
