# Backend Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first backend batch: a production-buildable Next.js/TypeScript skeleton plus runtime-validated contracts for the six game-state types, authoritative events, API envelopes, and server-only environment configuration.

**Architecture:** Keep all game contracts framework-independent under `src/contracts`; Next.js Route Handlers are thin transport adapters. Runtime validation uses Zod, tests use Vitest in Node mode, and no database, AI call, Zhihu call, or visual frontend is implemented in this batch.

**Tech Stack:** Node.js 24.14.1 locally (Next.js minimum is 20.9), npm 11, Next.js App Router, React, TypeScript strict mode, Zod, Vitest, ESLint flat config, GitHub Actions.

## Global Constraints

- Support realistic, legal free-form plans about the five years after graduation.
- Keep exactly six top-level game-state categories: Intent, Facts, Decision, Situation, Outcome, Snapshot.
- AI remains non-authoritative; contracts may represent proposals, but only the future Game State Engine may accept them.
- Events are append-only and carry a monotonically increasing `eventVersion`.
- Preserve provenance values exactly: `ZHIHU_ORIGINAL`, `ZHIHU_ADAPTED`, `AI_SUPPLEMENT`, `GAME_SIMULATION`.
- Do not access the AI endpoint, Zhihu, PostgreSQL, Supabase, or Vercel in this batch.
- Do not expose `OPENAI_API_KEY` or `ZHIHU_ACCESS_SECRET` through any `NEXT_PUBLIC_` variable.
- Do not implement final visual frontend; only a health Route Handler is added.
- Use test-first development for every behavior.
- Commit after every task.

---

## File Structure

```text
.github/workflows/ci.yml                      CI quality gate
src/app/api/v1/health/route.ts               Thin health Route Handler
src/config/server-env.ts                      Server-only environment validation
src/contracts/api.ts                          API success/error envelope schemas
src/contracts/game/common.ts                 Shared IDs, enums, time and text schemas
src/contracts/game/intent.ts                 Intent schema and type
src/contracts/game/fact.ts                   Fact and FactProposal schemas
src/contracts/game/situation.ts              Situation, possibility and action schemas
src/contracts/game/decision.ts               Decision schema
src/contracts/game/outcome.ts                Outcome schema
src/contracts/game/snapshot.ts               Snapshot and WorldContext schemas
src/contracts/game/event.ts                  Discriminated authoritative event union
src/contracts/game/index.ts                  Public game-contract exports
src/test/health-route.test.ts                 Health route test
src/test/common-contracts.test.ts             Shared-contract tests
src/test/state-contracts.test.ts              Six-state tests
src/test/event-contracts.test.ts              Event-union tests
src/test/api-env-contracts.test.ts            API and environment tests
package.json                                  Commands and dependency manifest
package-lock.json                             Exact dependency lock
tsconfig.json                                 Strict TypeScript configuration
next.config.ts                                Next.js configuration
eslint.config.mjs                             ESLint flat configuration
vitest.config.mts                             Vitest configuration
.gitignore                                    Generated-output exclusions
```

### Task 1: Toolchain and Health Route

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `next-env.d.ts`
- Create: `next.config.ts`
- Create: `eslint.config.mjs`
- Create: `vitest.config.mts`
- Create: `src/test/health-route.test.ts`
- Create: `src/app/api/v1/health/route.ts`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: Node.js 20.9 or newer.
- Produces: `GET(): Promise<Response>` from the health route and npm scripts `lint`, `typecheck`, `test`, `test:run`, `test:coverage`, and `build`.

- [ ] **Step 1: Create the package and tool configuration**

Create `package.json`:

```json
{
  "name": "zhihu-five-years-game",
  "version": "0.1.0",
  "private": true,
  "engines": {
    "node": ">=20.9.0"
  },
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "vitest",
    "test:run": "vitest run",
    "test:coverage": "vitest run --coverage"
  }
}
```

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

Create `next-env.d.ts`:

```ts
/// <reference types="next" />
/// <reference types="next/image-types/global" />
```

Create `next.config.ts`:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
};

