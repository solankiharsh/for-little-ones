import { TimedEventSink } from "../analytics/event-sink";

/**
 * D024 §9: `TimedEventSink` → `POST /_internal/events`.
 *
 * The sink buffers timed events and flushes them in one batch. The batch is posted with
 * the caller's own session cookie, so ingestion is authenticated rather than a public
 * write hole, and the endpoint's allow-list is the last word on what may land.
 *
 * A 207 (partial accept) is surfaced to the caller instead of being swallowed: the
 * rejects are a contract drift between emitter and allow-list that someone must see.
 */
export function createInternalEventFlusher(options: {
  fetch: typeof globalThis.fetch;
  baseUrl: string;
  /**
   * The caller's own `Cookie` header, verbatim — e.g. `flo_session=<raw token>`.
   * Deliberately NOT the project id: ingestion authenticates the session the way every
   * other route does, by token digest lookup.
   */
  cookie: string;
  flushMs?: number;
  onPartialAccept?: (rejected: Array<{ index: number; name: string; reason: string }>) => void;
}): TimedEventSink {
  return new TimedEventSink(
    async (events) => {
      const response = await options.fetch(`${options.baseUrl.replace(/\/$/u, "")}/api/_internal/events`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: options.cookie
        },
        body: JSON.stringify({ events })
      });
      if (response.status !== 200 && response.status !== 207) {
        throw new Error(`analytics ingestion failed: ${response.status} ${await response.text()}`);
      }
      const body = (await response.json()) as { rejected?: Array<{ index: number; name: string; reason: string }> };
      if ((body.rejected ?? []).length > 0) options.onPartialAccept?.(body.rejected!);
    },
    options.flushMs ?? 5_000
  );
}
