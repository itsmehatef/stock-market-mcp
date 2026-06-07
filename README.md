# Stock Market MCP

A remote [Model Context Protocol](https://modelcontextprotocol.io) server that exposes the full surface of [Yahoo Finance](https://finance.yahoo.com) — quotes, fundamentals, options, ownership, analyst coverage, screening, search, and news — through [`yahoo-finance2`](https://github.com/gadicc/node-yahoo-finance2). It ships **21 tools** backed by **real Yahoo Finance data only**: every tool calls the live upstream method, and on failure it surfaces the real error rather than falling back to mock data. Built on Next.js 16 (App Router) and deployed on Vercel as a single Streamable-HTTP endpoint, with dual authentication (static bearer tokens and OAuth 2.1).

## Live endpoint

```
https://stock-market-mcp.vercel.app/api/mcp
```

The endpoint speaks MCP over **Streamable HTTP** and requires a bearer token (see [Connecting](#connecting)). An unauthenticated request returns a `401` with a `WWW-Authenticate` challenge pointing at the Protected Resource Metadata document.

## Tools

All tools are read-only (`readOnlyHint: true`, `openWorldHint: true`) and non-destructive.

| Tool | Description |
|------|-------------|
| `get_quote` | Real-time / delayed quote(s) for one or many symbols (stocks, ETFs, indices, FX, crypto, options); batches many symbols in one request. Params: `symbols` (string or string[]), `fields?`, `region?`, `lang?`. |
| `get_quote_combine` | Single-symbol quote via the debounced `quoteCombine`, which coalesces concurrent single-symbol requests into one upstream call. Params: `symbol`, `fields?`, `region?`, `lang?`, `maxBatchSize?`. |
| `get_recommendations_by_symbol` | Related / similar symbols for one or many tickers (algorithmic peer similarity). Distinct from analyst recommendation trends. Params: `symbols` (string or string[]). |
| `get_trending_symbols` | Symbols currently trending in a region. The first argument is a **region code** (e.g. `US`, `GB`, `DE`), not a ticker. Params: `region`, `count?`, `lang?`. |
| `get_quote_summary` | Raw passthrough to `quoteSummary`: returns any of the 33 data modules verbatim (or `all`). Params: `symbol`, `modules` (string[] or `"all"`). |
| `get_company_profile` | Company / asset profile: business summary, sector, industry, address, key officers, plus live price and quote type. Params: `symbol`. |
| `get_key_statistics` | Valuation and key statistics: market cap, P/E, margins, returns, shares outstanding, beta, and more. Params: `symbol`. |
| `get_earnings` | Earnings: reported vs estimated EPS history, the earnings/estimates trend, and upcoming calendar events (next earnings, dividend / ex-dividend dates). Params: `symbol`. |
| `get_analyst_info` | Analyst coverage: recommendation trend, upgrade/downgrade history, and price targets / opinion counts. Params: `symbol`. |
| `get_holders` | Ownership data: institutional & fund ownership, major holders breakdown, major direct holders, insider holders, insider transactions, net share purchase activity. Params: `symbol`, `holderType?` (`institutional` / `fund` / `insider` / `major` / `all`). |
| `get_sec_filings` | SEC filing metadata: filing type, title, date, and EDGAR links (no full text). Params: `symbol`. |
| `get_fund_data` | Fund / ETF data: profile (family, category, fees), performance history, and top holdings with sector/asset allocation. Only meaningful for funds and ETFs. Params: `symbol`. |
| `get_financial_statements` | Income statement, balance sheet, and/or cash-flow history via the legacy `quoteSummary` statement modules. **Largely empty upstream since November 2024 — kept for parity; use `get_fundamentals_time_series` for live statement data.** Params: `symbol`, `statement?` (`income` / `balance` / `cashflow` / `all`), `quarterly?`. |
| `get_fundamentals_time_series` | Detailed financial-statement line items over time (income statement, balance sheet, cash flow) from `/ws/fundamentals-timeseries`. The **live statement source** and upstream-recommended replacement for `get_financial_statements`. Params: `symbol`, `period1` (required), `period2?`, `type?` (`annual` / `quarterly` / `trailing`), `module` (required: `financials` / `balance-sheet` / `cash-flow` / `all`), `region?`, `lang?`. |
| `get_chart` | Historical OHLCV candles plus dividend/split events from `/v8/finance/chart`. Supports intraday intervals (1m–90m, 1h) and daily/weekly/monthly candles. Preferred time-series tool. Params: `symbol`, `period1` (required), `period2?`, `interval?`, `includePrePost?`, `events?`. |
| `get_historical` | Historical daily/weekly/monthly data from the legacy download endpoint: OHLCV with adjusted close, or a dividends / stock-splits series. Soft-superseded by `get_chart`; kept for adjusted-close and dividend/split convenience. Params: `symbol`, `period1` (required), `period2?`, `interval?`, `events?` (`history` / `dividends` / `split`), `includeAdjustedClose?`. |
| `get_options` | Options chain from `/v7/finance/options`: calls, puts, strikes, bid/ask, volume, open interest, implied volatility, and the underlying quote. Omit `date` for the nearest expiry plus all available expiration dates. Params: `symbol`, `date?`, `formatted?`, `region?`, `lang?`. |
| `search` | Search Yahoo Finance for symbols, companies, and related news (`/v1/finance/search`; the only built-in news source). Returns `{ results: [{ id, title, url, ... }] }`. Doubles as the ChatGPT deep-research `search` contract. Params: `query`, `quotesCount?`, `newsCount?`, `enableFuzzyQuery?`, `region?`, `lang?`. |
| `fetch` | Resolve an opaque id from `search` to a readable document: a ticker id resolves to a company quote summary; a news id (`news#<uuid>`) returns metadata. Returns `{ id, title, text, url, metadata }`. ChatGPT deep-research contract; harmless to other clients. Params: `id`. |
| `get_insights` | Yahoo Finance trading insights from `/ws/insights`: technical outlook (short/intermediate/long term), key technicals, valuation, company-vs-sector snapshot, and research-report metadata. Params: `symbol`, `reportsCount?`, `region?`, `lang?`. |
| `run_screener` | Run a Yahoo Finance predefined screener (`/v1/finance/screener`), e.g. `day_gainers`, `day_losers`, `most_actives`, `growth_technology_stocks`. Replaces the deprecated `dailyGainers`/`dailyLosers` methods. Params: `scrIds`, `count?`, `region?`, `lang?`. |

> `period1` / `period2` / `date` accept an ISO date string (e.g. `"2024-01-01"`) or a unix timestamp in seconds. `search` and `fetch` satisfy the ChatGPT deep-research / company-knowledge contract while still embedding the richer Yahoo fields for other clients.

## Connecting

The server is auth-gated. Pick the path that matches your client.

### ChatGPT developer mode / Cursor / CLI (static bearer token)

These clients accept a user-pasted static bearer token. Sign in to the [dashboard](https://stock-market-mcp.vercel.app/dashboard) (magic-link email), mint a token, and **copy it once** — only its hash is stored, so it cannot be retrieved again. The token is prefixed `yfmcp_`.

Add the server to your MCP client config with the URL and an `Authorization: Bearer <token>` header. Example client config JSON:

```json
{
  "mcpServers": {
    "stock-market": {
      "url": "https://stock-market-mcp.vercel.app/api/mcp",
      "headers": {
        "Authorization": "Bearer yfmcp_YOUR_TOKEN_HERE"
      }
    }
  }
}
```

In ChatGPT developer mode, add a custom connector pointing at the URL above and supply the same `Bearer yfmcp_…` token. The `search` and `fetch` tools satisfy ChatGPT's deep-research / company-knowledge contract.

### Claude.ai (custom connector — OAuth 2.1)

The claude.ai web connector does **not** accept a pasted static bearer; it uses OAuth. Add the live endpoint as a **custom connector** in Claude. Claude discovers the Protected Resource Metadata (RFC 9728) from the `401` challenge, finds the Supabase Authorization Server, and runs **OAuth 2.1 with Dynamic Client Registration (RFC 7591) and PKCE (S256)** against Supabase. Access tokens are audience-bound to the MCP endpoint (RFC 8707).

> This path requires the Supabase OAuth 2.1 server to be enabled and configured (DCR endpoint, JWKS, and the Custom Access Token Hook that binds `aud` to the MCP URL). See [`docs/planning/AUTH_DESIGN.md`](docs/planning/AUTH_DESIGN.md) for the full design and the Claude-vs-ChatGPT compatibility matrix.

## Authentication

The MCP route is wrapped with `withMcpAuth` (required, scope `mcp:read`). Verification is **dual-path** ([`lib/auth/verifyToken.ts`](lib/auth/verifyToken.ts)): static-bearer first, OAuth JWT second. Returning no `AuthInfo` makes the handler emit the `401` challenge with the `WWW-Authenticate` / `resource_metadata` hint.

### Path 1 — static bearer tokens

- Tokens are **opaque**, prefixed `yfmcp_`, and generated from 32 random bytes (base62-encoded). The plaintext is shown to the user exactly once at mint time.
- At rest, only a **peppered SHA-256 hash** is stored: `sha256_hex(BEARER_TOKEN_PEPPER + plaintext)`. The pepper is a server-only secret.
- Verification computes the peppered hash and calls the `verify_bearer_token` **`SECURITY DEFINER`** RPC via the Supabase **anon/publishable** client. The RPC returns the `user_id` + scopes only for a token that is valid, unrevoked, and unexpired, and stamps `last_used_at` itself. **No service-role key is used or shipped anywhere.**

**Why an anon-executable RPC is safe here:** the RPC takes the *already-peppered hash* as its only input — never the plaintext token. The server pepper never leaves the server, so an attacker who can call the anon RPC still cannot turn a guessed token into the correct hash without it. And brute-forcing the SHA-256 of a 32-byte random token is computationally infeasible. The RPC therefore leaks nothing useful: a caller who can supply the correct hash already effectively holds a valid token.

### Path 2 — OAuth 2.1 JWTs

- Access tokens are verified with [`jose`](https://github.com/panva/jose) against the Supabase **JWKS** (`createRemoteJWKSet`), using **ES256**.
- Verification is **issuer-bound** (`OAUTH_ISSUER`) and **audience-bound** to the MCP endpoint (`MCP_SERVER_URL`, RFC 8707) — a token minted for a different audience is rejected. Expiry and scope are enforced from the token claims.

The server never forwards the client's bearer to Yahoo (no confused-deputy): Yahoo Finance is always called anonymously.

### Security notes

- The `verify_bearer_token` RPC is intentionally `SECURITY DEFINER` and anon-executable — see the rationale above. This is a deliberate design decision, not an oversight; Supabase's security advisor flags `SECURITY DEFINER` generically.
- Enabling Supabase **leaked-password protection** (HaveIBeenPwned check) for dashboard sign-in is recommended.
- Row-Level Security on `mcp_bearer_tokens` scopes every dashboard read/insert/update to `auth.uid()`, so a signed-in user can only see and revoke their own tokens. The dashboard server actions read `user_id` from the session (never from client input) and pass it explicitly to satisfy the RLS `with check`.
- Static tokens are independently revocable (`revoked_at`) and optionally expiring (`expires_at`), so they do not depend on Supabase session lifetime.

## Environment variables

Copy `.env.example` and fill in the values. The MCP route and the dashboard read these; all server-only secrets are read lazily so `next build` succeeds without them present.

| Variable | Scope | Purpose |
|----------|-------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | client + server | Supabase project URL. The only Supabase URL inlined into the browser bundle. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client + server | Supabase anon/publishable key for the browser and SSR auth clients. |
| `SUPABASE_ANON_KEY` | server | Anon/publishable key used by the server-side client that calls the `verify_bearer_token` RPC. |
| `SUPABASE_JWKS_URL` | server | Supabase JWKS URL (`…/auth/v1/.well-known/jwks.json`) for `jose` JWT verification. |
| `OAUTH_ISSUER` | server | Supabase Authorization Server issuer; must match the JWT `iss` exactly. |
| `MCP_SERVER_URL` | server | Canonical MCP resource URI (`https://<app>.vercel.app/api/mcp`). Used as the JWT `aud` and the PRM `resource`. |
| `BEARER_TOKEN_PREFIX` | server | Static-token prefix used to distinguish bearers from JWTs. Defaults to `yfmcp_`. |
| `BEARER_TOKEN_PEPPER` | server (secret) | Server-only pepper mixed into the SHA-256 of static tokens. Never exposed to the client. |
| `E2E_BASE_URL` | testing | The deployed `/api/mcp` endpoint under test. |
| `E2E_STATIC_TOKEN` | testing (secret) | A pre-minted static bearer (`yfmcp_…`) for the E2E suite. |

> Only `NEXT_PUBLIC_*` variables reach the browser bundle. No service-role key exists in this project, and the pepper and JWKS/issuer config are read exclusively on the server.

## Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The MCP endpoint is at `/api/mcp` and the token dashboard at `/dashboard`.

Build and lint:

```bash
npm run build
npm run lint
```

## Testing

The end-to-end suite runs against a **live deployment** (real Yahoo data, real auth). Set the two env vars and run:

```bash
export E2E_BASE_URL="https://stock-market-mcp.vercel.app/api/mcp"
export E2E_STATIC_TOKEN="yfmcp_YOUR_TEST_TOKEN"
npm run test:e2e
```

The suite (`tests/e2e/`) covers discovery, the `401` / auth challenge flow, and one assertion block per tool. `scripts/smoke.mjs` and `scripts/smoke_full.mjs` are quick connectivity / tool-listing checks.

## License

See [LICENSE](LICENSE).
