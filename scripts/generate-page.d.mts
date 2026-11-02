/**
 * Types for scripts/generate-page.mjs, so tests/node/ can import it under
 * `tsc --project tests/tsconfig.json` without `allowJs`.
 */

export interface GeneratePaths {
  serversPath?: string;
  schemaPath?: string;
  /** The Markdown of the MCP server standard (ADR 0008). */
  standardPath?: string;
  outPath?: string;
}

/** The sign-in pages' file names, written beside `outPath` (ADR 0007). */
export const SIGN_IN_FILES: { plain: string; failed: string };
/** The standard's file name, written beside `outPath` (ADR 0008). */
export const STANDARD_FILE: string;

/**
 * Validate the list at `serversPath` against `schemaPath`, render the page,
 * the two sign-in pages, and the standard at `standardPath`, write them
 * beside `outPath`, and return the page's HTML. Throws, writing nothing, when
 * the list is invalid or the standard has Markdown the renderer does not
 * know. Every path defaults to the repository's own.
 */
export function generatePage(paths?: GeneratePaths): string;
