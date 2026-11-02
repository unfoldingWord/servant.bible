/**
 * Types for scripts/page/standard.mjs, so tests/node/ can import it under
 * `tsc --project tests/tsconfig.json` without `allowJs`.
 */

export interface StandardOptions {
  /** The Markdown of docs/mcp-standard.md. */
  markdown: string;
  /** The stylesheet to inline. */
  css: string;
  /** The package version, shown in the colophon. */
  version: string;
}

export type StandardBlock =
  | { type: 'heading'; level: 1 | 2; text: string; line: number }
  | { type: 'paragraph'; text: string; line: number }
  | { type: 'list'; items: string[]; line: number };

/** The document as blocks; throws naming the line on Markdown outside the subset. */
export function parseStandard(markdown: string): StandardBlock[];

/** Render the standard's page (ADR 0008); throws like `parseStandard`. */
export function renderStandard(options: StandardOptions): string;