export default nextConfig;
```

Create `eslint.config.mjs`:

```js
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  globalIgnores([".next/**", "coverage/**", "next-env.d.ts"]),
]);
```

Create `vitest.config.mts`:

```ts
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
    },
  },
});
```

Append these generated paths to `.gitignore`:

```text
*.tsbuildinfo
.vercel/
```

- [ ] **Step 2: Install exact dependencies into the lockfile**

Run:

```powershell
npm install next@latest react@latest react-dom@latest zod@latest
npm install --save-dev typescript@latest @types/node@latest @types/react@latest @types/react-dom@latest eslint@latest eslint-config-next@latest vitest@latest @vitest/coverage-v8@latest vite-tsconfig-paths@latest
```

Expected: exit code 0 and a new `package-lock.json`.

- [ ] **Step 3: Write the failing health-route test**

Create `src/test/health-route.test.ts`:

```ts
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
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npm run test:run -- src/test/health-route.test.ts`

Expected: FAIL because `@/app/api/v1/health/route` does not exist.

- [ ] **Step 5: Implement the minimal health route**

Create `src/app/api/v1/health/route.ts`:

```ts
export async function GET(): Promise<Response> {
  return Response.json({
    data: { status: "ok" },
    meta: { service: "zhihu-five-years-game" },
  });
}
```

- [ ] **Step 6: Verify the task**

Run:

```powershell
npm run test:run -- src/test/health-route.test.ts
npm run typecheck
npm run lint
npm run build
```

Expected: all commands exit 0; Vitest reports 1 passing test.

- [ ] **Step 7: Commit**

```powershell
git add package.json package-lock.json tsconfig.json next-env.d.ts next.config.ts eslint.config.mjs vitest.config.mts .gitignore src/app/api/v1/health/route.ts src/test/health-route.test.ts
git commit -m "chore: scaffold backend foundation"
```

### Task 2: Shared Game Contract Primitives

**Files:**
- Create: `src/contracts/game/common.ts`
- Create: `src/test/common-contracts.test.ts`

**Interfaces:**
- Consumes: Zod.
- Produces: `IdSchema`, `TimestampSchema`, `ShortTextSchema`, `LongTextSchema`, `ContentProvenanceSchema`, `CausalReasonSchema`, `GamePhaseSchema`, `ChapterSchema`, and inferred TypeScript types.

- [ ] **Step 1: Write the failing shared-contract tests**

Create `src/test/common-contracts.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  ChapterSchema,
  ContentProvenanceSchema,
  GamePhaseSchema,
  IdSchema,
  TimestampSchema,
} from "@/contracts/game/common";

describe("shared game contracts", () => {
  it("accepts canonical identifiers, timestamps, phases and provenance", () => {
    expect(IdSchema.parse("11111111-1111-4111-8111-111111111111")).toBeTruthy();
    expect(TimestampSchema.parse("2026-09-09T12:00:00.000Z")).toBeTruthy();
    expect(GamePhaseSchema.parse("INTENT_CONFIRMED")).toBe("INTENT_CONFIRMED");
    expect(ChapterSchema.parse("MONTH_7")).toBe("MONTH_7");
    expect(ContentProvenanceSchema.parse("ZHIHU_ADAPTED")).toBe("ZHIHU_ADAPTED");
  });

  it("rejects invented enum values and malformed identifiers", () => {
    expect(IdSchema.safeParse("game-1").success).toBe(false);
    expect(GamePhaseSchema.safeParse("AI_DECIDES_LIFE").success).toBe(false);
    expect(ContentProvenanceSchema.safeParse("UNKNOWN_SOURCE").success).toBe(false);
  });
});
```

- [ ] **Step 2: Verify failure**

Run: `npm run test:run -- src/test/common-contracts.test.ts`

Expected: FAIL because the common contract module does not exist.

- [ ] **Step 3: Implement shared primitives**

Create `src/contracts/game/common.ts`:

```ts
import { z } from "zod";

export const IdSchema = z.string().uuid();
export const TimestampSchema = z.string().datetime({ offset: true });
export const ShortTextSchema = z.string().trim().min(1).max(160);
export const LongTextSchema = z.string().trim().min(1).max(4_000);

export const ContentProvenanceSchema = z.enum([
  "ZHIHU_ORIGINAL",
  "ZHIHU_ADAPTED",
  "AI_SUPPLEMENT",
  "GAME_SIMULATION",
]);

export const CausalReasonSchema = z.enum([
  "PLAYER_DECISION",
  "PRIOR_FACT",
  "EXTERNAL_EVENT",
  "MIXED_CAUSE",
]);

