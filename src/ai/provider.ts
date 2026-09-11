export type ModelTier = "FAST" | "DEEP";

export interface AiCompletionRequest {
  tier: ModelTier;
  system: string;
  user: string;
  maxTokens: number;
  temperature?: number;
  timeoutMs: number;
  /** Aborts the call early, e.g. when a hedged attempt already won. */
  signal?: AbortSignal;
}

/** Returns the raw text content of a JSON-mode completion. Injectable for tests. */
export interface AiProvider {
  completeJson(request: AiCompletionRequest): Promise<string>;
}

export type AiProviderErrorKind = "TIMEOUT" | "UPSTREAM" | "INVALID_RESPONSE";

/** Provider failures never carry prompts, upstream bodies or credentials. */
export class AiProviderError extends Error {
  constructor(
    public readonly kind: AiProviderErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "AiProviderError";
  }
}
