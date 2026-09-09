import { describe, expect, it } from "vitest";

import { GET } from "@/app/api/v1/health/route";

describe("GET /api/v1/health", () => {
  it("returns a stable healthy response", async () => {
    const response = await GET();
    const body: unknown = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      data: { status: "ok" },
      meta: { service: "zhihu-five-years-game" },
    });
  });
});
