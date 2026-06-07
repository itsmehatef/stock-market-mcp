import { createClient } from "@/lib/supabase/server";
import { mintToken, revokeToken, signOut } from "./actions";
import SignInForm from "./SignInForm";
import NewTokenBanner from "./NewTokenBanner";

/**
 * Token-management dashboard (server component).
 *
 * - Not signed in -> render the magic-link sign-in form.
 * - Signed in -> list the user's tokens (read with their RLS-scoped client) and
 *   expose mint / revoke server actions. A freshly minted plaintext arrives via
 *   the `?token=` redirect param and is shown exactly once.
 *
 * Env is read lazily inside `createClient`, so this page builds without the
 * Supabase variables present.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TokenRow = {
  id: string;
  name: string | null;
  token_prefix: string | null;
  created_at: string | null;
  last_used_at: string | null;
  revoked_at: string | null;
};

function fmt(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

const page: React.CSSProperties = {
  maxWidth: 760,
  margin: "0 auto",
  padding: "48px 24px",
  fontFamily:
    "var(--font-geist-sans), system-ui, -apple-system, sans-serif",
  color: "#111",
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token: newToken, error } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <main style={page}>
        <h1 style={{ fontSize: 24, marginBottom: 8 }}>Stock Market MCP</h1>
        <p style={{ color: "#555", marginBottom: 24 }}>
          Sign in to mint and manage your API tokens.
        </p>
        {error === "auth" ? (
          <p style={{ color: "#b00020", marginBottom: 16 }}>
            Sign-in link was invalid or expired. Please try again.
          </p>
        ) : null}
        <SignInForm />
      </main>
    );
  }

  const { data, error: queryError } = await supabase
    .from("mcp_bearer_tokens")
    .select(
      "id, name, token_prefix, created_at, last_used_at, revoked_at",
    )
    .order("created_at", { ascending: false });

  const tokens = (data ?? []) as TokenRow[];

  return (
    <main style={page}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 8,
        }}
      >
        <h1 style={{ fontSize: 24, margin: 0 }}>API Tokens</h1>
        <form action={signOut}>
          <button
            type="submit"
            style={{
              background: "none",
              border: "none",
              color: "#555",
              fontSize: 14,
              cursor: "pointer",
              textDecoration: "underline",
            }}
          >
            Sign out
          </button>
        </form>
      </div>
      <p style={{ color: "#555", marginTop: 0, marginBottom: 24 }}>
        Signed in as {user.email ?? user.id}.
      </p>

      {newToken ? <NewTokenBanner token={newToken} /> : null}

      {error === "mint_failed" ? (
        <p style={{ color: "#b00020" }}>
          Could not mint a token. Please try again.
        </p>
      ) : null}
      {error === "revoke_failed" ? (
        <p style={{ color: "#b00020" }}>
          Could not revoke that token. Please try again.
        </p>
      ) : null}

      <section
        style={{
          border: "1px solid #e5e5e5",
          borderRadius: 10,
          padding: 16,
          marginBottom: 32,
        }}
      >
        <h2 style={{ fontSize: 16, marginTop: 0, marginBottom: 12 }}>
          Mint a new token
        </h2>
        <form
          action={mintToken}
          style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
        >
          <input
            type="text"
            name="name"
            placeholder="Token name (e.g. cursor-laptop)"
            maxLength={80}
            style={{
              flex: "1 1 240px",
              padding: "10px 12px",
              borderRadius: 8,
              border: "1px solid #d0d0d0",
              fontSize: 15,
            }}
          />
          <button
            type="submit"
            style={{
              padding: "10px 16px",
              borderRadius: 8,
              border: "none",
              background: "#111",
              color: "#fff",
              fontSize: 15,
              cursor: "pointer",
            }}
          >
            Mint token
          </button>
        </form>
      </section>

      <h2 style={{ fontSize: 16, marginBottom: 12 }}>Your tokens</h2>
      {queryError ? (
        <p style={{ color: "#b00020" }}>
          Could not load tokens: {queryError.message}
        </p>
      ) : tokens.length === 0 ? (
        <p style={{ color: "#777" }}>
          No tokens yet. Mint one above to get started.
        </p>
      ) : (
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 14,
          }}
        >
          <thead>
            <tr style={{ textAlign: "left", color: "#666" }}>
              <th style={{ padding: "8px 8px", borderBottom: "1px solid #e5e5e5" }}>
                Name
              </th>
              <th style={{ padding: "8px 8px", borderBottom: "1px solid #e5e5e5" }}>
                Prefix
              </th>
              <th style={{ padding: "8px 8px", borderBottom: "1px solid #e5e5e5" }}>
                Created
              </th>
              <th style={{ padding: "8px 8px", borderBottom: "1px solid #e5e5e5" }}>
                Last used
              </th>
              <th style={{ padding: "8px 8px", borderBottom: "1px solid #e5e5e5" }}>
                Status
              </th>
              <th style={{ padding: "8px 8px", borderBottom: "1px solid #e5e5e5" }} />
            </tr>
          </thead>
          <tbody>
            {tokens.map((t) => {
              const revoked = Boolean(t.revoked_at);
              return (
                <tr key={t.id}>
                  <td style={{ padding: "8px 8px", borderBottom: "1px solid #f0f0f0" }}>
                    {t.name ?? "—"}
                  </td>
                  <td
                    style={{
                      padding: "8px 8px",
                      borderBottom: "1px solid #f0f0f0",
                      fontFamily:
                        "var(--font-geist-mono), ui-monospace, monospace",
                    }}
                  >
                    {t.token_prefix ?? "—"}…
                  </td>
                  <td style={{ padding: "8px 8px", borderBottom: "1px solid #f0f0f0" }}>
                    {fmt(t.created_at)}
                  </td>
                  <td style={{ padding: "8px 8px", borderBottom: "1px solid #f0f0f0" }}>
                    {fmt(t.last_used_at)}
                  </td>
                  <td style={{ padding: "8px 8px", borderBottom: "1px solid #f0f0f0" }}>
                    {revoked ? (
                      <span style={{ color: "#b00020" }}>
                        Revoked {fmt(t.revoked_at)}
                      </span>
                    ) : (
                      <span style={{ color: "#0a7d28" }}>Active</span>
                    )}
                  </td>
                  <td
                    style={{
                      padding: "8px 8px",
                      borderBottom: "1px solid #f0f0f0",
                      textAlign: "right",
                    }}
                  >
                    {revoked ? null : (
                      <form action={revokeToken}>
                        <input type="hidden" name="id" value={t.id} />
                        <button
                          type="submit"
                          style={{
                            background: "none",
                            border: "1px solid #d0d0d0",
                            borderRadius: 6,
                            padding: "4px 10px",
                            fontSize: 13,
                            color: "#b00020",
                            cursor: "pointer",
                          }}
                        >
                          Revoke
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </main>
  );
}