export const GamePhaseSchema = z.enum([
  "CREATED",
  "INTENT_CONFIRMED",
  "SITUATION_READY",
  "DECISION_RECORDED",
  "OUTCOME_RESOLVED",
  "LONG_TERM_READY",
  "REUNION_READY",
  "FORK_READY",
  "COMPARISON_READY",
  "COMPLETED",
]);

export const ChapterSchema = z.enum([
  "DAY_8",
  "MONTH_7",
  "YEAR_4",
  "YEAR_5",
  "COUNTERFACTUAL",
]);

export type ContentProvenance = z.infer<typeof ContentProvenanceSchema>;
export type CausalReason = z.infer<typeof CausalReasonSchema>;
export type GamePhase = z.infer<typeof GamePhaseSchema>;
export type Chapter = z.infer<typeof ChapterSchema>;
```

- [ ] **Step 4: Verify the task**

Run:

```powershell
npm run test:run -- src/test/common-contracts.test.ts
npm run typecheck
npm run lint
```

Expected: all commands exit 0; Vitest reports 2 passing tests.

- [ ] **Step 5: Commit**

```powershell
git add src/contracts/game/common.ts src/test/common-contracts.test.ts
git commit -m "feat: define shared game contract primitives"
```

### Task 3: Six State Schemas

**Files:**
- Create: `src/contracts/game/intent.ts`
- Create: `src/contracts/game/fact.ts`
- Create: `src/contracts/game/situation.ts`
- Create: `src/contracts/game/decision.ts`
- Create: `src/contracts/game/outcome.ts`
- Create: `src/contracts/game/snapshot.ts`
- Create: `src/contracts/game/index.ts`
- Create: `src/test/state-contracts.test.ts`

**Interfaces:**
- Consumes: shared schemas from Task 2.
- Produces: `IntentSchema`, `FactSchema`, `FactProposalSchema`, `SituationSchema`, `DecisionSchema`, `OutcomeSchema`, `SnapshotSchema`, and their inferred types.

- [ ] **Step 1: Write failing tests for the six state categories**

Create `src/test/state-contracts.test.ts` with one valid fixture per category and these invariant assertions:

```ts
import { describe, expect, it } from "vitest";

import {
  DecisionSchema,
  FactProposalSchema,
  FactSchema,
  IntentSchema,
  OutcomeSchema,
  SituationSchema,
  SnapshotSchema,
} from "@/contracts/game";

const ids = {
  game: "11111111-1111-4111-8111-111111111111",
  branch: "22222222-2222-4222-8222-222222222222",
  situation: "33333333-3333-4333-8333-333333333333",
  decision: "44444444-4444-4444-8444-444444444444",
  outcome: "55555555-5555-4555-8555-555555555555",
  fact: "66666666-6666-4666-8666-666666666666",
  snapshot: "77777777-7777-4777-8777-777777777777",
  action: "88888888-8888-4888-8888-888888888888",
  possibility: "99999999-9999-4999-8999-999999999999",
};

const timestamp = "2026-09-09T12:00:00.000Z";

