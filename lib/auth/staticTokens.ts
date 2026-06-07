import { createHash, randomBytes } from "node:crypto";

/**
 * Static bearer token helpers.
 *
 * Tokens are opaque, prefixed (`yfmcp_`), and stored at rest only as a
 * peppered SHA-256 hash. The plaintext is shown to the user exactly once at
 * mint time. The server pepper (`BEARER_TOKEN_PEPPER`) is a server-only secret
 * read lazily so `next build` succeeds without it.
 */

const DEFAULT_PREFIX = "yfmcp_";

const BASE62_ALPHABET =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

function getPrefix(): string {
  return process.env.BEARER_TOKEN_PREFIX ?? DEFAULT_PREFIX;
}

function getPepper(): string {
  const pepper = process.env.BEARER_TOKEN_PEPPER;
  if (!pepper) {
    throw new Error("BEARER_TOKEN_PEPPER is not set");
  }
  return pepper;
}

/**
 * Base62-encode a byte buffer (big-endian) without BigInt, via repeated
 * division of a base-256 digit array by 62. Keeps the codebase on the
 * project's ES2017 target (no BigInt literals).
 */
function base62Encode(buf: Buffer): string {
  // digits holds the number in base 256, most-significant first.
  let digits = Array.from(buf);
  // Strip leading zero bytes so the loop terminates cleanly.
  while (digits.length > 0 && digits[0] === 0) {
    digits = digits.slice(1);
  }
  if (digits.length === 0) return "0";

  let out = "";
  while (digits.length > 0) {
    let remainder = 0;
    const quotient: number[] = [];
    for (const digit of digits) {
      const acc = remainder * 256 + digit;
      const q = Math.floor(acc / 62);
      remainder = acc % 62;
      if (quotient.length > 0 || q > 0) {
        quotient.push(q);
      }
    }
    out = BASE62_ALPHABET[remainder] + out;
    digits = quotient;
  }
  return out;
}

/**
 * Peppered SHA-256 hash of a plaintext token, hex-encoded.
 * hash = sha256_hex(BEARER_TOKEN_PEPPER + plaintext)
 */
export function sha256Hex(plaintext: string): string {
  return createHash("sha256")
    .update(getPepper() + plaintext, "utf8")
    .digest("hex");
}

/** Convenience alias: the hash to store / look up for a given plaintext. */
export function hashFor(plaintext: string): string {
  return sha256Hex(plaintext);
}

/**
 * Generate a fresh static token.
 * @returns the plaintext (shown once) and its display prefix (first 12 chars).
 */
export function generateToken(): { plaintext: string; prefix: string } {
  const random = base62Encode(randomBytes(32));
  const plaintext = `${getPrefix()}${random}`;
  const prefix = plaintext.slice(0, 12);
  return { plaintext, prefix };
}
