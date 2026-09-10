# Backend Foundation Final Review Fix Report

## Result

Implemented all verified final-review fixes without changing the implementation plan or progress metadata. The contract layer now enforces causal situations, authoritative outcome status, exact intent input preservation, allowlisted server environment output, and decision-kind field coupling. Event tests cover every event variant and the requested invalid boundaries. The incompatible Vitest path plugin was removed, and CI now covers the exact minimum Node version plus current Node 24.

No secrets were read or printed, and no AI, Zhihu, database, Supabase, Vercel, or other external service was called.

## Root-cause evidence

- `npm ls typescript vite-tsconfig-paths tsconfck --all` before dependency cleanup — exit 1 with `ELSPROBLEMS`. The exact incompatible path was `vite-tsconfig-paths@5.1.4 -> tsconfck@3.1.6`, whose optional peer requires TypeScript `^5.0.0`, while the project uses `typescript@6.0.2`.
- `vite-tsconfig-paths` was the only source of `tsconfck`; removing it allowed the project to retain TypeScript 6 rather than downgrading the compiler.

## TDD evidence

### RED

All behavior tests were added before production changes. The first restricted-sandbox attempts were not counted as behavioral RED because esbuild could not traverse the linked worktree path; the tests were rerun with worktree access and then failed for the expected contract reasons.

- `npm run test:run -- src/test/state-contracts.test.ts -t 'Intent|raw characters'` — exit 1; 2 failed. Existing parsing stripped leading/trailing whitespace and rejected the valid 4,000-character boundary at the old 2,000-character maximum.
- `npm run test:run -- src/test/state-contracts.test.ts -t 'Situation|causal trigger|possibility'` — exit 1; 3 failed and 1 passed. Empty `triggerFactIds`, mismatched kind/title pairs, and duplicate possibility kinds were incorrectly accepted.
- `npm run test:run -- src/test/state-contracts.test.ts -t 'custom action|selected decision kind'` — exit 1; 1 failed and 1 passed. A PRESET decision with `customAction` was incorrectly accepted.
- `npm run test:run -- src/test/api-env-contracts.test.ts` — exit 1; 3 failed and 3 passed. Secret whitespace was preserved, whitespace-only secrets were accepted, and unrelated/private/public-lookalike keys leaked into parsed output.
- `npm run test:run -- src/test/event-contracts.test.ts` — exit 1; 5 failed and 13 passed. PENDING/REJECTED authoritative outcomes and three invalid Situation payloads were incorrectly accepted; valid examples for all ten event variants and the other requested boundary tests already passed.
- `npm run test:run -- src/test/state-contracts.test.ts -t 'resolved outcomes'` — exit 1; the test failed because the required `ResolvedOutcomeSchema` export did not exist.

### GREEN

- `npm run test:run -- src/test/state-contracts.test.ts` — exit 0; 12/12 tests passed.
- `npm run test:run -- src/test/api-env-contracts.test.ts` — exit 0; 6/6 tests passed.
- `npm run test:run -- src/test/event-contracts.test.ts` — exit 0; 18/18 tests passed.

## Implemented contract changes

- `triggerFactIds` now requires 1–16 UUIDs.
- `PossibilitySchema` is a discriminated union coupling MOMENTUM to `顺势发展的可能` and UNEXPECTED to `意料之外的变化`; Situation validation requires exactly one of each in its two possibilities.
- `ResolvedOutcomeSchema` is derived from `OutcomeSchema`, exported with its inferred type, and restricts validation to ACCEPTED or FALLBACK. `OUTCOME_RESOLVED` uses this event-safe schema while general proposals retain all four statuses.
- `IntentSchema.rawText` preserves exact input, rejects empty/whitespace-only values, and enforces a 4,000-character maximum.
- Server environment parsers strip unknown keys and trim/reject empty secret strings.
- `DecisionSchema` is a discriminated union: PRESET has no `customAction` field, while CUSTOM_PLACEHOLDER requires one.
- Event tests use compact factories and table-driven examples for GAME_CREATED, INTENT_CONFIRMED, SITUATION_CREATED, DECISION_MADE, OUTCOME_RESOLVED, FACTS_ADDED, YEARS_SIMULATED, SNAPSHOT_CREATED, LIFE_FORKED, and SHARE_CREATED. Invalid coverage includes unknown envelope/payload keys, fractional/negative versions, FactProposal/Fact boundaries, authoritative outcome statuses, and Situation invariants.

## Toolchain and CI

- `npm uninstall --save-dev vite-tsconfig-paths` — exit 0; removed 3 packages and regenerated `package-lock.json`.
- `vitest.config.mts` now explicitly aliases `@` to `./src` and `server-only` to the test shim.
- `.github/workflows/ci.yml` retains least `contents: read` permissions and the `npm ci`, lint, typecheck, coverage, and build gates. Its matrix is exactly Node `20.9.0` and `24`.

## Final verification

- `node --version` — `v24.14.1`.
- `npm --version` — `11.11.0`.
- `npm run test:run` — exit 0; 5 files and 46/46 tests passed.
- `npm run typecheck` — exit 0.
- `npm run lint` — exit 0.
- `npm run test:coverage` — exit 0; 5 files and 46/46 tests passed. Overall statements/lines were 98.12%; all contract, environment, API, and health-route source files were 100% covered.
- `npm ls typescript vite-tsconfig-paths tsconfck --all` — exit 0. Only the valid `typescript@6.0.2` graph remains; neither `vite-tsconfig-paths` nor `tsconfck` is present.
- `npm run build` — exit 0; Next.js 16.3.4 compiled, typechecked, generated static pages, and listed `/_not-found` plus `/api/v1/health`.
- The build added route imports to `next-env.d.ts` and `.next/dev/types/**/*.ts` to `tsconfig.json`; only those generated additions were removed.
- `git diff --exit-code -- next-env.d.ts tsconfig.json` after restoration — exit 0.
- `git diff --check` — exit 0.

## Remaining concerns

- The exact Node 20.9.0 job is configured but was not executable on this host, which has Node 24.14.1; GitHub Actions remains the authoritative minimum-version run.
- npm reported 5 existing dependency audit findings during uninstall (2 moderate, 1 high, 2 critical). No automatic audit fix was run because unrelated transitive upgrades are outside this review-fix scope.
