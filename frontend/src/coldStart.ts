// Render's free tier spins a service down after this much inactivity, so it is
// also the shortest gap that can possibly have produced a cold start.
export const RENDER_IDLE_MS = 15 * 60 * 1000

// How long a request must run before we blame a cold start. Waking a free-tier
// service takes tens of seconds, so this sits well above ordinary slowness —
// the point is to reassure during a genuine wake-up, not to flag every slow
// query.
export const COLD_START_HINT_MS = 10_000

// Whether a slow request can plausibly be explained by the server waking up.
// A server that answered us recently is demonstrably awake, so its slowness is
// an ordinary slow response and belongs to the calling page's loading state
// rather than a full-width banner. `lastResponseAt` is null before anything has
// come back at all, when the server is still unproven.
export function couldBeColdStart(lastResponseAt: number | null, now: number): boolean {
  if (lastResponseAt === null) return true
  return now - lastResponseAt > RENDER_IDLE_MS
}
