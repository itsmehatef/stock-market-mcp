/**
 * Shared helpers for shaping `yahoo-finance2` results into MCP tool content.
 *
 * Yahoo payloads contain `Date` objects (coerced by the library) and the
 * occasional `bigint`, neither of which `JSON.stringify` handles by default —
 * `stringify` below normalizes both so every tool returns valid, pretty JSON.
 */

type TextContentResult = {
  content: { type: "text"; text: string }[];
};

type ErrorContentResult = TextContentResult & { isError: true };

/** JSON.stringify with `Date` -> ISO string and `bigint` -> string. */
function stringify(data: unknown): string {
  return JSON.stringify(
    data,
    (_key, value) => {
      if (value instanceof Date) return value.toISOString();
      if (typeof value === "bigint") return value.toString();
      return value;
    },
    2,
  );
}

/** Wrap arbitrary data as a single pretty-printed JSON text block. */
export function toTextContent(data: unknown): TextContentResult {
  return { content: [{ type: "text", text: stringify(data) }] };
}

/** Wrap an error as an MCP error result (no throwing across the boundary). */
export function toErrorContent(err: unknown): ErrorContentResult {
  const text = err instanceof Error ? err.message : String(err);
  return { content: [{ type: "text", text }], isError: true };
}
