# ARCHITECTURE — Stock Market MCP Server

**Date:** 2026-06-07
**Repo:** `/Users/hatef/stock-market-mcp`

---

## 1. Chosen stack (firm decisions)

| Layer | Choice | Version | Rationale |
|-------|--------|---------|-----------|
| Runtime/framework | **Next.js App Router** on Vercel | Next 16.x (>=13 required) | Official `mcp-handler` target; Fluid compute. |
| MCP adapter | **`mcp-handler`** | `1.1.0` | Current maintained successor to `@vercel/mcp-adapter`. |
| MCP SDK | **`@modelcontextprotocol/sdk`** | `1.26.0` (exact pin) | Pinned peer of `mcp-handler@1.1.0`; <1.26.0 is a CVE. |
| Schemas | **`zod`** | `^3` | Required by `mcp-handler` tool registration. |
| Data source | **`yahoo-finance2`** | `^3.15.2` | Real Yahoo data; full yfinance-equivalent surface. |
| Auth/Identity/AS | **Supabase Auth** (OAuth 2.1 + OIDC server, public beta) + Postgres | latest | Single IdP + Authorization Server + token/client storage. |
| JWT verify | **`jose`** | `^5` | Verify Supabase RS256/ES256 access tokens via JWKS. |
| Supabase client | **`@supabase/supabase-js`** | `^2` | Server-side service-role access to auth tables. |
| Transport | **Streamable HTTP only** | MCP 2025-06-18 | Default/recommended; no Redis, no SSE. |
| Compute | **Vercel Fluid compute**, `maxDuration: 60` | — | Recommended for MCP workloads. |

**DEC-1 — Transport:** Streamable HTTP only. No legacy SSE, no Redis. (2026 clients — Claude.ai, ChatGPT, Cursor — all speak streamable HTTP.) → Use the fixed route `app/api/mcp/route.ts`, NOT the `[transport]` catch-all.

**DEC-2 — Tool registration API:** Use `server.registerTool(name, { title, description, inputSchema, annotations }, handler)` (the richer metadata form) so we can attach `annotations.readOnlyHint`/`openWorldHint` (needed for ChatGPT). `inputSchema` is a plain object of zod validators.

**DEC-3 — Auth wrapping:** Wrap the base handler with `withMcpAuth(handler, verifyToken, { required: true, requiredScopes: ['mcp:read'], resourceMetadataPath: '/.well-known/oauth-protected-resource' })`.

**DEC-4 — Authorization Server:** Supabase Auth's native OAuth 2.1 server is the AS (co-hosted conceptually; physically a different origin). The MCP server is a pure Resource Server. We do **not** hand-roll authorize/token endpoints — Supabase serves them. We DO serve PRM (RFC 9728) ourselves on the MCP origin and point `authorization_servers` at the Supabase AS issuer.

**DEC-5 — Audience binding:** A Supabase **Custom Access Token Hook** sets `aud` to the MCP server's canonical URI (`https://<app>.vercel.app/api/mcp`) so RFC 8707 audience validation passes. (Default `aud=authenticated` would fail validation.)

**DEC-6 — search/fetch shim:** Add ChatGPT-shaped `search` and `fetch` tools alongside the 20 finance tools. `search` reuses `yahoo-finance2 search()`; `fetch` resolves an opaque id (a `symbol` or a `symbol#module` ref) to a text blob via `quoteSummary`/`quote`. Harmless to Claude.

**DEC-7 — No caching in v1.** Each tool call hits Yahoo live (real data requirement). Add edge cache later if rate-limited.

**DEC-8 — JWT signing alg.** Provision/migrate the Supabase project to **RS256 (asymmetric)** signing so the MCP server verifies access tokens via the public JWKS (`/.well-known/jwks.json`) with no shared secret. Fresh projects default to HS256 — migrate during Phase 0.

---

## 2. Request flow

