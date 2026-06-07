# REQUIREMENTS — Stock Market MCP Server

**Status:** Phase-1 plan (build-ready)
**Date:** 2026-06-07
**Repo:** `/Users/hatef/stock-market-mcp` (will be wiped and rebuilt)

---

## 1. Product summary

A **remote, multi-user MCP server** that wraps [`yahoo-finance2`](https://github.com/gadicc/yahoo-finance2) (v3.x) to expose the full yfinance-equivalent market-data surface as MCP tools. It runs on **Vercel** (Next.js App Router + `mcp-handler`), serves **Streamable HTTP** transport, and authenticates users via **OAuth 2.1 + Dynamic Client Registration** (for the Claude.ai web connector) **and** **issued static bearer tokens** (for ChatGPT developer-mode / Desktop / Cursor and CLI use). Identity, OAuth clients, and token state live in **Supabase**.

**Real data only.** No mocks, no fixtures, no synthetic fallbacks anywhere in the request path. Every tool calls a real `yahoo-finance2` method; on upstream failure the tool surfaces the real error.

---

## 2. Functional requirements

### FR-1 — MCP protocol surface
- FR-1.1 Serve a Streamable HTTP MCP endpoint at **`/api/mcp`** (per MCP 2025-06-18 spec, the recommended/default transport).
- FR-1.2 Export `GET`, `POST`, and `DELETE` on the MCP route (`DELETE` terminates streamable-HTTP sessions).
- FR-1.3 Implement `initialize`, `tools/list`, and `tools/call` correctly (handled by `mcp-handler` + `@modelcontextprotocol/sdk`).
- FR-1.4 Negotiate MCP protocol revision **2025-06-18** as baseline; remain compatible with DRAFT clients where cheap.
- FR-1.5 SSE legacy transport is **out of scope** (see DEC-1). No Redis.

### FR-2 — Tools (market data)
Expose **20 tools** mapping 1:1 (or via convenience splits) to `yahoo-finance2` methods. Full table in `TOOL_MAP.md`. Summary:

| # | Tool | yahoo-finance2 method |
|---|------|-----------------------|
| 1 | `get_quote` | `quote()` |
| 2 | `get_quote_combine` | `quoteCombine()` |
| 3 | `get_quote_summary` | `quoteSummary()` (raw passthrough, all 33 modules) |
| 4 | `get_company_profile` | `quoteSummary()` split |
| 5 | `get_key_statistics` | `quoteSummary()` split |
| 6 | `get_financial_statements` | `quoteSummary()` split (legacy; empty since Nov 2024) |
| 7 | `get_fundamentals_time_series` | `fundamentalsTimeSeries()` (live statement source) |
| 8 | `get_earnings` | `quoteSummary()` split |
| 9 | `get_analyst_info` | `quoteSummary()` split |
| 10 | `get_holders` | `quoteSummary()` split |
| 11 | `get_sec_filings` | `quoteSummary({modules:['secFilings']})` |
| 12 | `get_fund_data` | `quoteSummary()` split |
| 13 | `get_chart` | `chart()` |
| 14 | `get_historical` | `historical()` |
| 15 | `get_options` | `options()` |
| 16 | `search` | `search()` (also the only built-in news source) |
| 17 | `get_insights` | `insights()` |
| 18 | `get_recommendations_by_symbol` | `recommendationsBySymbol()` |
| 19 | `get_trending_symbols` | `trendingSymbols()` |
| 20 | `run_screener` | `screener()` |

- FR-2.1 Every tool validates input with a **zod** shape (plain object of validators, not a wrapped `z.object`).
- FR-2.2 Every tool returns `{ content: [{ type: 'text', text: <stringified real JSON> }] }`.
- FR-2.3 Tools that accept dates (`get_chart`, `get_historical`, `get_fundamentals_time_series`, `get_options`) accept ISO-8601 strings, epoch numbers, or relative shortcuts and pass real `Date` objects to the library.
- FR-2.4 Each tool carries MCP annotations: `readOnlyHint: true` (all 20 are read-only), `openWorldHint: true` (they hit a live external API). No tool is destructive.

### FR-3 — ChatGPT deep-research compatibility
- FR-3.1 Expose **`search`** with signature `{query: string} -> {results: [{id, title, url}]}` and **`fetch`** with `{id: string} -> {id, title, text, url, metadata?}`, both annotated `readOnlyHint: true`, so the server qualifies as a ChatGPT "company knowledge" / deep-research source (see DEC-6). These are ChatGPT-shaped wrappers layered over the finance tools; Claude ignores them.

### FR-4 — Authentication & authorization
- FR-4.1 Act as an OAuth 2.1 **Protected Resource (Resource Server)**: serve RFC 9728 Protected Resource Metadata, return `401` with `WWW-Authenticate: Bearer resource_metadata=...` when unauthenticated, validate token audience (RFC 8707).
- FR-4.2 Support the **Claude.ai web connector** end-to-end: PRM discovery, AS metadata, Authorization Code + **PKCE S256**, **Dynamic Client Registration (RFC 7591)**, token issuance, and (cheap) `client_id_metadata_document_supported` advertisement.
- FR-4.3 Support **issued static bearer tokens** for ChatGPT-dev/Desktop/Cursor/CLI: a user mints an opaque long-lived token from a dashboard; the server accepts it via `Authorization: Bearer <token>` and resolves it to a user identity.
- FR-4.4 **Dual-auth on one endpoint:** `verifyToken` first tests the bearer against issued static tokens (hash lookup), then validates it as an OAuth access token (JWT via Supabase JWKS). Either path yields an `AuthInfo` with a stable `userId`; failure returns the 401 OAuth challenge.
- FR-4.5 Never pass the client token upstream to Yahoo (no confused-deputy / token-passthrough). Yahoo is called with no per-user credential.
- FR-4.6 Per-request token validation: `iss`, `aud`/`resource` == this server's canonical URI, `exp`/`nbf`, required scopes.

### FR-5 — Identity & storage
- FR-5.1 Supabase Auth is the **end-user IdP and OAuth 2.1 Authorization Server**.
- FR-5.2 Supabase stores: OAuth clients (DCR), authorization codes (if self-issued), issued static bearer tokens (hashed), and a user profile row. Schema in `AUTH_DESIGN.md`.
- FR-5.3 Static tokens are stored as **hashes only** (SHA-256), never plaintext; they are revocable.

### FR-6 — Acceptance / E2E
- FR-6.1 A protocol-level automated E2E suite runs against the **live Vercel URL** and must pass before delivery (see `TEST_PLAN.md`). It exercises: metadata discovery, DCR, authorize+token (PKCE), bearer auth, every tool returning real data, and 401/403/400 error paths.

---

## 3. Non-functional requirements

| ID | Requirement |
|----|-------------|
| NFR-1 | **Stateless** per request (Vercel serverless / Fluid compute). No in-memory cross-request state. |
| NFR-2 | **Fluid compute** enabled; `maxDuration` = 60s on the MCP route. |
| NFR-3 | **Pinned deps:** `mcp-handler@1.1.0`, `@modelcontextprotocol/sdk@1.26.0` (exact; <1.26.0 is a CVE), `zod@^3`, `yahoo-finance2@^3.15.2`. |
| NFR-4 | **HTTPS only.** Public Vercel URL reachable from Anthropic + OpenAI IP ranges. Deployment Protection disabled (or bypass token) on the MCP path. |
| NFR-5 | **Secrets** only in Vercel env vars / Supabase; never committed. Service-role key server-side only. |
| NFR-6 | **Token security:** PKCE S256 only (reject `plain`); static tokens hashed at rest; short-lived access tokens (≤1h) with rotated refresh; RS256/ES256 JWT signing (JWKS-verifiable). |
| NFR-7 | **Observability:** structured logs per tool call (symbol, latency, upstream status); `verboseLogs: true` in `mcp-handler` during bring-up. |
| NFR-8 | **Rate-limit resilience:** surface Yahoo throttle errors verbatim; do not retry-loop. (Caching is out of scope for v1 — DEC-7.) |
| NFR-9 | **Evergreen:** target current spec revisions and current package majors; no deprecated yahoo-finance2 methods (`autoc`, `dailyGainers`, `dailyLosers` throw — route to `search`/`screener`). |
| NFR-10 | **CORS:** add an explicit `OPTIONS` handler on `/api/mcp` exposing MCP headers (`Mcp-Session-Id`, `Mcp-Protocol-Version`, `Authorization`) and `Access-Control-Expose-Headers: Mcp-Session-Id` for browser-origin clients; metadata routes use `metadataCorsOptionsRequestHandler()`. |

---

## 4. Acceptance criteria (delivery gate)

The build is accepted only when ALL of the following pass against the **live production Vercel URL**:

1. **A1 — Discovery:** `GET /.well-known/oauth-protected-resource` and the path-inserted variant return valid RFC 9728 JSON with `resource`, `authorization_servers`, `scopes_supported`, `bearer_methods_supported`. AS metadata at `/.well-known/oauth-authorization-server` advertises `code_challenge_methods_supported: ["S256"]` and `registration_endpoint`.
2. **A2 — 401 challenge:** an unauthenticated `tools/call` returns `401` with `WWW-Authenticate: Bearer resource_metadata=<exact PRM url>`.
3. **A3 — DCR:** `POST /register` (or the AS registration endpoint) creates a client and returns a `client_id`.
4. **A4 — OAuth flow:** authorize (PKCE S256, `resource` param, exact `redirect_uri`) → code+`iss` → token exchange (verify `code_verifier`, audience-bound access token) succeeds.
5. **A5 — Bearer (static):** a minted static token authenticates a `tools/call` and returns real data.
6. **A6 — Bearer (OAuth):** the OAuth access token from A4 authenticates a `tools/call`.
7. **A7 — Every tool:** `tools/list` returns all 20 (+search/fetch) tools; a `tools/call` for each returns **real, non-empty, schema-valid** data for a canonical input (e.g. `AAPL`), with documented exceptions for known-empty upstream modules (legacy financial statements).
8. **A8 — Error paths:** wrong-audience token → 401; missing scope → 403 `insufficient_scope`; malformed request → 400; bad symbol → real upstream error surfaced as a tool error, not a crash.
9. **A9 — Client smoke:** a real Claude.ai custom connector completes OAuth and lists tools; a ChatGPT/curl static-bearer connection lists tools and calls `search`+`fetch`.

---

## 5. Out of scope (v1)

- Legacy SSE transport and Redis.
- ChatGPT mTLS client-cert termination beyond standard Vercel TLS (Vercel terminates TLS; OpenAI's managed client cert is presented to Vercel's edge — flagged as a risk to verify, not a build task — see `AUTH_DESIGN.md` risk note).
- Response caching, multi-ticker bulk download, ESG, websocket streaming (coverage gaps — see `TOOL_MAP.md`).
- Trading / order placement / money movement (read-only data server only).
