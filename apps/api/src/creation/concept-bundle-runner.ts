import {
  ageYearsOn,
  duplicateTitles,
  getTheme,
  invalidCharacterNames,
  isEmotionalGoal,
  isReadingLevel,
  isValidConceptLength,
  readingLevelForAgeYears,
  type Book,
  type Fact,
  type StoryConcept
} from "@for-little-ones/domain";
import type { ConceptRequest, ConceptResult } from "@for-little-ones/contracts";
import type {
  ClaimedUnit,
  DurableExecutionRuntime,
  EnqueueRequest,
  JobView,
  LeaseHeldResult,
  LeaseRefusedResult,
  UnitFailure
} from "@for-little-ones/execution";
import type { ModerationProvider, StoryProvider } from "@for-little-ones/providers";
import type { EventSink } from "../analytics/event-sink";
import { buildConceptRequest } from "./concept-request";
import type { CreationStore } from "./creation-store";

/**
 * F-007 §9 — the single durable GENERATE_CONCEPTS step. The concept bundle is the
 * first real consumer of DurableExecutionContract (D019): one leased, retry-budgeted
 * unit per (book, conceptVersion); the unit key doubles as the idempotency key;
 * progress is observable via `job(operationKey)`. F-010 wires the real HTTP
 * transport/worker loop; this class drives the seam.
 *
 * The worker NEVER serves fallback concepts: when the model path fails twice
 * (F-007 §10), execution exhausts with a non-retryable `CONCEPT_GENERATION_EXHAUSTED`
 * failure, the job goes FAILED, and the API (BookService.serveFallbackConcepts)
 * keeps the journey alive with the catalogue-authored bundle — "served from the
 * API, not from a second worker pass" (F-007 §9).
 */
export const CONCEPT_BUNDLE_OP = "creation/concept-bundle";
export const CONCEPT_BUNDLE_UNIT = "concept-bundle";
/** Retry budget we enqueue with: original + 2 automatic retries (F-007 §9). */
export const CONCEPT_BUNDLE_MAX_ATTEMPTS = 3;

export interface ConceptBundleUnitPayload {
  bookId: string;
  conceptVersion: number;
  themeId: string;
  themeSeedVersion: string;
  childProfileId: string;
}

export type ConceptBundleResult = {
  kind: typeof CONCEPT_BUNDLE_OP;
  source: "model";
  conceptVersion: number;
  concepts: StoryConcept[];
};

export interface ConceptBundleDeps {
  runtime: DurableExecutionRuntime;
  store: CreationStore;
  /** The card is structurally required at the seam — a concept provider without a
   *  verified data policy cannot be wired in (AGENTS.md provider rule). */
  storyProvider: Pick<StoryProvider, "generateConcepts" | "card">;
  moderation: ModerationProvider;
  events: EventSink;
  /** The generation-eligible fact query (BookService.getFactsForStory in the shell). */
  getFactsForStory: (input: { childProfileId: string }) => Promise<Fact[]>;
  /** F-001 §8 owner guard — the transport has already resolved the browser token. */
  assertProjectAccess: (anonymousProjectId: string, projectId: string) => Promise<unknown>;
  now: () => string;
}

export class ConceptBundleRunner {
  constructor(private readonly deps: ConceptBundleDeps) {}

  operationKey(bookId: string, conceptVersion: number): string {
    return `${CONCEPT_BUNDLE_OP}:${bookId}:v${conceptVersion}`;
  }

  /** F-007: persist-flow entrypoint — enqueue one idempotent unit; observe via `job()`. */
  async requestBundle(input: {
    bookId: string;
    conceptVersion: number;
    anonymousProjectId: string;
  }): Promise<JobView> {
    const book = await this.deps.store.getBook(input.bookId);
    if (!book) throw new Error(`book not found: ${input.bookId}`);
    if (!book.themeId || !book.themeSeedVersion) throw new Error(`book ${input.bookId} has no theme selected`);
    if (!book.projectId) throw new Error(`book ${input.bookId} has no owning project`);
    await this.deps.assertProjectAccess(input.anonymousProjectId, book.projectId);
    const childProfileId = book.childProfileIds[0];
    if (!childProfileId) throw new Error(`book ${input.bookId} has no child profile`);
    const request: EnqueueRequest = {
      operationKey: this.operationKey(input.bookId, input.conceptVersion),
      units: [
        {
          unitKey: CONCEPT_BUNDLE_UNIT,
          maxAttempts: CONCEPT_BUNDLE_MAX_ATTEMPTS,
          payload: {
            bookId: input.bookId,
            conceptVersion: input.conceptVersion,
            themeId: book.themeId,
            themeSeedVersion: book.themeSeedVersion,
            childProfileId
          }
        }
      ]
    };
    return this.deps.runtime.enqueue(request);
  }

