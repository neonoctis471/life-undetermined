import { randomUUID } from "node:crypto";
import { z } from "zod";

import { successResponseSchema } from "@/contracts/api";

const HealthResponseSchema = successResponseSchema(
  z.object({
    status: z.literal("ok"),
    service: z.literal("zhihu-five-years-game"),
  }).strict(),
);

export async function GET(): Promise<Response> {
  const body = HealthResponseSchema.parse({
    data: {
      status: "ok",
      service: "zhihu-five-years-game",
    },
    meta: {
      requestId: randomUUID(),
      eventVersion: 0,
      nextStep: "SUBMIT_INTENT",
    },
  });

  return Response.json(body);
}
