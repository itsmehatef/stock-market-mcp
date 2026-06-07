# TOOL_MAP — MCP Tools → yahoo-finance2

**Date:** 2026-06-07
**Library:** `yahoo-finance2` v3.15.2+ (`new YahooFinance()` instance).
**Real data only.** Every tool calls the real method; on Yahoo failure the underlying method throws and the tool surfaces the real error (no mock fallback).
**Annotations:** all tools are `readOnlyHint: true`, `openWorldHint: true`, non-destructive.

---

## 1. Tool table (20 finance tools + 2 ChatGPT shim tools = 22)

| # | Tool | yahoo-finance2 method | Params (zod shape) | Notes |
|---|------|-----------------------|--------------------|-------|
| 1 | `get_quote` | `quote(symbol\|symbol[], {fields?,lang?,region?,return?})` | `symbols: string\|string[]` (req); `fields?: string[]`; `lang?: string`; `region?: string`; `return?: 'array'\|'object'\|'map'` | `/v7/finance/quote`; batches many symbols. |
| 2 | `get_quote_combine` | `quoteCombine(symbol, {maxBatchSize?,...})` | `symbol: string` (req); `fields?: string[]`; `lang?`; `region?`; `maxBatchSize?: number` (def 100) | Auto-batches concurrent single-symbol calls. From `src/other/`. |
| 3 | `get_quote_summary` | `quoteSummary(symbol, {modules})` | `symbol: string` (req); `modules: string[]` (any of 33; `'all'` ok) | Raw passthrough to every module. |
| 4 | `get_company_profile` | `quoteSummary(symbol,{modules:['assetProfile','summaryProfile','price','quoteType','summaryDetail']})` | `symbol: string` (req) | Convenience split. |
| 5 | `get_key_statistics` | `quoteSummary(symbol,{modules:['defaultKeyStatistics','financialData','summaryDetail']})` | `symbol: string` (req) | `financialData`/`defaultKeyStatistics` still populate. |
| 6 | `get_financial_statements` | `quoteSummary(symbol,{modules:[...StatementHistory(+Quarterly), 'earnings']})` | `symbol: string` (req); `statement?: 'income'\|'balance'\|'cashflow'\|'all'`; `quarterly?: boolean` | **WARNING: empty since Nov 2024.** Kept for parity; route real loads to #7. |
| 7 | `get_fundamentals_time_series` | `fundamentalsTimeSeries(symbol,{period1,period2?,type?,module,...})` | `symbol: string` (req); `period1` (req, date/str/num); `period2?`; `type?: 'annual'\|'quarterly'\|'trailing'`; `module: 'financials'\|'balance-sheet'\|'cash-flow'\|'all'` (req); `region?`; `lang?` | **Live statement source** (the upstream-recommended replacement for #6). |
| 8 | `get_earnings` | `quoteSummary(symbol,{modules:['earnings','earningsHistory','earningsTrend','calendarEvents']})` | `symbol: string` (req) | `calendarEvents` also carries dividend/ex-div dates. |
| 9 | `get_analyst_info` | `quoteSummary(symbol,{modules:['recommendationTrend','upgradeDowngradeHistory','financialData']})` | `symbol: string` (req) | `financialData` holds `targetMeanPrice`, `numberOfAnalystOpinions`. |
| 10 | `get_holders` | `quoteSummary(symbol,{modules:['institutionOwnership','fundOwnership','majorHoldersBreakdown','majorDirectHolders','insiderHolders','insiderTransactions','netSharePurchaseActivity']})` | `symbol: string` (req); `holderType?: 'institutional'\|'fund'\|'insider'\|'major'\|'all'` | All ownership modules in one tool. |
| 11 | `get_sec_filings` | `quoteSummary(symbol,{modules:['secFilings']})` | `symbol: string` (req) | Metadata + EDGAR links only; no full text. |
| 12 | `get_fund_data` | `quoteSummary(symbol,{modules:['fundProfile','fundPerformance','topHoldings']})` | `symbol: string` (req) | Only meaningful for funds/ETFs. |
| 13 | `get_chart` | `chart(symbol,{period1,period2?,interval?,includePrePost?,events?,...})` | `symbol: string` (req); `period1` (req); `period2?`; `interval?: '1m'..'3mo'` (def `'1d'`); `includePrePost?: boolean`; `events?: string`; `return?: 'array'\|'object'` | `/v8/finance/chart`; supports intraday intervals. **Preferred over `historical`.** |
| 14 | `get_historical` | `historical(symbol,{period1,period2?,interval?,events?,includeAdjustedClose?})` | `symbol: string` (req); `period1` (req); `period2?`; `interval?: '1d'\|'1wk'\|'1mo'` (def `'1d'`); `events?: 'history'\|'dividends'\|'split'` (def `'history'`); `includeAdjustedClose?: boolean` | Soft-superseded by `chart`; kept for adjusted-close + dividends/splits convenience. |
| 15 | `get_options` | `options(symbol,{date?,formatted?,lang?,region?})` | `symbol: string` (req); `date?` (expiration; omit → nearest + all expiry dates); `formatted?: boolean`; `region?`; `lang?` | `/v7/finance/options`; omit `date` → expirationDates list. |
| 16 | `search` | `search(query,{quotesCount?,newsCount?,enableFuzzyQuery?,...})` | `query: string` (req); `quotesCount?: number` (def 6); `newsCount?: number` (def 4); `enableFuzzyQuery?: boolean`; `enableNavLinks?: boolean`; `lang?`; `region?` | **Only built-in news source** (via `newsCount`); replaces deprecated `autoc()`. Also doubles as the ChatGPT `search` data source (#21). |
| 17 | `get_insights` | `insights(symbol,{reportsCount?,lang?,region?})` | `symbol: string` (req); `reportsCount?: number` (def 2); `lang?`; `region?` | `/ws/insights`; technical outlook + research report metadata. |
| 18 | `get_recommendations_by_symbol` | `recommendationsBySymbol(symbol\|symbol[])` | `symbols: string\|string[]` (req) | Peer/similar symbols. Distinct from analyst `recommendationTrend`. |
| 19 | `get_trending_symbols` | `trendingSymbols(region,{count?,lang?})` | `region: string` (req, e.g. `'US'`,`'GB'`,`'DE'`); `count?: number` (def 5); `lang?` | First arg is a **region code**, not a symbol. |
| 20 | `run_screener` | `screener(scrIds,{count?,region?,lang?})` | `scrIds: string` (req predefined id); `count?: number`; `region?`; `lang?` | Replaces deprecated `dailyGainers`/`dailyLosers` (use `'day_gainers'`/`'day_losers'`). |
| 21 | `search` (ChatGPT contract) | `search(query)` reshaped | `query: string` (req) → `{results:[{id,title,url}]}` | ChatGPT deep-research shim. Maps Yahoo quote/news hits to `{id,title,url}`; `id` = `symbol` or `news#<uuid>`. Same tool name as #16 with the ChatGPT-required output shape (one `search` tool serves both). |
| 22 | `fetch` (ChatGPT contract) | `quoteSummary`/`quote` reshaped | `id: string` (req) → `{id,title,text,url,metadata?}` | Resolves an opaque id from `search` to a text blob. ChatGPT-only; harmless to Claude. |

> **Note on `search` duplication:** there is ONE registered `search` tool. Its output is shaped to satisfy ChatGPT's `{results:[{id,title,url}]}` contract while still embedding the richer Yahoo quote/news payload in each result's fields. This keeps the server a valid ChatGPT company-knowledge source without a second redundant tool.

---

## 2. quoteSummary modules (33) available via `get_quote_summary`

`assetProfile`, `summaryProfile`, `summaryDetail`, `quoteType`, `price`, `defaultKeyStatistics`, `financialData`, `calendarEvents`, `secFilings`, `recommendationTrend`, `upgradeDowngradeHistory`, `earnings`, `earningsHistory`, `earningsTrend`, `indexTrend`, `industryTrend`, `sectorTrend`, `incomeStatementHistory`, `incomeStatementHistoryQuarterly`, `balanceSheetHistory`, `balanceSheetHistoryQuarterly`, `cashflowStatementHistory`, `cashflowStatementHistoryQuarterly`, `insiderHolders`, `insiderTransactions`, `institutionOwnership`, `fundOwnership`, `majorDirectHolders`, `majorHoldersBreakdown`, `netSharePurchaseActivity`, `fundProfile`, `fundPerformance`, `topHoldings`.

> The six `*StatementHistory(+Quarterly)` modules have returned little/no data since **Nov 2024**. `get_fundamentals_time_series` (#7) is the live replacement for statement data.

---

## 3. Deprecated methods (now throw — do not wrap)
- `autoc()` → throws. Use `search` (#16).
- `dailyGainers()` / `dailyLosers()` → throw. Use `run_screener` with `scrIds: 'day_gainers'` / `'day_losers'`.
- `streamer` exists on the dev branch as a standalone protobuf decode helper, **not** a client method. No live-stream tool in v1.

---

## 4. Coverage gaps vs Python yfinance (documented, accepted for v1)

| Gap | yfinance has | yahoo-finance2 reality | Our handling |
|---|---|---|---|
| First-class per-ticker **news** feed | `Ticker.news` / `get_news` | No `news()` method | Use `search(query,{newsCount})` (query-driven, not per-ticker stream). |
| **Multi-ticker bulk OHLCV** | `yf.download([...])` aligned frame | `chart()`/`historical()` are single-symbol | Caller loops; `quote`/`quoteCombine` batch quotes only. |
| **ESG / sustainability** | `Ticker.sustainability` | No module | Not available. |
| **mutualfund_holders** split | distinct table | only `fundOwnership`/`institutionOwnership` | Covered partially via `get_holders`. |
| **earnings_dates** calendar table | forward/backward dated table | `earningsHistory` (past) + `calendarEvents` (next) | Partial via `get_earnings`. |
| **Live websocket** stream | `live()` / async stream | `streamer.ts` decoder only, not wired | Not a tool in v1. |
| **SEC full-text** | metadata-only too | `secFilings` metadata + links | Shared limitation; metadata only. |
| **Analyst estimate tables** (`earnings_estimate`, `revenue_estimate`, `eps_trend`, `eps_revisions`, `growth_estimates`, `analyst_price_targets`) | discrete normalized tables | overlapping data inside `earningsTrend`/`financialData`/`recommendationTrend` | Surfaced via `get_analyst_info` + `get_earnings`, not as discrete tables. |
| **Shares-outstanding time series** | `get_shares_full()` | only point-in-time in `defaultKeyStatistics` | Point-in-time only via `get_key_statistics`. |
| **Capital-gains accessor** | `Ticker.capital_gains` | only as chart events | Via `get_chart` events payload. |
| **ISIN lookup** | `Ticker.isin` | none | Not available. |

These gaps are **acknowledged, not bugs.** v1 ships the full real `yahoo-finance2` surface; the gaps are inherent library limitations, not omissions.
