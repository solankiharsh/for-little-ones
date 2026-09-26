import { describe, expect, it, vi } from "vitest";
import { MemoryEventSink, TimedEventSink } from "../../src/analytics/event-sink";

describe("api: analytics event sink (F-001 §12)", () => {
  it("MemoryEventSink records events in order", async () => {
    const sink = new MemoryEventSink();
    await sink.push({ name: "a", at: "t1", attributes: { n: 1 } });
    await sink.push({ name: "b", at: "t2", attributes: {} });
    expect(sink.events.map((e) => e.name)).toEqual(["a", "b"]);
  });

  it("TimedEventSink flushes the buffer on timer while upstream is down it keeps draining", async () => {
    vi.useFakeTimers();
    try {
      const flushed: unknown[] = [];
      const sink = new TimedEventSink(async (batch) => {
        flushed.push(batch);
      }, 5_000);
      await sink.push({ name: "a", at: "t1", attributes: {} });
      await vi.advanceTimersByTimeAsync(5_001);
      expect(flushed).toHaveLength(1);
      expect((flushed[0] as Array<{ name: string }>)[0]?.name).toBe("a");
      await sink.push({ name: "b", at: "t2", attributes: {} });
      await sink.flushNow();
      expect(flushed).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });
});