describe("six game-state schemas", () => {
  it("accepts a multi-goal Intent and preserves raw text", () => {
    const intent = IntentSchema.parse({
      rawText: "回家帮家里，同时学习剪辑并尝试做视频。",
      goals: ["帮助家庭经营", "尝试内容创作"],
      priorities: ["家庭责任", "控制投入风险"],
      constraints: ["每天可支配时间有限"],
      currentActions: ["制作第一条店铺视频"],
      confirmedAt: timestamp,
    });

    expect(intent.rawText).toContain("回家");
    expect(intent.goals).toHaveLength(2);
  });

  it("requires Facts to carry provenance and causal reasons", () => {
    const fact = FactSchema.parse({
      id: ids.fact,
      kind: "CREATION",
      statement: "完成第一条视频",
      occurredAt: timestamp,
      source: "GAME_SIMULATION",
      causalReasons: ["PLAYER_DECISION"],
      causedByDecisionIds: [ids.decision],
      dependsOnFactIds: [],
    });

    expect(fact.kind).toBe("CREATION");
    expect(FactProposalSchema.safeParse({ kind: "CREATION" }).success).toBe(false);
  });

  it("accepts a Situation with two non-evaluative possibilities", () => {
    const situation = SituationSchema.parse({
      id: ids.situation,
      chapter: "DAY_8",
      timeLabel: "毕业后的第 8 天",
      triggerFactIds: [],
      forbiddenFactKinds: [],
      tensions: ["家庭时间与个人探索"],
      possibilities: [
        {
          id: ids.possibility,
          kind: "MOMENTUM",
          title: "顺势发展的可能",
          summary: "评论里有人询问店里的情况。",
        },
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          kind: "UNEXPECTED",
          title: "意料之外的变化",
          summary: "店里突然忙起来，原计划被打断。",
        },
      ],
      concreteContext: "下午五点半，店里突然来了客人。",
      availableActions: [
        {
          id: ids.action,
          kind: "PRESET",
          label: "先帮忙，关店以后再拍",
        },
      ],
      externalConditions: [],
    });

    expect(situation.possibilities).toHaveLength(2);
  });

  it("requires a custom action when the custom placeholder is selected", () => {
    const invalid = DecisionSchema.safeParse({
      id: ids.decision,
      situationId: ids.situation,
      selectedActionId: ids.action,
      selectedActionKind: "CUSTOM_PLACEHOLDER",
      isKeyDecision: false,
      decidedAt: timestamp,
    });

    expect(invalid.success).toBe(false);
  });

  it("accepts an Outcome as proposed changes rather than a full state", () => {
    const outcome = OutcomeSchema.parse({
      id: ids.outcome,
      decisionId: ids.decision,
      narrative: "你与家人协商出二十分钟，视频完成得有些仓促。",
      gains: ["完成第一次拍摄"],
      costs: ["成片质量低于预期"],
      addedFacts: [
        {
          kind: "CREATION",
          statement: "完成第一条视频",
          source: "GAME_SIMULATION",
          causalReasons: ["PLAYER_DECISION"],
          causedByDecisionIds: [ids.decision],
          dependsOnFactIds: [],
        },
      ],
      unresolvedConsequences: ["家人仍未完全理解这项尝试"],
      validation: "PENDING",
    });

    expect(outcome.addedFacts).toHaveLength(1);
    expect("state" in outcome).toBe(false);
  });

  it("requires Snapshot to pin an event version and WorldContext", () => {
    const snapshot = SnapshotSchema.parse({
      id: ids.snapshot,
      gameId: ids.game,
      branchId: ids.branch,
      eventVersion: 7,
      intent: {
        rawText: "先回家帮忙，同时尝试做视频。",
        goals: ["帮助家庭经营"],
        priorities: ["家庭责任"],
        constraints: [],
        currentActions: ["尝试拍摄"],
        confirmedAt: timestamp,
      },
      activeFactIds: [ids.fact],
      relationshipSummary: [
        { actor: "家人", status: "愿意暂时配合，但仍有顾虑" },
      ],
      worldContext: {
        familyContext: "参与家庭经营",
        economicStartingPoint: "尚无内容收入",
        skills: ["基础剪辑"],
        relationships: ["与家人共同经营"],
        externalEvents: [],
        worldSeed: "seed-demo-001",
      },
      keyDecisionId: ids.decision,
      createdAt: timestamp,
    });

    expect(snapshot.eventVersion).toBe(7);
  });
});
```

- [ ] **Step 2: Verify failure**

Run: `npm run test:run -- src/test/state-contracts.test.ts`

Expected: FAIL because `@/contracts/game` does not exist.

- [ ] **Step 3: Implement the six schemas**

Create the following files exactly:

`src/contracts/game/intent.ts`

```ts
import { z } from "zod";
import { ShortTextSchema, TimestampSchema } from "./common";

export const IntentSchema = z.object({
  rawText: z.string().trim().min(1).max(2_000),
  goals: z.array(ShortTextSchema).min(1).max(8),
  priorities: z.array(ShortTextSchema).min(1).max(8),
  constraints: z.array(ShortTextSchema).max(8),
  currentActions: z.array(ShortTextSchema).min(1).max(8),
  confirmedAt: TimestampSchema,
}).strict();

export type Intent = z.infer<typeof IntentSchema>;
```

`src/contracts/game/fact.ts`

```ts
import { z } from "zod";
import {
  CausalReasonSchema,
  ContentProvenanceSchema,
  IdSchema,
  LongTextSchema,
  TimestampSchema,
} from "./common";

