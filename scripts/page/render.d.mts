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

export interface HeadOptions {
  title: string;
  description: string;
  /** The stylesheet to inline. */
  css: string;
}

/** The repository's URL. */
export const REPO: string;

/** HTML-escape a value for text or an attribute. */
export function escape(value: unknown): string;

/** The document's opening lines through `</head>`, shared with the sign-in page. */
export function documentHead(options: HeadOptions): string[];

/** The site name, linking home. */
export function brand(): string;

/** The version line and repository link; `source` is what the page says it is generated from. */
export function colophon(version: string, source?: string): string;

/** The sign-out form (ADR 0007, decision 2). */
export function signOut(): string;

/** The nav bar around a list of `<li>` items. */
export function navBar(items: string[]): string;

/** Render the page from a parsed servers.json that already passed the schema. */
export function renderPage(doc: unknown, options: RenderOptions): string;
