/**
 * Types for scripts/page/render.mjs, so tests/node/ can import it under
 * `tsc --project tests/tsconfig.json` without `allowJs`.
 */

export interface RenderOptions {
  /** The stylesheet to inline. */
  css: string;
  /** The copy-button script to inline. */
  script: string;
  /** The package version, shown in the hero eyebrow and the colophon. */
  version: string;
}

/** HTML-escape a value for text or an attribute. */
export function escape(value: unknown): string;

/** Render the page from a parsed servers.json that already passed the schema. */
export function renderPage(doc: unknown, options: RenderOptions): string;