export const FactKindSchema = z.enum([
  "ACTIVITY",
  "EDUCATION",
  "EMPLOYMENT",
  "FINANCE",
  "SKILL",
  "RELATIONSHIP",
  "LOCATION",
  "RESPONSIBILITY",
  "CREATION",
  "EXTERNAL",
]);

const FactCoreSchema = z.object({
  kind: FactKindSchema,
  statement: LongTextSchema,
  source: ContentProvenanceSchema,
  causalReasons: z.array(CausalReasonSchema).min(1).max(4),
  causedByDecisionIds: z.array(IdSchema).max(8),
  dependsOnFactIds: z.array(IdSchema).max(16),
  externalEventId: IdSchema.optional(),
  supersedesFactId: IdSchema.optional(),
}).strict();

export const FactProposalSchema = FactCoreSchema;

export const FactSchema = FactCoreSchema.extend({
  id: IdSchema,
  occurredAt: TimestampSchema,
}).strict();

export type FactKind = z.infer<typeof FactKindSchema>;
export type FactProposal = z.infer<typeof FactProposalSchema>;
export type Fact = z.infer<typeof FactSchema>;
```

`src/contracts/game/situation.ts`

```ts
import { z } from "zod";
import {
  ChapterSchema,
  IdSchema,
  LongTextSchema,
  ShortTextSchema,
} from "./common";
import { FactKindSchema } from "./fact";

export const PossibilitySchema = z.object({
  id: IdSchema,
  kind: z.enum(["MOMENTUM", "UNEXPECTED"]),
  title: z.enum(["顺势发展的可能", "意料之外的变化"]),
  summary: LongTextSchema,
}).strict();

export const ActionSchema = z.object({
  id: IdSchema,
  kind: z.enum(["PRESET", "CUSTOM_PLACEHOLDER"]),
  label: ShortTextSchema,
}).strict();

export const SituationSchema = z.object({
  id: IdSchema,
  chapter: ChapterSchema,
  timeLabel: ShortTextSchema,
  triggerFactIds: z.array(IdSchema).max(16),
  forbiddenFactKinds: z.array(FactKindSchema).max(10),
  tensions: z.array(ShortTextSchema).min(1).max(6),
  possibilities: z.array(PossibilitySchema).length(2),
  concreteContext: LongTextSchema,
  availableActions: z.array(ActionSchema).min(1).max(5),
  externalConditions: z.array(ShortTextSchema).max(8),
}).strict();

export type Possibility = z.infer<typeof PossibilitySchema>;
export type Action = z.infer<typeof ActionSchema>;
export type Situation = z.infer<typeof SituationSchema>;
```

`src/contracts/game/decision.ts`

```ts
import { z } from "zod";
import { IdSchema, LongTextSchema, TimestampSchema } from "./common";

export const DecisionSchema = z.object({
  id: IdSchema,
  situationId: IdSchema,
  selectedActionId: IdSchema,
  selectedActionKind: z.enum(["PRESET", "CUSTOM_PLACEHOLDER"]),
  customAction: LongTextSchema.optional(),
  reason: LongTextSchema.optional(),
  isKeyDecision: z.boolean(),
  decidedAt: TimestampSchema,
}).strict().superRefine((value, context) => {
  if (value.selectedActionKind === "CUSTOM_PLACEHOLDER" && !value.customAction) {
    context.addIssue({
      code: "custom",
      path: ["customAction"],
      message: "customAction is required for a custom decision",
    });
  }
});

export type Decision = z.infer<typeof DecisionSchema>;
```

`src/contracts/game/outcome.ts`

```ts
import { z } from "zod";
import { IdSchema, LongTextSchema, ShortTextSchema } from "./common";
import { FactProposalSchema } from "./fact";

export const OutcomeSchema = z.object({
  id: IdSchema,
  decisionId: IdSchema,
  narrative: LongTextSchema,
  gains: z.array(ShortTextSchema).max(8),
  costs: z.array(ShortTextSchema).max(8),
  addedFacts: z.array(FactProposalSchema).max(12),
  unresolvedConsequences: z.array(ShortTextSchema).max(8),
  validation: z.enum(["PENDING", "ACCEPTED", "REJECTED", "FALLBACK"]),
}).strict();

