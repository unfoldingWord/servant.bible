/**
 * Types for scripts/generate-page.mjs, so tests/node/ can import it under
 * `tsc --project tests/tsconfig.json` without `allowJs`.
 */

export interface GeneratePaths {
  serversPath?: string;
  schemaPath?: string;
  outPath?: string;
}

/**
 * Validate the list at `serversPath` against `schemaPath`, render the page,
 * write it to `outPath`, and return the HTML. Throws, writing nothing, when
 * the list is invalid. Every path defaults to the repository's own.
 */
export function generatePage(paths?: GeneratePaths): string;
