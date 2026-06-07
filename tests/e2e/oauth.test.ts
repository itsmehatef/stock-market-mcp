import { describe, it, expect } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const BASE = process.env.E2E_BASE_URL;
const SUPA = process.env.E2E_SUPABASE_URL;
const ANON = process.env.E2E_ANON_KEY;
const EMAIL = process.env.E2E_LOGIN_EMAIL;
const PW = process.env.E2E_LOGIN_PASSWORD;
const ready = Boolean(BASE && SUPA && ANON && EMAIL && PW);

describe.skipIf(!ready)("oauth: Supabase JWT accepted at the resource server", () => {
  it("logs in via Supabase and calls tools with the issued JWT", async () => {
    const r = await fetch(`${SUPA}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: ANON as string, "content-type": "application/json" },
      body: JSON.stringify({ email: EMAIL, password: PW }),
    });
    const j = (await r.json()) as { access_token?: string };
    expect(j.access_token, "got a Supabase access_token").toBeTruthy();
    const transport = new StreamableHTTPClientTransport(new URL(BASE as string), {
      requestInit: { headers: { Authorization: `Bearer ${j.access_token}` } },
    });
    const client = new Client({ name: "oauth-e2e", version: "0" }, { capabilities: {} });
    await client.connect(transport);
    const { tools } = await client.listTools();
    expect(tools.length).toBe(21);
    const res = await client.callTool({ name: "get_quote", arguments: { symbols: "AAPL" } });
    expect(res.isError).not.toBe(true);
    expect(res.content?.[0]?.text ?? "").toMatch(/regularMarketPrice/);
    await client.close();
  });
});
