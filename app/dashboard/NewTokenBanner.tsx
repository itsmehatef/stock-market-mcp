"use client";

import { useState } from "react";

/**
 * One-time display of a freshly minted plaintext token. Rendered only when the
 * `?token=` redirect param is present. Provides a copy button and a clear
 * warning that the value cannot be retrieved again.
 */
export default function NewTokenBanner({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable — user can still select the text manually.
    }
  }

  return (
    <div
      style={{
        border: "1px solid #e2b400",
        background: "#fff8e1",
        borderRadius: 10,
        padding: 16,
        marginBottom: 24,
      }}
    >
      <strong style={{ display: "block", marginBottom: 6 }}>
        Your new token — copy it now
      </strong>
      <p style={{ margin: "0 0 12px", fontSize: 14, color: "#5b4a00" }}>
        This is the only time the full token will be shown. Store it somewhere
        safe; it cannot be retrieved again.
      </p>
      <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
        <code
          style={{
            flex: 1,
            padding: "10px 12px",
            background: "#fff",
            border: "1px solid #e0d8b0",
            borderRadius: 8,
            fontSize: 14,
            wordBreak: "break-all",
            userSelect: "all",
          }}
        >
          {token}
        </code>
        <button
          type="button"
          onClick={copy}
          style={{
            padding: "0 14px",
            borderRadius: 8,
            border: "none",
            background: "#111",
            color: "#fff",
            fontSize: 14,
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}
