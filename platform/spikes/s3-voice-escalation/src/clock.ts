// Injectable clock + virtual-time scheduler.
//
// The escalation ladder must time out rungs deterministically and fast in tests
// (spike requirement: NO real wall-clock sleeps for rung timeouts). All time-driven
// behaviour in the state machine goes through this Clock abstraction so production
// can inject a RealClock and tests can inject a VirtualClock that advances time
// explicitly.

/** Cancel handle returned by Clock.setTimer. Idempotent. */
export type CancelTimer = () => void;

export interface Clock {
  /** Current epoch milliseconds. */
  now(): number;
  /** Current instant as an RFC 3339 UTC timestamp (matches schema `timestamp`). */
  nowIso(): string;
  /** Schedule `fn` to run after `delayMs`. Returns a cancel handle. */
  setTimer(delayMs: number, fn: () => void): CancelTimer;
}

/** Production clock backed by Date + setTimeout. Not used by the deterministic tests. */
export class RealClock implements Clock {
  now(): number {
    return Date.now();
  }
  nowIso(): string {
    return new Date().toISOString();
  }
  setTimer(delayMs: number, fn: () => void): CancelTimer {
    const h = setTimeout(fn, delayMs);
    return () => clearTimeout(h);
  }
}

interface ScheduledTask {
  id: number;
  fireAt: number;
  fn: () => void;
  cancelled: boolean;
}

/**
 * Deterministic virtual clock. Time only moves when `advance()` is called.
 * Timers due within the advance window fire in chronological order; timers
 * scheduled by those callbacks (e.g. the next rung's timeout) are honoured
 * within the same advance call if they fall inside the window.
 */
export class VirtualClock implements Clock {
  private current: number;
  private readonly epoch0Iso: number;
  private seq = 0;
  private tasks: ScheduledTask[] = [];

  constructor(startMs = 0, anchorIso = "2026-06-16T00:00:00.000Z") {
    this.current = startMs;
    // Anchor virtual ms=startMs to a real ISO instant so emitted timestamps
    // validate against the RFC 3339 `timestamp` format in the schema.
    this.epoch0Iso = Date.parse(anchorIso) - startMs;
  }

  now(): number {
    return this.current;
  }

  nowIso(): string {
    return new Date(this.epoch0Iso + this.current).toISOString();
  }

  setTimer(delayMs: number, fn: () => void): CancelTimer {
    const task: ScheduledTask = {
      id: this.seq++,
      fireAt: this.current + delayMs,
      fn,
      cancelled: false,
    };
    this.tasks.push(task);
    return () => {
      task.cancelled = true;
    };
  }

  /** Number of live (uncancelled, unfired) timers — useful for assertions. */
  pendingTimers(): number {
    return this.tasks.filter((t) => !t.cancelled).length;
  }

  /**
   * Advance virtual time by `deltaMs`, firing all due timers in chronological
   * order. Callbacks may schedule new timers; those inside the window fire too.
   */
  advance(deltaMs: number): void {
    const target = this.current + deltaMs;
    // Loop because callbacks can enqueue new timers within the window.
    for (;;) {
      const due = this.tasks
        .filter((t) => !t.cancelled && t.fireAt <= target)
        .sort((a, b) => a.fireAt - b.fireAt || a.id - b.id);
      if (due.length === 0) break;
      const next = due[0];
      this.tasks = this.tasks.filter((t) => t !== next);
      this.current = next.fireAt;
      if (!next.cancelled) next.fn();
    }
    this.current = target;
  }
}
