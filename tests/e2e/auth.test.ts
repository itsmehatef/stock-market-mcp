/**
 * Suite 2 — Unauthenticated / invalid-bearer rejection.
 *
 * Raw-fetch protocol assertions: an `initialize` POST with no Authorization
 * header must be rejected with a 401 that carries a WWW-Authenticate challenge
 * pointing at the PRM (resource_metadata); a clearly-invalid yfmcp_ token must
 * also be rejected with 401.
 */
import { describe, it, expect } from "vitest";
import { baseUrl } from "./helpers";

const INITIALIZE_BODY = JSON.stringify({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "e2e", version: "0" },
  },
});

const BASE_HEADERS = {
  "Content-Type": "application/json",
  Accept: "application/json, text/event-stream",
};

describe("auth: unauthenticated and invalid bearer", () => {
  it("POST initialize with NO Authorization → 401 + WWW-Authenticate w/ resource_metadata", async () => {
    const res = await fetch(baseUrl(), {
      method: "POST",
      headers: BASE_HEADERS,
      body: INITIALIZE_BODY,
    });

    expect(res.status).toBe(401);

    const challenge = res.headers.get("www-authenticate");
    expect(challenge).toBeTruthy();
    expect(challenge!.toLowerCase()).toContain("bearer");
    // The challenge must hint where the PRM lives so the client can discover auth.
    expect(challenge).toContain("resource_metadata");
    expect(challenge).toContain(
      "/.well-known/oauth-protected-resource",
    );
  });

  it("POST initialize with a clearly-invalid yfmcp_ token → 401", async () => {
    const res = await fetch(baseUrl(), {
      method: "POST",
      headers: {
        ...BASE_HEADERS,
        Authorization:
          "Bearer yfmcp_bogus000000000000000000000000000000000000",
      },
      body: INITIALIZE_BODY,
    });

    expect(res.status).toBe(401);
    // Still issues a challenge so the client knows to (re)authenticate.
    expect(res.headers.get("www-authenticate")).toBeTruthy();
  });
});
