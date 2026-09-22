/**
 * Marker protocol between the subprocess workers and the scenario harness.
 *
 * Workers append one JSON line per phase. The harness polls the file so it can
 * SIGKILL a worker at a precise point (e.g. right after the simulated provider
 * accepted page 5's request and before any local commit).
 */
import { appendFileSync, readFileSync } from "node:fs";

export type WorkerPhase =
  | "story-completed"
  | "started"
  | "provider-boundary"
  | "provider-accepted"
  | "gate-hold"
  | "release"
  | "applied"
  | "completed"
  | "failed"
  | "terminal";

export interface Marker {
  time: number;
  bookId: string;
  workerId: string;
  pageNumber?: number;
  phase: WorkerPhase;
  extra?: string;
}

export function writeMarker(filePath: string, marker: Omit<Marker, "time">): void {
  const line = `${JSON.stringify({ ...marker, time: Date.now() })}\n`;
  appendFileSync(filePath, line);
}

export function readMarkers(filePath: string): Marker[] {
  try {
    const content = readFileSync(filePath, "utf8").trim();
    if (!content) return [];
    return content
      .split("\n")
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line) as Marker);
  } catch {
    return [];
  }
}

export function waitForMarker(
  filePath: string,
  predicate: (m: Marker) => boolean,
  timeoutMs: number
): Promise<Marker> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tick = () => {
      const found = readMarkers(filePath).find(predicate);
      if (found) {
        resolve(found);
        return;
      }
      if (Date.now() >= deadline) {
        reject(new Error(`marker not observed within ${timeoutMs}ms: ${predicate.toString()}`));
        return;
      }
      setTimeout(tick, 25);
    };
    tick();
  });
}