### 2a. OAuth (Claude.ai web connector)
```
Claude.ai                MCP server (Vercel)              Supabase AS
  | --- tools/call (no token) ----> |                          |
  | <-- 401 WWW-Authenticate -------|  (resource_metadata=PRM)  |
  | --- GET PRM ------------------> |  (RFC 9728 JSON)          |
  | <-- authorization_servers ------|                          |
  | --- GET AS metadata ---------------------------------->    |  (RFC 8414/OIDC)
  | <-- authorize/token/register endpoints ---------------     |
  | --- POST /register (DCR) ------------------------------>   |  -> client_id
  | --- authorize (PKCE S256, resource=MCP URI) ---------->    |  -> code + iss
  | --- token (code_verifier, resource) ------------------>    |  -> access_token (aud=MCP URI, RS256)
  | --- tools/call (Bearer access_token) ---> |                |
  |                                  |  verifyToken: jose.jwtVerify(JWKS),
  |                                  |  check iss/aud/exp/scope -> AuthInfo{userId}
  |                                  |  call yahoo-finance2 (no user creds)
  | <-- real data ------------------ |
```

### 2b. Static bearer (ChatGPT-dev / Desktop / Cursor / curl)
```
Client                    MCP server (Vercel)               Supabase DB
  | --- tools/call (Bearer yfmcp_...) ---> |                    |
  |                                 | verifyToken: sha256(token)   |
  |                                 | --- SELECT by token_hash --> |
  |                                 | <-- {user_id, scopes, revoked,exp} 
  |                                 | if valid -> AuthInfo{userId}; else fall through to OAuth 401
  |                                 | call yahoo-finance2
  | <-- real data ----------------- |
```

`verifyToken(req, bearerToken)` order: **(1)** if token matches `sk_` prefix → hash lookup in `mcp_bearer_tokens`; **(2)** else `jose` JWT verify against Supabase JWKS; **(3)** else return `undefined` → `mcp-handler` emits the 401 challenge.

---

## 3. Vercel topology

- **Single Next.js project**, one Fluid-compute Function backing the MCP route.
- **Routes (Functions):**
  - `app/api/mcp/route.ts` — MCP endpoint (GET/POST/DELETE/OPTIONS), `maxDuration = 60`.
  - `app/.well-known/oauth-protected-resource/route.ts` — RFC 9728 PRM (GET + OPTIONS CORS).
  - `app/.well-known/oauth-protected-resource/api/mcp/route.ts` — path-inserted PRM variant (clients probe both). (Implemented as a second route file or a catch-all under `.well-known`.)
  - `app/dashboard/...` — minimal authenticated UI to mint/revoke static bearer tokens (Supabase Auth login).
- **AS metadata** (`/.well-known/oauth-authorization-server`, `/.well-known/openid-configuration`, `/authorize`, `/token`, `/register`, `/.well-known/jwks.json`) is served by **Supabase**, NOT by Vercel. PRM's `authorization_servers` points at the Supabase project URL.
- **Deployment Protection** disabled on the MCP path (or a bypass token configured) so non-browser MCP clients can reach it.
- **No Redis, no `vercel.json`** beyond defaults (Fluid compute is default for MCP-style workloads).

---

## 4. Transport decision (restated)
Streamable HTTP only → fixed `app/api/mcp/route.ts` with `{ basePath: '/api' }`, export `{ handler as GET, handler as POST, handler as DELETE }` plus an explicit `OPTIONS`. `basePath` MUST equal `/api` (matches folder). No `redisUrl`.

---

## 5. Repo / file layout (post-rebuild)