export type Outcome = z.infer<typeof OutcomeSchema>;
```

`src/contracts/game/snapshot.ts`

```ts
import { z } from "zod";
import {
  IdSchema,
  LongTextSchema,
  ShortTextSchema,
  TimestampSchema,
} from "./common";
import { IntentSchema } from "./intent";

export const RelationshipSummarySchema = z.object({
  actor: ShortTextSchema,
  status: LongTextSchema,
}).strict();

export const WorldContextSchema = z.object({
  city: ShortTextSchema.optional(),
  familyContext: LongTextSchema,
  economicStartingPoint: LongTextSchema,
  skills: z.array(ShortTextSchema).max(16),
  relationships: z.array(ShortTextSchema).max(16),
  externalEvents: z.array(LongTextSchema).max(16),
  worldSeed: z.string().trim().min(8).max(128),
}).strict();

export const SnapshotSchema = z.object({
  id: IdSchema,
  gameId: IdSchema,
  branchId: IdSchema,
  eventVersion: z.number().int().nonnegative(),
  intent: IntentSchema,
  activeFactIds: z.array(IdSchema).max(256),
  relationshipSummary: z.array(RelationshipSummarySchema).max(32),
  worldContext: WorldContextSchema,
  keyDecisionId: IdSchema,
  createdAt: TimestampSchema,
}).strict();

export type RelationshipSummary = z.infer<typeof RelationshipSummarySchema>;
export type WorldContext = z.infer<typeof WorldContextSchema>;
export type Snapshot = z.infer<typeof SnapshotSchema>;
```

`src/contracts/game/index.ts`

```ts
export * from "./common";
export * from "./decision";
export * from "./fact";
export * from "./intent";
export * from "./outcome";
export * from "./situation";
export * from "./snapshot";
```

- [ ] **Step 4: Verify the task**

Run:

```powershell
npm run test:run -- src/test/state-contracts.test.ts
npm run typecheck
npm run lint
```

Expected: all commands exit 0; Vitest reports 6 passing tests.

- [ ] **Step 5: Commit**

```powershell
git add src/contracts/game src/test/state-contracts.test.ts
git commit -m "feat: define six game state contracts"
```

### Task 4: Authoritative Event Union

**Files:**
- Create: `src/contracts/game/event.ts`
- Modify: `src/contracts/game/index.ts`
- Create: `src/test/event-contracts.test.ts`

**Interfaces:**
- Consumes: all Task 3 state schemas.
- Produces: `GameEventSchema`, `GameEventTypeSchema`, `GameEvent`, and `GameEventType`.

- [ ] **Step 1: Write the failing event tests**

Create `src/test/event-contracts.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { GameEventSchema } from "@/contracts/game";

const event = {
  id: "11111111-1111-4111-8111-111111111111",
  gameId: "22222222-2222-4222-8222-222222222222",
  branchId: "33333333-3333-4333-8333-333333333333",
  eventVersion: 1,
  occurredAt: "2026-09-09T12:00:00.000Z",
  idempotencyKey: "intent-submit-001",
  type: "INTENT_CONFIRMED",
  payload: {
    rawText: "先找工作，同时学习新技能。",
    goals: ["找到工作"],
    priorities: ["经济安全"],
    constraints: [],
    currentActions: ["投递简历"],
    confirmedAt: "2026-09-09T12:00:00.000Z",
  },
} as const;

