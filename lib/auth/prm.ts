import { generateProtectedResourceMetadata } from "mcp-handler";

/**
 * Shared RFC 9728 Protected Resource Metadata builder + CORS headers.
 * Used by both PRM routes (root form and the path-inserted variant that
 * clients probe). Env read at request time so `next build` does not need it.
 */

export const PRM_CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

export function buildPrmResponse(): Response {
  const resourceUrl = process.env.MCP_SERVER_URL;
  const issuer = process.env.OAUTH_ISSUER;
  if (!resourceUrl || !issuer) {
    return new Response(JSON.stringify({ error: "server_misconfigured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const metadata = generateProtectedResourceMetadata({
    authServerUrls: [issuer],
    resourceUrl,
    additionalMetadata: {
      scopes_supported: ["mcp:read"],
      bearer_methods_supported: ["header"],
      resource_name: "Stock Market MCP",
    },
  });

  return new Response(JSON.stringify(metadata), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
      ...PRM_CORS_HEADERS,
    },
  });
}
