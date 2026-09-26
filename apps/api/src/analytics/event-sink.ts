/**
 * Analytics event sink — F-001 §12 observability rail. Intentionally minuscule: a
 * contract for timed, buffered analytical events (never PII; never child data
 * content). The reliable durable path (D019) observes generation, so analytics here
 * stays side-channel smoke only.
 */

export interface AnalyticsEvent {
  name: string;
  at: string;
  /** Structured attributes, MUST be free of child data and raw facts. */
  attributes: Record<string, string | number | boolean>;
}

export interface EventSink {
  push(event: AnalyticsEvent): Promise<void>;
}

export class NoopEventSink implements EventSink {
  async push(_event: AnalyticsEvent): Promise<void> {}
}

export class MemoryEventSink implements EventSink {
  readonly events: AnalyticsEvent[] = [];

  async push(event: AnalyticsEvent): Promise<void> {
    this.events.push(event);
  }
}

/** Buffered sink that flushes on a timer for batching over HTTP later. */
export class TimedEventSink implements EventSink {
  private readonly buffer: AnalyticsEvent[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly flush: (events: AnalyticsEvent[]) => Promise<void>,
    private readonly flushMs = 5_000
  ) {}

  async push(event: AnalyticsEvent): Promise<void> {
    this.buffer.push(event);
    this.flushTimer ??= setTimeout(() => void this.flushNow(), this.flushMs);
  }

  async flushNow(): Promise<void> {
    if (this.flushTimer !== undefined) {
      clearTimeout(this.flushTimer);
      this.flushTimer = undefined;
    }
    if (this.buffer.length === 0) return;
    const batch = this.buffer.splice(0, this.buffer.length);
    await this.flush(batch);
  }
}