```
/Users/hatef/stock-market-mcp
├── app/
│   ├── api/
│   │   └── mcp/
│   │       └── route.ts                 # createMcpHandler + withMcpAuth; GET/POST/DELETE/OPTIONS
│   ├── .well-known/
│   │   └── oauth-protected-resource/
│   │       ├── route.ts                 # protectedResourceHandler + metadataCorsOptionsRequestHandler
│   │       └── api/mcp/route.ts         # path-inserted PRM variant
│   ├── dashboard/
│   │   ├── page.tsx                     # list/mint/revoke static tokens (Supabase Auth gated)
│   │   └── actions.ts                   # server actions: mintToken / revokeToken
│   ├── auth/callback/route.ts           # Supabase auth callback for dashboard login
│   ├── layout.tsx
│   └── page.tsx                         # landing / connector instructions
├── lib/
│   ├── mcp/
│   │   ├── server.ts                    # registerAllTools(server)
│   │   ├── tools/                       # one file per tool group
│   │   │   ├── quote.ts                 # get_quote, get_quote_combine
│   │   │   ├── quoteSummary.ts          # get_quote_summary + 8 splits
│   │   │   ├── fundamentals.ts          # get_fundamentals_time_series, get_financial_statements
│   │   │   ├── chart.ts                 # get_chart, get_historical
│   │   │   ├── options.ts               # get_options
│   │   │   ├── discovery.ts             # search, get_insights, recommendations, trending, screener
│   │   │   └── chatgpt.ts               # search + fetch (deep-research shim)
│   │   ├── annotations.ts               # shared readOnlyHint/openWorldHint
│   │   └── format.ts                    # toTextContent(json), date coercion
│   ├── auth/
│   │   ├── verifyToken.ts               # dual-auth: static hash -> jose JWT
│   │   ├── jwks.ts                       # cached remote JWKS (jose.createRemoteJWKSet)
│   │   └── staticTokens.ts              # sha256 hash, mint, lookup, revoke
│   ├── supabase/
│   │   ├── admin.ts                     # service-role client (server only)
│   │   └── server.ts                    # SSR client for dashboard
│   └── yahoo.ts                         # singleton `new YahooFinance()` + typed wrappers
├── supabase/
│   └── migrations/
│       ├── 0001_bearer_tokens.sql
│       └── 0002_access_token_hook.sql   # Custom Access Token Hook (sets aud)
├── tests/
│   └── e2e/
│       ├── discovery.test.ts
│       ├── oauth.test.ts
│       ├── bearer.test.ts
│       ├── tools.test.ts                # one assertion block per tool
│       └── errors.test.ts
├── scripts/
│   └── mint-test-token.ts               # CI helper to create a static token for E2E
├── .env.example
├── next.config.ts
├── package.json
├── tsconfig.json
└── docs/planning/*.md
```

**Wipe note:** the current `src/`, `test-alpaca.js`, `ALPACA_SETUP.md`, `test.sh`, and the stdio-era `package.json` deps (axios, technicalindicators, node-cache, dotenv) are removed. Alpaca is dropped entirely — this is a Yahoo-only server.

---

## 6. Environment variables

| Var | Scope | Purpose |
|-----|-------|---------|
| `MCP_SERVER_URL` | Vercel (all) | Canonical resource URI, e.g. `https://<app>.vercel.app/api/mcp`. Used as token `aud` and PRM `resource`. |
| `SUPABASE_URL` | Vercel (all) | Supabase project URL = OAuth AS issuer base. |
| `SUPABASE_ANON_KEY` | Vercel (all) | Dashboard SSR client. |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel (server only) | Admin client for token tables. **Never client-exposed.** |
| `SUPABASE_JWKS_URL` | Vercel (server) | `${SUPABASE_URL}/auth/v1/.well-known/jwks.json` for `jose`. |
| `OAUTH_ISSUER` | Vercel (all) | Supabase AS issuer (must match AS metadata `issuer` exactly). |
| `BEARER_TOKEN_PREFIX` | Vercel | `yfmcp_` prefix to distinguish static tokens from JWTs. |
| `BEARER_TOKEN_PEPPER` | Vercel (server) | Optional server-side pepper added before SHA-256 of static tokens. |
| `REQUIRED_SCOPES` | Vercel | Default `mcp:read`. |
| `E2E_BASE_URL` | CI | Live deployment URL under test. |
| `E2E_STATIC_TOKEN` | CI (secret) | Pre-minted static token for the bearer E2E. |

`.env.example` documents all of the above with placeholder values. No secret values committed.