  /** Claim-and-run for the transport/worker loop to call (drains at most `limit` units). */
  async runNext(workerId: string, limit = 1): Promise<Array<LeaseHeldResult | LeaseRefusedResult>> {
    const claimed = await this.deps.runtime.claim({ workerId, limit });
    const outcomes: Array<LeaseHeldResult | LeaseRefusedResult> = [];
    for (const unit of claimed) {
      outcomes.push(await this.runClaimed(workerId, unit));
    }
    return outcomes;
  }

  async runClaimed(workerId: string, claimed: ClaimedUnit): Promise<LeaseHeldResult | LeaseRefusedResult> {
    const attempt = await this.execute(claimed);
    if (attempt.ok === "ok") {
      return this.deps.runtime.complete(workerId, claimed.unitId, attempt.output);
    }
    return this.deps.runtime.fail(workerId, claimed.unitId, attempt.failure);
  }

  private async execute(claimed: ClaimedUnit): Promise<
    { ok: "ok"; output: ConceptBundleResult } | { ok: "fail"; failure: UnitFailure }
  > {
    const payload = claimed.payload as ConceptBundleUnitPayload;

    // F-007 §9 resumability: a crashed worker that re-claims finds the existing
    // PROPOSED bundle under the same (bookId, conceptVersion) and completes with
    // it, never regenerating or appending a second bundle.
    const resumed = await this.existingProposedBundle(payload);
    if (resumed.length > 0) {
      return {
        ok: "ok",
        output: { kind: CONCEPT_BUNDLE_OP, source: "model", conceptVersion: payload.conceptVersion, concepts: resumed }
      };
    }

    const book = await this.deps.store.getBook(payload.bookId);
    if (!book) {
      return { ok: "fail", failure: { code: "BOOK_NOT_FOUND", message: `book ${payload.bookId} missing`, retryable: false } };
    }
    const theme = getTheme(payload.themeId);
    if (!theme) {
      return { ok: "fail", failure: { code: "THEME_MISSING", message: `theme ${payload.themeId} not in catalogue`, retryable: false } };
    }

    const request = await this.requestFor(payload, theme.conceptSeed);
    // ClaimedUnit exposes attempts (0 = first claim) but not the budget; the runner
    // enqueues its own fixed budget, so the final attempt is knowable here.
    const finalAttempt = claimed.attempts >= CONCEPT_BUNDLE_MAX_ATTEMPTS - 1;

    let modelConcepts: StoryConcept[] | undefined;
    try {
      const result = await this.deps.storyProvider.generateConcepts(request);
      const mapped = this.toDomainConcepts(result, payload, request.locale);
      if (await this.isValidAndAllowed(mapped, book, request)) {
        modelConcepts = mapped;
      }
    } catch {
      modelConcepts = undefined;
    }

    if (!modelConcepts) {
      if (!finalAttempt) {
        return {
          ok: "fail",
          failure: { code: "CONCEPT_GENERATION_FAILED", message: "concept provider unavailable or invalid output", retryable: true }
        };
      }
      return {
        ok: "fail",
        failure: {
          code: "CONCEPT_GENERATION_EXHAUSTED",
          message: "model path failed twice; fallback concepts are API-served (F-007 §9)",
          retryable: false
        }
      };
    }

    await this.deps.store.saveConcepts({
      bookId: payload.bookId,
      conceptVersion: payload.conceptVersion,
      themeSeedVersion: payload.themeSeedVersion,
      concepts: stripConcepts(modelConcepts)
    });

    await this.deps.events.push({
      name: "concepts.generated",
      at: this.deps.now(),
      attributes: { bookId: payload.bookId, conceptVersion: payload.conceptVersion, source: "model" }
    });

    return { ok: "ok", output: { kind: CONCEPT_BUNDLE_OP, source: "model", conceptVersion: payload.conceptVersion, concepts: modelConcepts } };
  }

