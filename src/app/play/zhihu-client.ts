import { successResponseSchema } from "@/contracts/api";
import {
  ExperienceResponseDataSchema,
  type ExperienceRequest,
  type ExperienceResponseData,
} from "@/zhihu/contracts";

import { getGameStore } from "./client-store";

const ResponseSchema = successResponseSchema(ExperienceResponseDataSchema);

/** Experience cards are optional; callers hide the panel on any failure. */
export async function requestExperience(input: ExperienceRequest): Promise<ExperienceResponseData> {
  const response = await fetch("/api/v1/zhihu/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Game-Id": getGameStore().getState().gameId },
    body: JSON.stringify(input),
  });
  const json: unknown = await response.json().catch(() => null);
  const parsed = ResponseSchema.safeParse(json);
  if (!response.ok || !parsed.success) throw new Error("experience cards unavailable");
  return parsed.data.data;
}
