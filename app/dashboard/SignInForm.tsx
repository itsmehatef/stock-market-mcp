"use client";

import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/browser";

/**
 * Email magic-link sign-in (invite-only).
 *
 * Calls supabase.auth.signInWithOtp with emailRedirectTo -> /auth/callback.
 * Account creation is gated in the database by the mcp_allowed_emails
 * allowlist, so a magic link is only usable by approved emails; everyone
 * else is rejected when their user row would be created.
 */
export default function SignInForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );
  const [message, setMessage] = useState("");

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!email) return;
    setStatus("sending");
    setMessage("");
    try {
      const supabase = createClient();
      const redirectTo = `${window.location.origin}/auth/callback`;
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo },
      });
      if (error) {
        setStatus("error");
        setMessage(
          /invite|not approved|allow/i.test(error.message)
            ? "That email isn't on the invite list."
            : error.message,
        );
        return;
      }
      setStatus("sent");
      setMessage(`Magic link sent to ${email}. Check your inbox.`);
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Sign-in failed.");
    }
  }

  const busy = status === "sending" || status === "sent";

  return (
    <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12, maxWidth: 340 }}>
      <label style={{ display: "grid", gap: 6, fontSize: 14 }}>
        <span>Email address</span>
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@domain.com"
          disabled={busy}
          style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #d0d0d0", fontSize: 15 }}
        />
      </label>
      <button
        type="submit"
        disabled={busy}
        style={{
          padding: "10px 14px", borderRadius: 8, border: "none",
          background: "#111", color: "#fff", fontSize: 15,
          cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1,
        }}
      >
        {status === "sending" ? "Sending…" : "Email me a magic link"}
      </button>
      <p style={{ margin: 0, fontSize: 13, color: "#777" }}>
        Invite-only — only approved emails can sign in.
      </p>
      {message ? (
        <p style={{ margin: 0, fontSize: 14, color: status === "error" ? "#b00020" : "#0a7d28" }}>
          {message}
        </p>
      ) : null}
    </form>
  );
}
