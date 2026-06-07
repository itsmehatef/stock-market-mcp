import { defineConfig } from "vitest/config";

/**
 * Vitest config for the protocol-level E2E suite.
 *
 * These tests hit the LIVE production MCP deployment over the network, so the
 * timeouts are generous (Yahoo upstream + cold starts) and tests run serially
 * within each file. Configuration is driven entirely by env:
 *   - E2E_BASE_URL      base MCP endpoint, e.g. https://…/api/mcp
 *   - E2E_STATIC_TOKEN  a valid static bearer (yfmcp_…) for a test user
 */
export default defineConfig({
  test: {
    include: ["tests/e2e/**/*.test.ts"],
    // Live network + upstream Yahoo Finance can be slow; be patient per test.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // Avoid hammering the live deployment / Yahoo with parallel files.
    fileParallelism: false,
    reporters: ["default"],
  },
});
