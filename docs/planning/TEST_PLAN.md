# TEST_PLAN — Protocol-level E2E (live Vercel URL)

**Date:** 2026-06-07
**Gate:** ALL suites must pass against the **live production deployment** before delivery.
**Runner:** `vitest` (or `node:test`) + a thin MCP Streamable-HTTP client (raw `fetch` for protocol assertions; `@modelcontextprotocol/sdk` `Client` + `StreamableHTTPClientTransport` for tool calls).
**Target:** `E2E_BASE_URL` (e.g. `https://stock-market-mcp.vercel.app`). Tools called against canonical symbol `AAPL` (+ `SPY` for funds, `US` for region).

Files: `tests/e2e/{discovery,oauth,bearer,tools,errors}.test.ts`.

---

## Suite 1 — Metadata discovery (`discovery.test.ts`)
| ID | Assertion |
|----|-----------|
| D1 | `GET /.well-known/oauth-protected-resource` → 200, JSON has `resource == ${E2E_BASE_URL}/api/mcp`, `authorization_servers` non-empty, `scopes_supported` includes `mcp:read`, `bearer_methods_supported` includes `header`. |
| D2 | `GET /.well-known/oauth-protected-resource/api/mcp` (path-inserted) → 200, identical `resource`. |
| D3 | `OPTIONS /.well-known/oauth-protected-resource` → 204/200 with CORS headers (`Access-Control-Allow-Origin`, `Allow-Methods`). |
| D4 | Fetch `authorization_servers[0]` AS metadata (`/.well-known/oauth-authorization-server` and `/.well-known/openid-configuration`) → 200; `issuer` matches fetch URL; `code_challenge_methods_supported` includes `"S256"` and NOT `"plain"`; `registration_endpoint`, `authorization_endpoint`, `token_endpoint` present; `grant_types_supported` includes `authorization_code` + `refresh_token`. |
| D5 | AS JWKS (`/.well-known/jwks.json`) → 200 with ≥1 RSA key (RS256 confirmed). |

## Suite 2 — 401 / DCR / OAuth (`oauth.test.ts`)
| ID | Assertion |
|----|-----------|
| O1 | Unauthenticated `POST /api/mcp` `tools/call` → **401** with `WWW-Authenticate: Bearer resource_metadata="${E2E_BASE_URL}/.well-known/oauth-protected-resource"` and `scope="mcp:read"`. The `resource_metadata` URL resolves to D1's document (exact match). |
| O2 | **DCR:** `POST` AS `registration_endpoint` (JSON: `redirect_uris`, `grant_types`, `token_endpoint_auth_method`) → 201 with a `client_id`. |
| O3 | **Authorize:** build authorize URL with `response_type=code`, `client_id`, `redirect_uri`, `code_challenge` (S256 of a generated verifier), `code_challenge_method=S256`, `resource=${E2E_BASE_URL}/api/mcp`, `scope=mcp:read`. Drive a headless login (test user via Supabase) → redirect carries `code` and `iss`; assert `iss` matches AS issuer (RFC 9207). |
| O4 | **Token:** `POST token_endpoint` (`application/x-www-form-urlencoded`) with `grant_type=authorization_code`, `code`, `code_verifier`, `redirect_uri`, `resource` → 200 with `access_token`, `token_type=Bearer`, `expires_in` ≤ 3600, and a `refresh_token`. |
| O5 | Decode `access_token`: `aud == ${E2E_BASE_URL}/api/mcp`, `iss == OAUTH_ISSUER`, `scope` includes `mcp:read`, alg `RS256`. |
| O6 | **Negative PKCE:** token exchange with a wrong `code_verifier` → 400/401 (rejected). |
| O7 | `tools/call` with the O4 access token → 200 real data (proves OAuth bearer path). |

## Suite 3 — Static bearer (`bearer.test.ts`)
| ID | Assertion |
|----|-----------|
| B1 | Pre-minted `E2E_STATIC_TOKEN` (created by `scripts/mint-test-token.ts` in CI setup) authenticates `initialize` + `tools/list` → 200, lists all 22 tools. |
| B2 | `tools/call get_quote {symbols:'AAPL'}` with the static token → 200 real data. |
| B3 | A revoked token → 401 challenge. |
| B4 | A random `yfmcp_…` (no DB row) → 401. |
| B5 | An expired token (mint with past `expires_at`) → 401. |

## Suite 4 — Every tool, real-data assertions (`tools.test.ts`)
Connect once with the static token via the SDK `Client`. `tools/list` MUST contain all 22 names. Then one `tools/call` per tool with real-data assertions:

| Tool | Input | Real-data assertion |
|------|-------|---------------------|
| `get_quote` | `{symbols:'AAPL'}` | result has `regularMarketPrice` (number > 0) and `symbol == 'AAPL'`. |
| `get_quote_combine` | `{symbol:'AAPL'}` | `regularMarketPrice` number > 0. |
| `get_quote_summary` | `{symbol:'AAPL',modules:['price','summaryDetail']}` | `price.symbol == 'AAPL'`. |
| `get_company_profile` | `{symbol:'AAPL'}` | `assetProfile.sector` or `summaryProfile.industry` non-empty. |
| `get_key_statistics` | `{symbol:'AAPL'}` | `defaultKeyStatistics` present; a numeric metric (e.g. `marketCap`/`beta`) exists. |
| `get_financial_statements` | `{symbol:'AAPL'}` | **Known-empty tolerated:** assert call succeeds (no throw). If empty, log a documented xfail; not a hard fail. |
| `get_fundamentals_time_series` | `{symbol:'AAPL',module:'financials',type:'annual',period1:'2020-01-01'}` | ≥1 time-series row with a dated value. |
| `get_earnings` | `{symbol:'AAPL'}` | `earningsHistory` or `earningsTrend` has ≥1 entry. |
| `get_analyst_info` | `{symbol:'AAPL'}` | `recommendationTrend` or `financialData.targetMeanPrice` present. |
| `get_holders` | `{symbol:'AAPL'}` | `institutionOwnership` or `majorHoldersBreakdown` non-empty. |
| `get_sec_filings` | `{symbol:'AAPL'}` | `secFilings` array length ≥ 1 with an EDGAR `edgarUrl`/`exhibits`. |
| `get_fund_data` | `{symbol:'SPY'}` | `topHoldings` or `fundProfile` present (fund symbol). |
| `get_chart` | `{symbol:'AAPL',period1:'2024-01-01',interval:'1d'}` | `quotes` array length > 0, each row has numeric `close`. |
| `get_historical` | `{symbol:'AAPL',period1:'2024-01-01'}` | array length > 0; rows have `close` + `adjClose`. |
| `get_options` | `{symbol:'AAPL'}` | `expirationDates` length > 0 and at least one `calls`/`puts` entry. |
| `search` | `{query:'Apple'}` | ChatGPT shape: `results` array length > 0, each `{id,title,url}`; an entry maps to `AAPL`. |
| `get_insights` | `{symbol:'AAPL'}` | `instrumentInfo` or `reports` present. |
| `get_recommendations_by_symbol` | `{symbols:'AAPL'}` | `recommendedSymbols` length > 0. |
| `get_trending_symbols` | `{region:'US'}` | `quotes`/`symbols` length > 0. |
| `run_screener` | `{scrIds:'day_gainers'}` | `quotes` length > 0. |
| `fetch` | `{id:'AAPL'}` | returns `{id,title,text,url}` with non-empty `text`. |
| (`search` already covered as #16/#21) | — | — |

Global assertions for every tool: response is `{content:[{type:'text',text:<json>}]}`; `text` parses as JSON; `isError` is falsy; latency logged. **No mock markers** — assert the payload contains live-only fields (timestamps, prices) that a fixture wouldn't have.

## Suite 5 — Error / edge paths (`errors.test.ts`)
| ID | Assertion |
|----|-----------|
| E1 | Wrong-audience JWT (mint a token with `aud=other`) → 401. |
| E2 | Missing-scope token (no `mcp:read`) → 403 `insufficient_scope` with `WWW-Authenticate`. |
| E3 | Malformed JSON-RPC body → 400. |
| E4 | `tools/call get_quote {symbols:'ZZ_NOT_A_TICKER'}` → tool returns a real upstream error (`isError:true` or non-200 surfaced), NOT a 500 crash and NOT fabricated data. |
| E5 | Unknown tool name → MCP method/tool error (not a crash). |
| E6 | `get_fundamentals_time_series` missing required `module`/`period1` → zod validation error returned as a tool/protocol error. |
| E7 | `DELETE /api/mcp` for a live session → 200/204 (session termination supported). |

---

## CI wiring
- **Setup job:** apply Supabase migrations to the test project; configure the access-token hook; create a Supabase test user; run `scripts/mint-test-token.ts` to produce `E2E_STATIC_TOKEN`; deploy to a Vercel preview/prod URL → export `E2E_BASE_URL`.
- **Run:** `vitest run tests/e2e` with `E2E_BASE_URL`, `E2E_STATIC_TOKEN`, Supabase test creds in CI secrets.
- **Deployment Protection** disabled (or bypass token) on the target URL so the test client can reach `/api/mcp`.
- **Manual client smoke (A9, recorded once):** add the production URL as a Claude.ai custom connector (OAuth completes, tools listed) and as a ChatGPT dev-mode connector with the static token (tools listed, `search`+`fetch` callable). Captured in the PR description; automated suites cover everything else.

**Pass condition:** suites 1–5 green against the live URL, with the single documented xfail (`get_financial_statements` may be upstream-empty) explicitly allowed.
