/**
 * Shared MCP tool annotations.
 *
 * Every finance tool is non-destructive and reaches out to Yahoo (an external,
 * "open world" source), so they all share the same hints. ChatGPT in
 * particular requires `readOnlyHint` to surface these as read-only tools.
 */
export const readOnly = {
  readOnlyHint: true,
  openWorldHint: true,
} as const;
