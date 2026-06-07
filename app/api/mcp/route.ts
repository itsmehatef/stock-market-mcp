import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { registerAllTools } from "@/lib/tools";
import { verifyToken } from "@/lib/auth/verifyToken";

// yahoo-finance2 requires the Node runtime (cookies, custom fetch), not Edge.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handler = createMcpHandler(
  (server) => {
    registerAllTools(server);
  },
  {
    serverInfo: { name: "stock-market-mcp", version: "0.1.0" },
  },
  {
    basePath: "/api",
    maxDuration: 60,
    verboseLogs: false,
  },
);

// Auth-wrap the handler. A missing/invalid token yields 401 with a
// WWW-Authenticate header pointing at the PRM; missing scope yields 403.
const authHandler = withMcpAuth(handler, verifyToken, {
  required: true,
  requiredScopes: ["mcp:read"],
  resourceMetadataPath: "/.well-known/oauth-protected-resource",
});

export {
  authHandler as GET,
  authHandler as POST,
  authHandler as DELETE,
};

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Authorization, Content-Type, Mcp-Session-Id, Mcp-Protocol-Version",
  "Access-Control-Expose-Headers":
    "Mcp-Session-Id, Mcp-Protocol-Version, WWW-Authenticate",
};

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
