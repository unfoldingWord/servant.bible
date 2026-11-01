/**
 * Types for scripts/generate-page.mjs, so tests/node/ can import it under
 * `tsc --project tests/tsconfig.json` without `allowJs`.
 */

export interface GeneratePaths {
  serversPath?: string;
  schemaPath?: string;
  outPath?: string;
}

/** The sign-in pages' file names, written beside `outPath` (ADR 0007). */
export const SIGN_IN_FILES: { plain: string; failed: string };

/**
 * Validate the list at `serversPath` against `schemaPath`, render the page
 * and the two sign-in pages, write them beside `outPath`, and return the
 * page's HTML. Throws, writing nothing, when the list is invalid. Every path
 * defaults to the repository's own.
 */
export function generatePage(paths?: GeneratePaths): string;
