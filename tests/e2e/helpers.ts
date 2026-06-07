/**
 * Shared helpers for the live E2E suite.
 *
 * Everything is configured from env so no secret is hard-coded in a test file:
 *   - E2E_BASE_URL      the MCP endpoint, e.g. https://…/api/mcp
 *   - E2E_STATIC_TOKEN  a valid static bearer (yfmcp_…) for a test user
 *
 * `connectClient` opens an authenticated MCP session over Streamable HTTP
 * exactly like scripts/smoke_full.mjs; `parseToolResult` unwraps the standard
 * `{ content: [{ type:'text', text:<json> }] }` envelope every tool returns.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

/** The MCP endpoint under test (e.g. https://stock-market-mcp.vercel.app/api/mcp). */
export function baseUrl(): string {
  const url = process.env.E2E_BASE_URL;
  if (!url) {
    throw new Error(
      "E2E_BASE_URL is not set (expected the /api/mcp endpoint URL).",
    );
  }
  return url.replace(/\/$/, "");
}

/** The origin of the MCP endpoint, used to build /.well-known/* URLs. */
export function originUrl(): string {
  return new URL(baseUrl()).origin;
}

/** A valid static bearer token for an existing test user. */
export function staticToken(): string {
  const token = process.env.E2E_STATIC_TOKEN;
  if (!token) {
    throw new Error("E2E_STATIC_TOKEN is not set (expected an yfmcp_… token).");
  }
  return token;
}

/** Open an authenticated MCP client/session over Streamable HTTP. */
export async function connectClient(token = staticToken()): Promise<Client> {
  const transport = new StreamableHTTPClientTransport(new URL(baseUrl()), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  });
  const client = new Client({ name: "e2e", version: "0" }, { capabilities: {} });
  await client.connect(transport);
  return client;
}

/** The shape of a tools/call response after SDK parsing. */
export type ToolCallResult = {
  isError?: boolean;
  content?: Array<{ type: string; text?: string }>;
};

/**
 * Extract the first text block of a tool result and parse it as JSON.
 * Returns both the raw text and the parsed value so callers can assert on
 * either (real-data presence checks parse JSON; latency/size checks use text).
 */
export function parseToolResult(result: ToolCallResult): {
  text: string;
  json: unknown;
} {
  const text = result.content?.find((c) => c.type === "text")?.text ?? "";
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }
  return { text, json };
}
