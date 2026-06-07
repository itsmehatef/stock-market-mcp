# BUILD_PLAN — Phased Execution

**Date:** 2026-06-07
**Repo:** `/Users/hatef/stock-market-mcp` (wiped, rebuilt as a Next.js App Router project)

Each phase has concrete tasks and a hard acceptance bar. Phases are ordered so the live URL exists early and every later phase is verified against it.

---

## Phase 0 — Wipe, scaffold, provision
**Tasks**
1. Remove legacy stdio server: delete `src/`, `test-alpaca.js`, `ALPACA_SETUP.md`, `test.sh`; drop Alpaca/axios/technicalindicators/node-cache deps.
2. Scaffold Next.js App Router (Next 16.x), TypeScript, `app/` dir.
3. Install pinned deps: `npm i mcp-handler@1.1.0 @modelcontextprotocol/sdk@1.26.0 zod@^3 yahoo-finance2@^3.15.2 jose@^5 @supabase/supabase-js@^2`.
4. Create Supabase project (or reuse). **Migrate JWT signing HS256 → RS256.** Enable the OAuth 2.1 server (DCR + consent). Confirm AS metadata, JWKS, `/oauth/clients/register` paths against live Supabase docs.
5. Apply `0001_bearer_tokens.sql` + `0002_access_token_hook.sql`; register the access-token hook (sets `aud` = MCP URI).
6. Write `.env.example`; set Vercel env vars (`MCP_SERVER_URL`, `SUPABASE_*`, `OAUTH_ISSUER`, `BEARER_TOKEN_PREFIX`, `BEARER_TOKEN_PEPPER`, `REQUIRED_SCOPES`). Disable Deployment Protection on `/api/mcp`.

**Acceptance:** project builds locally (`next build`); Supabase AS metadata + JWKS reachable and advertise `S256` + RS256; migrations applied; env vars set in Vercel.

---

## Phase 1 — MCP skeleton on the live URL (no auth yet)
**Tasks**
1. `lib/yahoo.ts`: singleton `new YahooFinance()` + typed wrappers + date coercion.
2. `lib/mcp/format.ts` (`toTextContent`), `lib/mcp/annotations.ts` (`readOnlyHint`/`openWorldHint`).
3. `app/api/mcp/route.ts`: `createMcpHandler(register, { serverInfo, capabilities:{tools:{}} }, { basePath:'/api', maxDuration:60, verboseLogs:true })`; export `GET/POST/DELETE` + explicit `OPTIONS` with MCP CORS headers.
4. Register ONE real tool (`get_quote`) end-to-end.
5. Deploy to Vercel.

**Acceptance:** MCP Inspector (Streamable HTTP) connects to the live `/api/mcp`, lists `get_quote`, and `get_quote {symbols:'AAPL'}` returns real `regularMarketPrice`.

---

## Phase 2 — All 22 tools
**Tasks**
1. Implement tool groups: `quote.ts`, `quoteSummary.ts` (passthrough + 8 splits), `fundamentals.ts`, `chart.ts`, `options.ts`, `discovery.ts`.
2. Implement ChatGPT shim `chatgpt.ts`: `search` reshaped to `{results:[{id,title,url}]}` and `fetch` `{id}→{id,title,text,url,metadata?}`, both `readOnlyHint:true`.
3. Per-tool zod input shapes; map deprecated calls to live equivalents (`screener`, `search`).
4. Structured per-call logging (symbol, latency, upstream status).

**Acceptance:** `tools/list` returns all 22; a manual `tools/call` per tool returns real, schema-valid data against the live URL (financial-statements xfail allowed).

---

## Phase 3 — Auth: PRM + static bearer
**Tasks**
1. `app/.well-known/oauth-protected-resource/route.ts` (+ `/api/mcp` path-inserted variant) via `protectedResourceHandler({authServerUrls:[OAUTH_ISSUER]})` + `metadataCorsOptionsRequestHandler`.
2. `lib/auth/staticTokens.ts` (mint/hash/lookup/revoke), `lib/auth/jwks.ts` (`createRemoteJWKSet`), `lib/auth/verifyToken.ts` (dual-path: static-first, JWT-second).
3. Wrap handler: `withMcpAuth(handler, verifyToken, { required:true, requiredScopes:['mcp:read'], resourceMetadataPath:'/.well-known/oauth-protected-resource' })`; export wrapped handler.
4. `scripts/mint-test-token.ts` for CI/E2E.

**Acceptance (live URL):** unauthenticated `tools/call` → 401 with correct `WWW-Authenticate`/PRM; a minted static token authenticates and returns real data; revoked/expired/random tokens → 401.

---

## Phase 4 — Auth: OAuth 2.1 + DCR end-to-end
**Tasks**
1. Verify Supabase AS: DCR (`/oauth/clients/register`), authorize (PKCE S256, `resource` param, `iss` in response), token (audience-bound RS256 access token, rotated refresh).
2. Confirm the access-token hook sets `aud == MCP_SERVER_URL`; JWT path in `verifyToken` validates `iss`/`aud`/`exp`/scope.
3. Build the dashboard (`/dashboard`): Supabase-auth login, list/mint/revoke static tokens (server actions, RLS-scoped). `/auth/callback`.

**Acceptance (live URL):** full machine flow passes — DCR → authorize(PKCE S256) → token → `tools/call` with the access token returns real data; wrong-`aud` → 401; missing scope → 403 `insufficient_scope`; wrong `code_verifier` → rejected.

---

## Phase 5 — Automated E2E suite (the delivery gate)
**Tasks**
1. Implement `tests/e2e/{discovery,oauth,bearer,tools,errors}.test.ts` per `TEST_PLAN.md`.
2. CI: apply migrations, configure hook, create test user, mint `E2E_STATIC_TOKEN`, deploy, export `E2E_BASE_URL`, run `vitest run tests/e2e`.
3. Headless OAuth driver for the authorize login step.

**Acceptance:** all of Suites 1–5 green against the **live production URL** (only the documented `get_financial_statements` xfail allowed). This is the project acceptance bar.

---

## Phase 6 — Client smoke + harden + docs
**Tasks**
1. Real Claude.ai custom connector: OAuth completes, tools listed (record in PR).
2. ChatGPT dev-mode connector with static token: tools listed, `search`+`fetch` callable; investigate the mTLS risk empirically if connection fails.
3. Harden: confirm service-role key is server-only; no secrets in client bundle; `verboseLogs` off for prod; rate-limit/throttle errors surfaced verbatim.
4. README: connector setup (Claude OAuth + ChatGPT bearer), env vars, tool catalogue, known gaps.

**Acceptance:** both clients connect to the production URL and call tools; security review clean; README complete.

---

## Critical path & dependencies
```
P0 (scaffold+Supabase) → P1 (live skeleton) → P2 (tools) → P3 (PRM+bearer) → P4 (OAuth+DCR) → P5 (E2E gate) → P6 (smoke+docs)
```
P3 and P4 both depend on P0's Supabase RS256 migration + access-token hook. P5 depends on everything. P2 can proceed in parallel with P3 (different files).

## Cross-cutting guardrails (apply every phase)
- Pin versions exactly (`@modelcontextprotocol/sdk@1.26.0`). No SSE/Redis. `basePath:'/api'` matches the folder.
- Real data only — no mock/fixture/fallback in the request path.
- `inputSchema` is a plain zod-validator object, never a wrapped `z.object`.
- PRM `resource` and `resource_metadata` URL match the connector URL exactly.
- Never forward client tokens to Yahoo.
