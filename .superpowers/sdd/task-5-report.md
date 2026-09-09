# Task 5 Report: API Envelopes and Server Environment

## Result

Implemented the typed API success/error envelopes, server-only AI and Zhihu environment contracts, and the versioned `/api/v1/health` response. Added `server-only` as a direct production dependency. The Vitest configuration aliases that package to a test-only no-op shim so unit tests can import the server contract without disabling the production server-only boundary.

## TDD evidence

### RED

1. Added `src/test/api-env-contracts.test.ts` and replaced `src/test/health-route.test.ts` with the specified contract assertions before adding the production modules.
2. The first prescribed command in the restricted sandbox failed before collection because esbuild could not traverse the worktree path (`Cannot read directory "../../../../..": Access is denied`).
3. Re-ran the same command with host filesystem access:

   ```powershell
   npm run test:run -- src/test/api-env-contracts.test.ts src/test/health-route.test.ts
   ```

   It failed for the expected missing-feature reason:

   ```text
   Failed Suites 2
   Error: Cannot find package '@/contracts/api'
   Test Files 2 failed
   Tests no tests
   ```

### GREEN

1. Added `src/contracts/api.ts`, `src/config/server-env.ts`, and the health route implementation, plus the direct `server-only@0.0.1` dependency and lockfile entry.
2. Added the test-only `server-only` alias/shim required because the package intentionally throws when evaluated by Vitest's non-Next runtime.
3. Re-ran the focused command:

   ```text
   Test Files 2 passed (2)
   Tests 5 passed (5)
   ```

## Verification

- `npm run test:run -- src/test/api-env-contracts.test.ts src/test/health-route.test.ts` — PASS; 2 files, 5 tests.
- `npm run test:run` — PASS; 5 files, 22 tests.
- `npm run typecheck` — PASS; exit 0.
- `npm run lint` — PASS; exit 0.
- `npm run build` — PASS; exit 0; Next compiled successfully and listed `/api/v1/health`.
- Restored build-generated `next-env.d.ts` and `tsconfig.json` edits; no generated build configuration changes remain in the task diff.

## Files

- `src/contracts/api.ts`
- `src/config/server-env.ts`
- `src/app/api/v1/health/route.ts`
- `src/test/api-env-contracts.test.ts`
- `src/test/health-route.test.ts`
- `src/test/server-only-shim.ts`
- `vitest.config.mts`
- `package.json`
- `package-lock.json`

## Self-review

- `ApiMetaSchema` uses the shared UUID and game phase schemas and enforces non-negative integer event versions and the finite next-step enum.
- `ApiErrorSchema` rejects unknown provider-specific error codes and strictly validates bounded messages, request IDs, and recoverability.
- Environment parsers require server-side `OPENAI_BASE_URL`/`OPENAI_API_KEY` and `ZHIHU_ACCESS_SECRET`; public lookalikes do not satisfy the required fields.
- The health route validates its own response with the shared success-envelope schema and generates a UUID request ID on each call.
- No AI endpoint, Zhihu, PostgreSQL, Supabase, Vercel, or frontend integration was accessed or added.

## Notes

- `npm install` reported four existing audit findings in the dependency tree (1 moderate, 1 high, 2 critical); no audit fix was run because changing unrelated transitive versions is outside this task.
