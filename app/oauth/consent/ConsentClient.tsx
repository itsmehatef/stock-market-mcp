"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import SignInForm from "@/app/dashboard/SignInForm";

type View = "loading" | "signin" | "consent" | "working" | "error";

export default function ConsentClient({ authorizationId }: { authorizationId: string }) {
  const [view, setView] = useState<View>("loading");
  const [clientName, setClientName] = useState("An application");
  const [scopes, setScopes] = useState<string[]>([]);
  const [email, setEmail] = useState("");
  const [err, setErr] = useState("");
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    (async () => {
      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          setView("signin");
          return;
        }
        const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
        if (error || !data) {
          setErr(error?.message ?? "Could not load the authorization request.");
          setView("error");
          return;
        }
        if (!("authorization_id" in data)) {
          // Already consented — Supabase returned the final redirect.
          window.location.assign(data.redirect_url);
          return;
        }
        const c = data.client as { name?: string; client_name?: string } | undefined;
        setClientName(c?.name ?? c?.client_name ?? "An application");
        setScopes((data.scope ?? "").split(" ").filter(Boolean));
        setEmail(data.user?.email ?? session.user.email ?? "");
        setView("consent");
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Unexpected error.");
        setView("error");
      }
    })();
  }, [authorizationId]);

  async function decide(approve: boolean) {
    setView("working");
    try {
      const supabase = createClient();
      const res = approve
        ? await supabase.auth.oauth.approveAuthorization(authorizationId)
        : await supabase.auth.oauth.denyAuthorization(authorizationId);
      if (res.error) {
        setErr(res.error.message);
        setView("error");
        return;
      }
      if (res.data?.redirect_url) {
        window.location.assign(res.data.redirect_url);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Unexpected error.");
      setView("error");
    }
  }

  if (view === "loading" || view === "working") {
    return <p style={{ color: "#555" }}>{view === "working" ? "Completing…" : "Loading…"}</p>;
  }
  if (view === "error") {
    return (
      <>
        <h1 style={{ fontSize: 22, marginBottom: 8 }}>Authorization error</h1>
        <p style={{ color: "#b00020" }}>{err}</p>
      </>
    );
  }
  if (view === "signin") {
    return (
      <>
        <h1 style={{ fontSize: 22, marginBottom: 8 }}>Sign in to authorize</h1>
        <p style={{ color: "#555", marginBottom: 20 }}>Sign in to approve this connection request.</p>
        <SignInForm next={`/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}`} />
      </>
    );
  }
  // consent
  return (
    <>
      <h1 style={{ fontSize: 22, marginBottom: 8 }}>Authorize access</h1>
      <p style={{ color: "#333", marginBottom: 4 }}>
        <strong>{clientName}</strong> wants to connect to <strong>Stock Market MCP</strong>.
      </p>
      {email ? <p style={{ color: "#777", fontSize: 14, marginTop: 0 }}>Signed in as {email}</p> : null}
      <div style={{ background: "#f6f6f6", borderRadius: 8, padding: "12px 14px", margin: "16px 0", fontSize: 14 }}>
        <div style={{ color: "#555", marginBottom: 6 }}>It will be able to:</div>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li>Read real-time Yahoo Finance market data (read-only)</li>
          {scopes.length ? <li style={{ color: "#888" }}>Scopes: {scopes.join(", ")}</li> : null}
        </ul>
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={() => decide(true)} style={{ flex: 1, padding: "11px 14px", borderRadius: 8, border: "none", background: "#111", color: "#fff", fontSize: 15, cursor: "pointer" }}>
          Approve
        </button>
        <button onClick={() => decide(false)} style={{ flex: 1, padding: "11px 14px", borderRadius: 8, border: "1px solid #d0d0d0", background: "#fff", color: "#111", fontSize: 15, cursor: "pointer" }}>
          Deny
        </button>
      </div>
    </>
  );
}
