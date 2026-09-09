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
          recoverable: true,
        },
      }).success,
    ).toBe(false);
  });
});

describe("server-only environment contracts", () => {
  it("accepts explicit AI and Zhihu server variables", () => {
    expect(
      getAiEnvironment({
        OPENAI_BASE_URL: "https://api.example.com",
        OPENAI_API_KEY: "test-key",
      }).OPENAI_BASE_URL,
    ).toBe("https://api.example.com");

    expect(
      getZhihuEnvironment({
        ZHIHU_ACCESS_SECRET: "test-secret",
      }).ZHIHU_ACCESS_SECRET,
    ).toBe("test-secret");
  });

  it("rejects missing secrets and ignores public lookalikes", () => {
    expect(() =>
      getAiEnvironment({
        NEXT_PUBLIC_OPENAI_API_KEY: "must-not-count",
      }),
    ).toThrow();
  });
});
