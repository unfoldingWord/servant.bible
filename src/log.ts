/**
 * One structured line per forwarded request (#8, "Observability"). Workers
 * Logs captures console output, so per-server request count, latency,
 * upstream status, and error rate come from these lines. Never the request or
 * response body, never the URL beyond org, server, and version: bodies carry
 * user questions and Bible text.
 */

export interface ForwardLine {
  org: string;
  server: string;
  version: string;
  method: string;
  upstream_status: number;
  /** Time to the upstream response headers; a streamed body finishes later. */
  duration_ms: number;
  /** Present when the router generated the 502 itself: why the backend was not reached. */
  error?: string;
}

export function logForward(line: ForwardLine): void {
  console.log(JSON.stringify({ event: 'forward', ...line }));
}

/**
 * The page gate (ADR 0006) found no credential in this deployment and answered
 * 503 instead of serving the page open. One line per refused request, so the
 * misconfiguration is visible in Workers Logs rather than silent.
 */
export function logPageGateUnconfigured(): void {
  console.error(JSON.stringify({ event: 'page_gate', error: 'not configured' }));
}
