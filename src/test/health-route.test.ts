import { describe, expect, it } from "vitest";
import { z } from "zod";

import { GET } from "@/app/api/v1/health/route";
import { successResponseSchema } from "@/contracts/api";

const HealthResponseSchema = successResponseSchema(
  z.object({
    status: z.literal("ok"),
    service: z.literal("zhihu-five-years-game"),
  }).strict(),
);

describe("GET /api/v1/health", () => {
  it("returns a valid versioned API envelope", async () => {
    const response = await GET();
    const body = HealthResponseSchema.parse(await response.json());

    expect(response.status).toBe(200);
    expect(body.data.status).toBe("ok");
    expect(body.meta.eventVersion).toBe(0);
    expect(body.meta.nextStep).toBe("SUBMIT_INTENT");
  });
});
