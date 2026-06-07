"use client";

import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/browser";

/**
 * Magic-link / email OTP sign-in. Calls `supabase.auth.signInWithOtp` with an
 * `emailRedirectTo` pointing back at `/auth/callback`, which exchanges the code
 * for a session and lands the user on the dashboard.
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
        setMessage(error.message);
        return;
      }
      setStatus("sent");
      setMessage(`Magic link sent to ${email}. Check your inbox.`);
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Sign-in failed.");
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12 }}>
      <label style={{ display: "grid", gap: 6, fontSize: 14 }}>
        <span>Email address</span>
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          disabled={status === "sending" || status === "sent"}
          style={{
            padding: "10px 12px",
            borderRadius: 8,
            border: "1px solid #d0d0d0",
            fontSize: 15,
          }}
        />
      </label>
      <button
        type="submit"
        disabled={status === "sending" || status === "sent"}
        style={{
          padding: "10px 14px",
          borderRadius: 8,
          border: "none",
          background: "#111",
          color: "#fff",
          fontSize: 15,
          cursor: status === "sending" ? "default" : "pointer",
          opacity: status === "sending" || status === "sent" ? 0.6 : 1,
        }}
      >
        {status === "sending" ? "Sending…" : "Send magic link"}
      </button>
      {message ? (
        <p
          style={{
            margin: 0,
            fontSize: 14,
            color: status === "error" ? "#b00020" : "#0a7d28",
          }}
        >
          {message}
        </p>
      ) : null}
    </form>
  );
}
