/**
 * Suite 1 — Metadata discovery (RFC 9728 PRM + AS metadata).
 *
 * Pure raw-fetch protocol assertions against the live deployment. Confirms the
 * Protected Resource Metadata document (root + path-inserted variants) points
 * at the /api/mcp resource and an authorization server, and that the AS's
 * OpenID configuration is reachable and self-consistent.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { baseUrl, originUrl } from "./helpers";

describe("discovery: protected resource metadata", () => {
  let origin: string;
  let mcpUrl: string;

  beforeAll(() => {
    origin = originUrl();
    mcpUrl = baseUrl();
  });

  it("GET /.well-known/oauth-protected-resource → 200, resource === /api/mcp URL, authorization_servers set", async () => {
    const res = await fetch(`${origin}/.well-known/oauth-protected-resource`);
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      resource?: string;
      authorization_servers?: string[];
    };
    expect(body.resource).toBe(mcpUrl);
    expect(Array.isArray(body.authorization_servers)).toBe(true);
    expect(body.authorization_servers!.length).toBeGreaterThan(0);
  });

  it("GET /.well-known/oauth-protected-resource/api/mcp (path-inserted) → 200, identical resource + authorization_servers", async () => {
    const rootRes = await fetch(
      `${origin}/.well-known/oauth-protected-resource`,
    );
    const root = (await rootRes.json()) as Record<string, unknown>;

    const res = await fetch(
      `${origin}/.well-known/oauth-protected-resource/api/mcp`,
    );
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      resource?: string;
      authorization_servers?: string[];
    };
    expect(body.resource).toBe(mcpUrl);
    expect(body.authorization_servers).toEqual(root.authorization_servers);
  });

  it("the issuer's openid-configuration is reachable and self-consistent", async () => {
    const prm = (await (
      await fetch(`${origin}/.well-known/oauth-protected-resource`)
    ).json()) as { authorization_servers: string[] };

    const issuer = prm.authorization_servers[0];
    expect(typeof issuer).toBe("string");

    // The Supabase AS serves its discovery doc at the issuer-rooted path.
    const res = await fetch(`${issuer}/.well-known/openid-configuration`);
    expect(res.status).toBe(200);

    const config = (await res.json()) as {
      issuer?: string;
      authorization_endpoint?: string;
      token_endpoint?: string;
    };
    // RFC 8414: the discovery doc's `issuer` must match the AS we derived it from.
    expect(config.issuer).toBe(issuer);
    expect(config.authorization_endpoint).toMatch(/^https:\/\//);
    expect(config.token_endpoint).toMatch(/^https:\/\//);
  });
});
