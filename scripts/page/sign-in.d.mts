/**
 * Types for scripts/page/sign-in.mjs, so tests/node/ can import it under
 * `tsc --project tests/tsconfig.json` without `allowJs`.
 */

export interface SignInOptions {
  /** The stylesheet to inline. */
  css: string;
  /** The package version, shown in the colophon. */
  version: string;
  /** Whether to say the credential did not match. */
  failed: boolean;
}

/** Render the sign-in page (ADR 0007). */
export function renderSignIn(options: SignInOptions): string;