  private async existingProposedBundle(payload: ConceptBundleUnitPayload): Promise<StoryConcept[]> {
    const all = await this.deps.store.listConceptsByBook(payload.bookId);
    // Resume only a MODEL bundle: an API-served fallback bundle (same deterministic
    // ids under the same (book, version)) must never be relabelled source "model",
    // and the job owns the model path — it replaces any fallback bundle on re-run.
    return all.filter(
      (c) => c.conceptVersion === payload.conceptVersion && c.status === "PROPOSED" && c.source === "model"
    );
  }

  private async requestFor(
    payload: ConceptBundleUnitPayload,
    themeSeed: ConceptRequest["themeSeed"]
  ): Promise<ConceptRequest> {
    const facts = await this.deps.getFactsForStory({ childProfileId: payload.childProfileId });
    const profile = await this.deps.store.getProfile(payload.childProfileId);
    const age = profile ? ageYearsOn(profile.dateOfBirth, this.deps.now().slice(0, 10)) : undefined;
    return buildConceptRequest({
      displayName: profile?.displayName ?? payload.childProfileId,
      locale: profile?.locale ?? "en-GB",
      facts,
      themeId: payload.themeId,
      themeSeedVersion: payload.themeSeedVersion,
      themeSeed,
      ...(profile?.pronouns ? { pronouns: profile.pronouns } : {}),
      ...(age !== undefined ? { readingLevel: readingLevelForAgeYears(age) } : {})
    });
  }

  private toDomainConcepts(result: ConceptResult, payload: ConceptBundleUnitPayload, locale: string): StoryConcept[] {
    return result.concepts.map((c, index) => ({
      id: `concept:${payload.bookId}:v${payload.conceptVersion}:${index}`,
      bookId: payload.bookId,
      conceptVersion: payload.conceptVersion,
      themeSeedVersion: payload.themeSeedVersion,
      title: c.title,
      pitch: c.pitch,
      emotionalGoal: c.emotionalGoal,
      themeId: c.themeId,
      readingLevel: c.readingLevel,
      approximateLengthPages: c.approximateLengthPages,
      charactersUsed: c.charactersUsed,
      locale: normaliseLocale(locale),
      source: "model",
      status: "PROPOSED",
      createdAt: this.deps.now()
    }));
  }

  /**
   * Validation rail (F-007 §4/§11): exactly 3 distinct titles, in-canon
   * vocabulary, characters exist in the book, age-band consistent reading level —
   * THEN the moderation gate screens the ACTUAL copy (title+pitch). A BLOCK
   * verdict disqualifies the whole bundle.
   */
  private async isValidAndAllowed(concepts: StoryConcept[], book: Book, request: ConceptRequest): Promise<boolean> {
    if (concepts.length !== 3) return false;
    if (duplicateTitles(concepts).length > 0) return false;
    const names = new Set(book.characters.map((c) => c.name));
    const structurallyValid = concepts.every(
      (c) =>
        isEmotionalGoal(c.emotionalGoal) &&
        isReadingLevel(c.readingLevel) &&
        (request.readingLevel === undefined || c.readingLevel === request.readingLevel) &&
        isValidConceptLength(c.approximateLengthPages) &&
        invalidCharacterNames(c, names).length === 0 &&
        c.themeId === book.themeId
    );
    if (!structurallyValid) return false;
    for (const concept of concepts) {
      const verdict = await this.deps.moderation.screen({
        contentType: "text",
        contentRef: `book:${book.id}/concept:${concept.title}`,
        content: `${concept.title} — ${concept.pitch}`,
        policySetVersion: "for-little-ones/text/v1"
      });
      if (verdict.verdict === "BLOCK") return false;
    }
    return true;
  }
}

function normaliseLocale(locale: string): "en-GB" | "en-US" {
  return locale === "en-US" ? "en-US" : "en-GB";
}

function stripConcepts(
  concepts: StoryConcept[]
): Array<Omit<StoryConcept, "id" | "bookId" | "conceptVersion" | "themeSeedVersion" | "status" | "createdAt">> {
  return concepts.map(({ id: _id, bookId: _bookId, conceptVersion: _v, themeSeedVersion: _s, status: _status, createdAt: _c, ...rest }) => rest);
}