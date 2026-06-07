/**
 * Singleton `yahoo-finance2` client for the MCP server.
 *
 * Configured for a serverless / no-stdout-noise environment:
 * - Notices (the Yahoo survey + "RIP historical" banners) are suppressed so
 *   nothing is printed on the request path.
 * - A no-op logger swallows the library's internal `info`/`warn`/`debug`
 *   chatter; only `error` is forwarded to `console.error` for diagnostics.
 * - Schema-validation logging is disabled (`logErrors` / `logOptionsErrors`)
 *   so partial Yahoo payloads don't spam stdout; `allowAdditionalProps` keeps
 *   newly-added upstream fields from throwing.
 * - `versionCheck` is off — there is no point phoning home for a newer version
 *   from inside a stateless function, and it would log on every error.
 *
 * The default in-memory cookie jar is intentionally kept: v3 has no
 * filesystem-backed cache, so nothing here writes to disk.
 */
import YahooFinance from "yahoo-finance2";

const noop = (): void => {};

export const yf = new YahooFinance({
  suppressNotices: ["yahooSurvey", "ripHistorical"],
  versionCheck: false,
  validation: {
    logErrors: false,
    logOptionsErrors: false,
    allowAdditionalProps: true,
  },
  logger: {
    info: noop,
    warn: noop,
    debug: noop,
    dir: noop,
    error: (...args: unknown[]) => console.error(...args),
  },
});
