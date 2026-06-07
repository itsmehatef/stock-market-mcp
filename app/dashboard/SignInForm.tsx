"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";

/**
 * Google sign-in (invite-only).
 *
 * Calls supabase.auth.signInWithOAuth({ provider: "google" }), which redirects
 * to Google and back to /auth/callback to establish the session. Account
 * creation is gated in the database by an email allowlist, so non-approved
 * Google accounts are rejected during the callback.
 */
export default function SignInForm() {
  const [status, setStatus] = useState<"idle" | "redirecting" | "error">("idle");
  const [message, setMessage] = useState("");

  async function signInWithGoogle() {
    setStatus("redirecting");
    setMessage("");
    try {
      const supabase = createClient();
      const redirectTo = `${window.location.origin}/auth/callback`;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo },
      });
      if (error) {
        setStatus("error");
        setMessage(error.message);
      }
      // On success the browser is redirected to Google; nothing more to do here.
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Sign-in failed.");
    }
  }

  return (
    <div style={{ display: "grid", gap: 12, maxWidth: 340 }}>
      <button
        type="button"
        onClick={signInWithGoogle}
        disabled={status === "redirecting"}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          padding: "11px 16px",
          borderRadius: 8,
          border: "1px solid #d0d0d0",
          background: "#fff",
          color: "#111",
          fontSize: 15,
          fontWeight: 500,
          cursor: status === "redirecting" ? "default" : "pointer",
          opacity: status === "redirecting" ? 0.6 : 1,
        }}
      >
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
          <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.49h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.63z" />
          <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" />
          <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z" />
          <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
        </svg>
        {status === "redirecting" ? "Redirecting…" : "Sign in with Google"}
      </button>
      <p style={{ margin: 0, fontSize: 13, color: "#777" }}>
        Invite-only — only approved Google accounts can sign in.
      </p>
      {message ? (
        <p style={{ margin: 0, fontSize: 14, color: "#b00020" }}>{message}</p>
      ) : null}
    </div>
  );
}
