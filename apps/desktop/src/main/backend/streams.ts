// Placeholder for the "streams" domain backend — build streams, the autonomy
// dial, steering, and questions. No domain state or methods yet; this file
// exists so that work package extends an established shape (constructor +
// dispose(), matching ./core.ts's CoreBackend) instead of inventing the
// pattern from scratch. Composed into the Backend facade in ./index.ts.
export class StreamsBackend {
  // No timers/listeners to set up yet — add them here, following
  // CoreBackend's constructor in ./core.ts as the convention (seed state,
  // start any interval/subscription bookkeeping, track disposables).

  dispose(): void {
    // No timers/listeners to release yet.
  }
}
