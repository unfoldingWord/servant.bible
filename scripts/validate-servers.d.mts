/**
 * Types for scripts/validate-servers.mjs, so tests/node/ can import it under
 * `tsc --project tests/tsconfig.json` without `allowJs`.
 */

/**
 * Validate a parsed servers document against a parsed JSON Schema. Returns one
 * string per error, each starting with the JSON pointer of the offending
 * value. An empty array means the document is valid.
 */
export function validateServers(doc: unknown, schema: object): string[];