describe("authoritative event contract", () => {
  it("parses a typed event envelope", () => {
    expect(GameEventSchema.parse(event).eventVersion).toBe(1);
  });

  it("rejects unknown event types and negative versions", () => {
    expect(
      GameEventSchema.safeParse({ ...event, type: "FACTS_REWRITTEN" }).success,
    ).toBe(false);
    expect(
      GameEventSchema.safeParse({ ...event, eventVersion: -1 }).success,
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Verify failure**

Run: `npm run test:run -- src/test/event-contracts.test.ts`

Expected: FAIL because `GameEventSchema` is not exported.

- [ ] **Step 3: Implement the discriminated event union**

Create `src/contracts/game/event.ts` with a strict common envelope and one schema for each event type from the design:

```ts
import { z } from "zod";
import { IdSchema, TimestampSchema } from "./common";
import { DecisionSchema } from "./decision";
import { FactSchema } from "./fact";
import { IntentSchema } from "./intent";
import { OutcomeSchema } from "./outcome";
import { SituationSchema } from "./situation";
import { SnapshotSchema } from "./snapshot";

export const GameEventTypeSchema = z.enum([
  "GAME_CREATED",
  "INTENT_CONFIRMED",
  "SITUATION_CREATED",
  "DECISION_MADE",
  "OUTCOME_RESOLVED",
  "FACTS_ADDED",
  "YEARS_SIMULATED",
  "SNAPSHOT_CREATED",
  "LIFE_FORKED",
  "SHARE_CREATED",
]);

const EventEnvelopeSchema = z.object({
  id: IdSchema,
  gameId: IdSchema,
  branchId: IdSchema,
  eventVersion: z.number().int().nonnegative(),
  occurredAt: TimestampSchema,
  idempotencyKey: z.string().trim().min(8).max(128),
});

const event = <T extends z.ZodLiteral<string>, P extends z.ZodType>(
  type: T,
  payload: P,
) => EventEnvelopeSchema.extend({ type, payload }).strict();

export const GameEventSchema = z.discriminatedUnion("type", [
  event(z.literal("GAME_CREATED"), z.object({
    initialBranchId: IdSchema,
  }).strict()),
  event(z.literal("INTENT_CONFIRMED"), IntentSchema),
  event(z.literal("SITUATION_CREATED"), SituationSchema),
  event(z.literal("DECISION_MADE"), DecisionSchema),
  event(z.literal("OUTCOME_RESOLVED"), OutcomeSchema),
  event(z.literal("FACTS_ADDED"), z.object({
    facts: z.array(FactSchema).min(1).max(12),
  }).strict()),
  event(z.literal("YEARS_SIMULATED"), z.object({
    summary: z.string().trim().min(1).max(4_000),
    facts: z.array(FactSchema).max(32),
  }).strict()),
  event(z.literal("SNAPSHOT_CREATED"), SnapshotSchema),
  event(z.literal("LIFE_FORKED"), z.object({
    sourceBranchId: IdSchema,
    targetBranchId: IdSchema,
    snapshotId: IdSchema,
    replacementDecisionId: IdSchema,
  }).strict()),
  event(z.literal("SHARE_CREATED"), z.object({
    shareId: IdSchema,
    slug: z.string().regex(/^[A-Za-z0-9_-]{24,128}$/),
  }).strict()),
]);

export type GameEventType = z.infer<typeof GameEventTypeSchema>;
export type GameEvent = z.infer<typeof GameEventSchema>;
```

Add to `src/contracts/game/index.ts`:

```ts
export * from "./event";
```

- [ ] **Step 4: Verify the task**

Run:

```powershell
npm run test:run -- src/test/event-contracts.test.ts
npm run typecheck
npm run lint
```

Expected: all commands exit 0; Vitest reports 2 passing tests.

- [ ] **Step 5: Commit**

```powershell
git add src/contracts/game/event.ts src/contracts/game/index.ts src/test/event-contracts.test.ts
git commit -m "feat: define authoritative game events"
```

### Task 5: API Envelopes and Server Environment

**Files:**
- Create: `src/contracts/api.ts`
- Create: `src/config/server-env.ts`
- Modify: `src/app/api/v1/health/route.ts`
- Create: `src/test/api-env-contracts.test.ts`
- Modify: `src/test/health-route.test.ts`

**Interfaces:**
- Consumes: Zod and `GamePhaseSchema`.
- Produces: `ApiMetaSchema`, `ApiErrorSchema`, `successResponseSchema(dataSchema)`, `getAiEnvironment(source)`, and `getZhihuEnvironment(source)`.

- [ ] **Step 1: Write failing API and environment tests**

Create `src/test/api-env-contracts.test.ts`:

```ts
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
```

- [ ] **Step 2: Verify failure**

Run: `npm run test:run -- src/test/api-env-contracts.test.ts`

Expected: FAIL because the API and environment modules do not exist.

- [ ] **Step 3: Implement the contracts**

Create `src/contracts/api.ts`:

```ts
import { z } from "zod";
import { GamePhaseSchema, IdSchema } from "./game";

export const NextStepSchema = z.enum([
  "SUBMIT_INTENT",
  "CONFIRM_INTENT",
  "SELECT_SITUATION",
  "MAKE_DECISION",
  "REVIEW_OUTCOME",
  "SIMULATE_YEARS",
  "SELECT_KEY_DECISION",
  "REVIEW_COMPARISON",
  "FINISHED",
]);

export const ApiMetaSchema = z.object({
  requestId: IdSchema,
  eventVersion: z.number().int().nonnegative(),
  nextStep: NextStepSchema,
  phase: GamePhaseSchema.optional(),
}).strict();

export const ApiErrorCodeSchema = z.enum([
  "INVALID_REQUEST",
  "NOT_FOUND",
  "FORBIDDEN",
  "VERSION_CONFLICT",
  "INVALID_TRANSITION",
  "AI_TIMEOUT",
  "AI_INVALID_OUTPUT",
  "ZHIHU_UNAVAILABLE",
  "RATE_LIMITED",
  "INTEGRITY_FAILURE",
  "INTERNAL_ERROR",
]);

export const ApiErrorSchema = z.object({
  error: z.object({
    code: ApiErrorCodeSchema,
    message: z.string().trim().min(1).max(300),
    requestId: IdSchema,
    recoverable: z.boolean(),
  }).strict(),
}).strict();

export const successResponseSchema = <T extends z.ZodType>(data: T) =>
  z.object({
    data,
    meta: ApiMetaSchema,
  }).strict();

export type ApiErrorCode = z.infer<typeof ApiErrorCodeSchema>;
export type ApiError = z.infer<typeof ApiErrorSchema>;
```

Create `src/config/server-env.ts`:

```ts
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
```

Replace `src/app/api/v1/health/route.ts` with:

```ts
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
```

Replace `src/test/health-route.test.ts` with:

```ts
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
```

- [ ] **Step 4: Verify the task**

Run:

```powershell
npm run test:run -- src/test/api-env-contracts.test.ts src/test/health-route.test.ts
npm run typecheck
npm run lint
```

Expected: all commands exit 0; both test files pass.

- [ ] **Step 5: Commit**

```powershell
git add src/contracts/api.ts src/config/server-env.ts src/app/api/v1/health/route.ts src/test/api-env-contracts.test.ts src/test/health-route.test.ts
git commit -m "feat: add API and server environment contracts"
```

### Task 6: CI and First-Batch Acceptance

**Files:**
- Create: `.github/workflows/ci.yml`
- Modify: `docs/superpowers/plans/2026-09-09-backend-foundation.md`

**Interfaces:**
- Consumes: all npm scripts and tests from Tasks 1–5.
- Produces: a GitHub Actions quality gate and recorded completion evidence.

- [ ] **Step 1: Add GitHub Actions**

Create `.github/workflows/ci.yml`:

```yaml
name: ci

on:
  push:
  pull_request:

permissions:
  contents: read

jobs:
  quality:
    runs-on: ubuntu-latest
    timeout-minutes: 15

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm run test:coverage
      - run: npm run build
```

- [ ] **Step 2: Run the complete local acceptance suite**

Run:

```powershell
npm run lint
npm run typecheck
npm run test:coverage
npm run build
```

Expected:

- ESLint exits 0.
- TypeScript exits 0.
- All tests pass.
- Coverage report is generated under ignored `coverage/`.
- Next.js production build exits 0.
- No AI, Zhihu, database, Supabase, or Vercel network call is made by the tests.

- [ ] **Step 3: Check secrets and repository scope**

Run:

```powershell
git check-ignore .secrets/zhihu-access-secret.dpapi .secrets/openai-next-api-key.dpapi
rg -l --glob '!.secrets/**' --glob '!*.dpapi' '(?i)sk-[a-z0-9]{20,}|\b[a-f0-9]{40}\b' .
git diff --check
git status --short
```

Expected:

- Both encrypted credential files are ignored.
- `rg` prints no project file.
- `git diff --check` prints nothing.
- Status contains only intended first-batch changes.

- [ ] **Step 4: Mark completed checkboxes and record verification commands in this plan**

Use `apply_patch` to change the completed task checkboxes from `- [ ]` to `- [x]` and append a short verification record containing the exact commands and their exit status. Do not paste secrets or full environment output.

- [ ] **Step 5: Commit**

```powershell
git add .github/workflows/ci.yml docs/superpowers/plans/2026-09-09-backend-foundation.md
git commit -m "ci: enforce backend foundation quality"
```

- [ ] **Step 6: Verify the committed state**

Run:

```powershell
git status --short
git log --oneline -7
```

Expected: working tree is clean and the six task commits are visible.
