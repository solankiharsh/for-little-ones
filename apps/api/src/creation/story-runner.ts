import { createHash } from "node:crypto";
import {
  isReadingLevel,
  pageKeySeed,
  storyIdFor,
  STORY_PAGE_COUNT,
  type Book,
  type Fact,
  type Story,
  type StoryConcept,
  type StoryPage
} from "@for-little-ones/domain";
import {
  CONTRACT_NAMES,
  PageTextResultSchema,
  StoryOutlineResultSchema,
  parseContract,
  type PageTextRequest,
  type PageTextResult,
  type StoryOutlineResult
} from "@for-little-ones/contracts";
import { ValidationError } from "../errors";
import { BookNotFoundError } from "./book-service";
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
import type { CreationStore } from "./creation-store";

/**
 * F-008 story pipeline (D029) — the second durable generation seam, following the
 * proven `ConceptBundleRunner` shape: leased, retry-budgeted units on the
 * `DurableExecutionContract`, claim-time ownership re-checks, idempotent enqueue,
 * provider output validated before it becomes domain data.
 *
 * Two-phase operations (no cross-unit ordering support needed):
 * - `story/outline:{book}:v{n}` — one OUTLINE unit. On success it persists the
 *   validated outline AND enqueues the pages operation (idempotent by key, so a
 *   crash between persist and enqueue resumes cleanly).
 * - `story/pages:{book}:v{n}` — one PAGE_TEXT unit per page. Pages claim
 *   independently: one page's failure never blocks the others (D010). When the
 *   last page lands READY the story flips READY.
 * - `story/page:{pageKey}:r{attempt}` — a single user-requested rewrite
 *   (F-008 §8 / F-012 hook). Same pageKey overwrites (F-008 §14); the attempt
 *   suffix orders rewrites so a second rewrite is never deduped into the first.
 *
 * No story fallback is invented: an exhausted model path fails non-retryable and
 * the book waits for retry/signal, exactly like Path B never invents story text.
 */
export const STORY_OUTLINE_OP = "story/outline";
export const STORY_PAGES_OP = "story/pages";
export const STORY_PAGE_OP = "story/page";
export const OUTLINE_UNIT = "outline";
export const pageUnitKey = (pageNumber: number): string => `page:${pageNumber}`;
/** Retry budget we enqueue with: original + 2 automatic retries (matches F-007). */
export const STORY_MAX_ATTEMPTS = 3;
/** M1 has no Character Bible (F-005); the contract requires a bible version. */
export const BIBLE_VERSION_M1 = "bible:m1-none";
/** F-008 §10 age-band word caps, enforced by post-check (never prompt alone). */
const WORD_CAPS: Record<Story["readingLevel"], number> = { "0-3": 20, "4-6": 40, "7-9": 70 };

export type StoryUnitPayload =
  | {
      kind: "outline";
      bookId: string;
      storyVersion: number;
      conceptId: string;
      childProfileId: string;
      anonymousProjectId: string;
    }
  | {
      kind: "page";
      bookId: string;
      storyVersion: number;
      pageNumber: number;
      pageKey: string;
      childProfileId: string;
      anonymousProjectId: string;
      /**
       * The rewrite attempt this unit performs. Initial fan-out leaves it
       * undefined (any READY row under the key is a resume); a rewrite carries
       * its attempt so the unit only resumes a row at least that new — without
       * this a rewrite would complete instantly off the old READY row.
       */
      attempt?: number;
    };

export type StoryRunResult =
  | { kind: typeof STORY_OUTLINE_OP; storyVersion: number; pageCount: number }
  | { kind: typeof STORY_PAGES_OP; storyVersion: number; pageNumber: number; pageKey: string };

export interface StoryRunnerDeps {
  runtime: DurableExecutionRuntime;
  store: CreationStore;
  storyProvider: Pick<StoryProvider, "generateOutline" | "generatePageText" | "card">;
  moderation: ModerationProvider;
  events: EventSink;
  getFactsForStory: (input: { anonymousProjectId: string; childProfileId: string }) => Promise<Fact[]>;
  /** F-001 §8 owner guard — the transport has already resolved the browser token. */
  assertProjectAccess: (anonymousProjectId: string, projectId: string) => Promise<unknown>;
  now: () => string;
}

/** Canonical facts snapshot hash: the same eligible facts always name the same version. */
export function factsVersionFor(facts: Fact[]): string {
  const canonical = [...facts]
    .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))
    .map((fact) => ({ id: fact.id, type: fact.type, value: fact.value, locale: fact.locale, state: fact.state }));
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

/** F-008 §9 pageKey: sha256 over the canonical seed (seed construction is domain-tested). */
export function pageKeyFor(input: {
  bookId: string;
  conceptVersion: number;
  pageNumber: number;
  factsVersion: string;
  locale: string;
}): string {
  return createHash("sha256").update(pageKeySeed(input)).digest("hex");
}

export class StoryRunner {
  constructor(private readonly deps: StoryRunnerDeps) {}

  outlineKey(bookId: string, storyVersion: number): string {
    return `${STORY_OUTLINE_OP}:${bookId}:v${storyVersion}`;
  }

  pagesKey(bookId: string, storyVersion: number): string {
    return `${STORY_PAGES_OP}:${bookId}:v${storyVersion}`;
  }

  pageOpKey(pageKey: string, attempt: number): string {
    return `${STORY_PAGE_OP}:${pageKey}:r${attempt}`;
  }

  /**
   * F-008 §8 persist-flow entrypoint — enqueue the OUTLINE unit; the worker fans
   * out pages on outline success. Idempotent: a READY story at the current
   * factsVersion is a no-op returning the settled job.
   */
  async requestStory(input: { bookId: string; storyVersion?: number; anonymousProjectId: string }): Promise<JobView> {
    const storyVersion = input.storyVersion ?? 1;
    const prepared = await this.prepareStory(input.bookId, storyVersion, input.anonymousProjectId);
    const existing = await this.deps.store.getStory(input.bookId, storyVersion);
    if (existing?.status === "READY" && existing.factsVersion === prepared.factsVersion) {
      const settled = await this.deps.runtime.job(this.outlineKey(input.bookId, storyVersion));
      if (settled) return settled;
    }
    if (!existing) {
      await this.deps.store.saveStory({
        id: storyIdFor(input.bookId, storyVersion),
        bookId: input.bookId,
        storyVersion,
        conceptId: prepared.concept.id,
        locale: prepared.locale,
        readingLevel: prepared.readingLevel,
        factsVersion: prepared.factsVersion,
        status: "DRAFT",
        createdAt: this.deps.now()
      });
    }
    await this.deps.events.push({
      name: "story_generation_started",
      at: this.deps.now(),
      attributes: { bookId: input.bookId, storyVersion }
    });
    const request: EnqueueRequest = {
      operationKey: this.outlineKey(input.bookId, storyVersion),
      units: [
        {
          unitKey: OUTLINE_UNIT,
          maxAttempts: STORY_MAX_ATTEMPTS,
          payload: {
            kind: "outline",
            bookId: input.bookId,
            storyVersion,
            conceptId: prepared.concept.id,
            childProfileId: prepared.childProfileId,
            anonymousProjectId: input.anonymousProjectId
          } satisfies StoryUnitPayload
        }
      ]
    };
    return this.deps.runtime.enqueue(request);
  }

  /**
   * F-008 §8 single-page rewrite — enqueues one PAGE unit under a new attempt
   * key; the same pageKey overwrites on completion (F-008 §14).
   */
  async requestPageRegen(input: {
    bookId: string;
    storyVersion?: number;
    pageNumber: number;
    anonymousProjectId: string;
  }): Promise<JobView> {
    const storyVersion = input.storyVersion ?? 1;
    const prepared = await this.prepareStory(input.bookId, storyVersion, input.anonymousProjectId);
    const story = await this.deps.store.getStory(input.bookId, storyVersion);
    if (!story?.outline) {
      throw new ValidationError(`book ${input.bookId} has no story outline to rewrite from`);
    }
    const pageCount = story.outline.pageCount;
    if (!Number.isInteger(input.pageNumber) || input.pageNumber < 1 || input.pageNumber > pageCount) {
      throw new ValidationError(`page ${input.pageNumber} out of range 1..${pageCount}`);
    }
    const pageKey = pageKeyFor({
      bookId: input.bookId,
      conceptVersion: prepared.concept.conceptVersion,
      pageNumber: input.pageNumber,
      factsVersion: story.factsVersion,
      locale: story.locale
    });
    const attempt = ((await this.deps.store.getPage(pageKey))?.attemptCount ?? 0) + 1;
    await this.deps.events.push({
      name: "page_text_regenerated",
      at: this.deps.now(),
      attributes: { bookId: input.bookId, storyVersion, pageNumber: input.pageNumber, attempt }
    });
    return this.deps.runtime.enqueue({
      operationKey: this.pageOpKey(pageKey, attempt),
      units: [
        {
          unitKey: pageUnitKey(input.pageNumber),
          maxAttempts: STORY_MAX_ATTEMPTS,
          payload: {
            kind: "page",
            bookId: input.bookId,
            storyVersion,
            pageNumber: input.pageNumber,
            pageKey,
            childProfileId: prepared.childProfileId,
            anonymousProjectId: input.anonymousProjectId,
            attempt
          } satisfies StoryUnitPayload
        }
      ]
    });
  }

  /** Transport read side: story row + pages + both durable jobs in one call. */
  async storyStatus(
    bookId: string,
    storyVersion = 1
  ): Promise<{ story?: Story; pages: StoryPage[]; outlineJob?: JobView; pagesJob?: JobView }> {
    const story = await this.deps.store.getStory(bookId, storyVersion);
    const pages = story ? await this.deps.store.listPagesByStory(story.id) : [];
    const outlineJob = await this.deps.runtime.job(this.outlineKey(bookId, storyVersion));
    const pagesJob = await this.deps.runtime.job(this.pagesKey(bookId, storyVersion));
    return { ...(story ? { story } : {}), pages, ...(outlineJob ? { outlineJob } : {}), ...(pagesJob ? { pagesJob } : {}) };
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

  private async execute(
    claimed: ClaimedUnit
  ): Promise<{ ok: "ok"; output: StoryRunResult } | { ok: "fail"; failure: UnitFailure }> {
    const payload = claimed.payload as StoryUnitPayload;
    if (payload?.kind === "page") return this.executePage(claimed, payload);
    if (payload?.kind === "outline") return this.executeOutline(claimed, payload);
    return { ok: "fail", failure: { code: "UNKNOWN_UNIT", message: "story unit carries no kind", retryable: false } };
  }

  private async executeOutline(
    claimed: ClaimedUnit,
    payload: Extract<StoryUnitPayload, { kind: "outline" }>
  ): Promise<{ ok: "ok"; output: StoryRunResult } | { ok: "fail"; failure: UnitFailure }> {
    // Resume: the outline already landed (crash between persist and fan-out).
    // Re-enqueueing the pages operation is idempotent by key — never a duplicate.
    const resumed = await this.deps.store.getStory(payload.bookId, payload.storyVersion);
    if (resumed?.outline) {
      await this.enqueuePagesOp(resumed, payload.childProfileId, payload.anonymousProjectId);
      return { ok: "ok", output: { kind: STORY_OUTLINE_OP, storyVersion: payload.storyVersion, pageCount: resumed.outline.pageCount } };
    }

    const book = await this.deps.store.getBook(payload.bookId);
    if (!book) {
      return { ok: "fail", failure: { code: "BOOK_NOT_FOUND", message: `book ${payload.bookId} missing`, retryable: false } };
    }
    const concept = await this.selectedConcept(book, payload.bookId);
    if (!concept) {
      return { ok: "fail", failure: { code: "CONCEPT_NOT_SELECTED", message: `book ${payload.bookId} has no selected concept`, retryable: false } };
    }
    if (!book.projectId) {
      return { ok: "fail", failure: { code: "PROJECT_MISSING", message: `book ${payload.bookId} has no owning project`, retryable: false } };
    }
    try {
      await this.deps.assertProjectAccess(payload.anonymousProjectId, book.projectId);
    } catch (err) {
      return {
        ok: "fail",
        failure: { code: "PROJECT_ACCESS_DENIED", message: err instanceof Error ? err.message : String(err), retryable: false }
      };
    }

    const facts = await this.deps.getFactsForStory({ anonymousProjectId: payload.anonymousProjectId, childProfileId: payload.childProfileId });
    const profile = await this.deps.store.getProfile(payload.childProfileId);
    const locale = profile?.locale ?? "en-GB";
    const factsVersion = factsVersionFor(facts);
    const finalAttempt = claimed.attempts >= STORY_MAX_ATTEMPTS - 1;

    let outline: StoryOutlineResult | undefined;
    try {
      const raw: unknown = await this.deps.storyProvider.generateOutline({
        schemaVersion: "1",
        concept: { title: concept.title, pitch: concept.pitch },
        locale,
        facts: facts.map((fact) => `${fact.type}: ${JSON.stringify(fact.value)}`),
        policySetVersion: "for-little-ones/text/v1"
      });
      const parsed = parseContract(CONTRACT_NAMES.storyOutlineResult, StoryOutlineResultSchema, raw);
      if (parsed.ok && (await this.isOutlineAllowed(parsed.value, payload, profile?.displayName))) {
        outline = parsed.value;
      }
    } catch {
      outline = undefined;
    }

    if (!outline) {
      if (!finalAttempt) {
        return { ok: "fail", failure: { code: "STORY_OUTLINE_FAILED", message: "outline provider unavailable or invalid output", retryable: true } };
      }
      await this.deps.store.saveStory({
        id: storyIdFor(payload.bookId, payload.storyVersion),
        bookId: payload.bookId,
        storyVersion: payload.storyVersion,
        conceptId: payload.conceptId,
        locale,
        readingLevel: this.readingLevelFor(concept),
        factsVersion,
        status: "FAILED",
        createdAt: this.deps.now()
      });
      await this.deps.events.push({
        name: "outline_failed",
        at: this.deps.now(),
        attributes: { bookId: payload.bookId, storyVersion: payload.storyVersion, reason: "model-path-exhausted" }
      });
      return { ok: "fail", failure: { code: "STORY_OUTLINE_EXHAUSTED", message: "outline failed twice; no story invented", retryable: false } };
    }

    const story: Story = {
      ...(resumed ? { createdAt: resumed.createdAt } : { createdAt: this.deps.now() }),
      id: storyIdFor(payload.bookId, payload.storyVersion),
      bookId: payload.bookId,
      storyVersion: payload.storyVersion,
      conceptId: payload.conceptId,
      locale,
      readingLevel: this.readingLevelFor(concept),
      factsVersion,
      outline,
      status: "OUTLINE_READY"
    };
    await this.deps.store.saveStory(story);
    await this.createPendingPages(story, concept.conceptVersion);
    await this.enqueuePagesOp(story, payload.childProfileId, payload.anonymousProjectId);
    return { ok: "ok", output: { kind: STORY_OUTLINE_OP, storyVersion: payload.storyVersion, pageCount: outline.pageCount } };
  }

  private async executePage(
    claimed: ClaimedUnit,
    payload: Extract<StoryUnitPayload, { kind: "page" }>
  ): Promise<{ ok: "ok"; output: StoryRunResult } | { ok: "fail"; failure: UnitFailure }> {
    // Resume: this exact pageKey already landed at least this attempt (crash
    // after persist, or a duplicate claim). An older READY row never satisfies
    // a rewrite unit — that is new work, not a resume.
    const landed = await this.deps.store.getPage(payload.pageKey);
    if (landed?.status === "READY" && landed.attemptCount >= (payload.attempt ?? 0)) {
      return { ok: "ok", output: { kind: STORY_PAGES_OP, storyVersion: payload.storyVersion, pageNumber: payload.pageNumber, pageKey: payload.pageKey } };
    }

    const story = await this.deps.store.getStory(payload.bookId, payload.storyVersion);
    if (!story?.outline) {
      return { ok: "fail", failure: { code: "OUTLINE_MISSING", message: `story ${payload.bookId} v${payload.storyVersion} has no outline`, retryable: false } };
    }
    const book = await this.deps.store.getBook(payload.bookId);
    if (!book) {
      return { ok: "fail", failure: { code: "BOOK_NOT_FOUND", message: `book ${payload.bookId} missing`, retryable: false } };
    }
    if (!book.projectId) {
      return { ok: "fail", failure: { code: "PROJECT_MISSING", message: `book ${payload.bookId} has no owning project`, retryable: false } };
    }
    try {
      await this.deps.assertProjectAccess(payload.anonymousProjectId, book.projectId);
    } catch (err) {
      return {
        ok: "fail",
        failure: { code: "PROJECT_ACCESS_DENIED", message: err instanceof Error ? err.message : String(err), retryable: false }
      };
    }

    const profile = await this.deps.store.getProfile(payload.childProfileId);
    const priorLines = (await this.deps.store.listPagesByStory(story.id))
      .filter((page) => page.status === "READY" && page.pageNumber < payload.pageNumber)
      .map((page) => page.textBlocks[0]?.text ?? "")
      .filter((line) => line.length > 0)
      .map((line) => line.slice(0, 280));
    const finalAttempt = claimed.attempts >= STORY_MAX_ATTEMPTS - 1;

    let result: PageTextResult | undefined;
    try {
      const request: PageTextRequest = {
        schemaVersion: "1",
        pageKey: payload.pageKey,
        pageNumber: payload.pageNumber,
        bibleVersion: BIBLE_VERSION_M1,
        factsVersion: story.factsVersion,
        locale: story.locale,
        policySetVersion: "for-little-ones/text/v1",
        ...(profile?.displayName ? { heroName: profile.displayName } : {}),
        ...(story.outline.title ? { storyTitle: story.outline.title } : {}),
        ...(priorLines.length > 0 ? { priorLines } : {})
      };
      const raw: unknown = await this.deps.storyProvider.generatePageText(request);
      const parsed = parseContract(CONTRACT_NAMES.pageTextResult, PageTextResultSchema, raw);
      if (parsed.ok && (await this.isPageAllowed(parsed.value, payload, profile?.displayName))) {
        result = parsed.value;
      }
    } catch {
      result = undefined;
    }

    if (!result) {
      if (!finalAttempt) {
        return { ok: "fail", failure: { code: "PAGE_TEXT_FAILED", message: `page ${payload.pageNumber} provider unavailable or invalid output`, retryable: true } };
      }
      await this.deps.store.savePage({
        pageKey: payload.pageKey,
        storyId: story.id,
        bookId: payload.bookId,
        pageNumber: payload.pageNumber,
        textBlocks: [],
        status: "FAILED",
        attemptCount: (landed?.attemptCount ?? 0) + STORY_MAX_ATTEMPTS,
        createdAt: landed?.createdAt ?? this.deps.now()
      });
      await this.deps.events.push({
        name: "page_text_failed",
        at: this.deps.now(),
        attributes: { bookId: payload.bookId, storyVersion: payload.storyVersion, pageNumber: payload.pageNumber, reason: "model-path-exhausted" }
      });
      return { ok: "fail", failure: { code: "PAGE_TEXT_EXHAUSTED", message: `page ${payload.pageNumber} failed twice; siblings unaffected`, retryable: false } };
    }

    await this.deps.store.savePage({
      pageKey: payload.pageKey,
      storyId: story.id,
      bookId: payload.bookId,
      pageNumber: payload.pageNumber,
      textBlocks: result.textBlocks,
      ...(result.illustrationCue ? { illustrationCue: result.illustrationCue } : {}),
      status: "READY",
      attemptCount: (landed?.attemptCount ?? 0) + claimed.attempts + 1,
      createdAt: landed?.createdAt ?? this.deps.now()
    });

    const siblings = await this.deps.store.listPagesByStory(story.id);
    if (siblings.length >= story.outline.pageCount && siblings.every((page) => page.status === "READY")) {
      await this.deps.store.saveStory({ ...story, status: "READY" });
      await this.deps.events.push({
        name: "story_generated",
        at: this.deps.now(),
        attributes: { bookId: payload.bookId, storyVersion: payload.storyVersion, pages: siblings.length }
      });
    }
    return { ok: "ok", output: { kind: STORY_PAGES_OP, storyVersion: payload.storyVersion, pageNumber: payload.pageNumber, pageKey: payload.pageKey } };
  }

  /** Shared request-time guards: book + SELECTED concept + owning project + access. */
  private async prepareStory(
    bookId: string,
    storyVersion: number,
    anonymousProjectId: string
  ): Promise<{ book: Book; concept: StoryConcept; childProfileId: string; factsVersion: string; locale: string; readingLevel: Story["readingLevel"] }> {
    const book = await this.deps.store.getBook(bookId);
    if (!book) throw new BookNotFoundError(`book not found: ${bookId}`);
    const concept = await this.selectedConcept(book, bookId);
    if (!concept) throw new ValidationError(`book ${bookId} has no selected concept`);
    if (!book.projectId) throw new ValidationError(`book ${bookId} has no owning project`);
    await this.deps.assertProjectAccess(anonymousProjectId, book.projectId);
    const childProfileId = book.childProfileIds[0];
    if (!childProfileId) throw new ValidationError(`book ${bookId} has no child profile`);
    const facts = await this.deps.getFactsForStory({ anonymousProjectId, childProfileId });
    const profile = await this.deps.store.getProfile(childProfileId);
    return {
      book,
      concept,
      childProfileId,
      factsVersion: factsVersionFor(facts),
      locale: profile?.locale ?? "en-GB",
      readingLevel: this.readingLevelFor(concept)
    };
  }

  private async selectedConcept(book: Book, bookId: string): Promise<StoryConcept | undefined> {
    if (!book.selectedConceptId) return undefined;
    const concept = await this.deps.store.getConcept(book.selectedConceptId);
    return concept && concept.bookId === bookId && concept.status === "SELECTED" ? concept : undefined;
  }

  private readingLevelFor(concept: StoryConcept): Story["readingLevel"] {
    return isReadingLevel(concept.readingLevel) ? concept.readingLevel : "4-6";
  }

  private async enqueuePagesOp(story: Story, childProfileId: string, anonymousProjectId: string): Promise<void> {
    const pages: EnqueueRequest["units"] = [];
    for (let pageNumber = 1; pageNumber <= (story.outline?.pageCount ?? STORY_PAGE_COUNT); pageNumber += 1) {
      const conceptVersion = await this.conceptVersionOf(story);
      pages.push({
        unitKey: pageUnitKey(pageNumber),
        maxAttempts: STORY_MAX_ATTEMPTS,
        payload: {
          kind: "page",
          bookId: story.bookId,
          storyVersion: story.storyVersion,
          pageNumber,
          pageKey: pageKeyFor({
            bookId: story.bookId,
            conceptVersion,
            pageNumber,
            factsVersion: story.factsVersion,
            locale: story.locale
          }),
          childProfileId,
          anonymousProjectId
        } satisfies StoryUnitPayload
      });
    }
    // The requesting session travels on every unit exactly like the OUTLINE
    // payload: claim-time re-checks deny settled sessions non-retryably (D024).
    await this.deps.runtime.enqueue({ operationKey: this.pagesKey(story.bookId, story.storyVersion), units: pages });
  }

  private async createPendingPages(story: Story, conceptVersion: number): Promise<void> {
    for (let pageNumber = 1; pageNumber <= (story.outline?.pageCount ?? STORY_PAGE_COUNT); pageNumber += 1) {
      const pageKey = pageKeyFor({
        bookId: story.bookId,
        conceptVersion,
        pageNumber,
        factsVersion: story.factsVersion,
        locale: story.locale
      });
      if (!(await this.deps.store.getPage(pageKey))) {
        await this.deps.store.savePage({
          pageKey,
          storyId: story.id,
          bookId: story.bookId,
          pageNumber,
          textBlocks: [],
          status: "PENDING",
          attemptCount: 0,
          createdAt: this.deps.now()
        });
      }
    }
  }

  private async conceptVersionOf(story: Story): Promise<number> {
    const concept = await this.deps.store.getConcept(story.conceptId);
    return concept?.conceptVersion ?? 1;
  }

  /** Outline rail: contract-shaped acts/cast plus a whole-outline moderation screen. */
  private async isOutlineAllowed(outline: StoryOutlineResult, payload: Extract<StoryUnitPayload, { kind: "outline" }>, childDisplayName?: string): Promise<boolean> {
    if (outline.acts.length === 0 || outline.characters.length === 0) return false;
    if (outline.pageCount < 1 || outline.pageCount > 64) return false;
    const verdict = await this.deps.moderation.screen({
      contentType: "text",
      contentRef: `book:${payload.bookId}/outline`,
      content: `${outline.title} — ${outline.synopsis} — ${outline.acts.map((act) => act.summary).join(" ")}`,
      ...(childDisplayName ? { childDisplayName } : {}),
      policySetVersion: "for-little-ones/text/v1"
    });
    return verdict.verdict !== "BLOCK";
  }

  /**
   * Page rail (§7 exactness + §10 band caps + per-block moderation). A BLOCK
   * disqualifies the page; a FLAG is recorded as an event and never silently
   * dropped (D026 rule — closes the Path A silent-FLAG gap for new pages).
   */
  private async isPageAllowed(result: PageTextResult, payload: Extract<StoryUnitPayload, { kind: "page" }>, childDisplayName?: string): Promise<boolean> {
    if (result.textBlocks.length === 0 || result.textBlocks.some((block) => block.text.trim().length === 0)) return false;
    if (!result.illustrationCue || result.illustrationCue.trim().length === 0) return false;
    const story = await this.deps.store.getStory(payload.bookId, payload.storyVersion);
    const cap = WORD_CAPS[story?.readingLevel ?? "4-6"];
    const words = result.textBlocks.reduce((total, block) => total + block.text.split(/\s+/).filter(Boolean).length, 0);
    if (words > cap) return false;
    for (const block of result.textBlocks) {
      const verdict = await this.deps.moderation.screen({
        contentType: "text",
        contentRef: `book:${payload.bookId}/page:${payload.pageNumber}`,
        content: block.text,
        ...(childDisplayName ? { childDisplayName } : {}),
        policySetVersion: "for-little-ones/text/v1"
      });
      if (verdict.verdict === "BLOCK") return false;
      if (verdict.verdict === "FLAG") {
        await this.deps.events.push({
          name: "page_text_flagged",
          at: this.deps.now(),
          attributes: { bookId: payload.bookId, storyVersion: payload.storyVersion, pageNumber: payload.pageNumber, findings: verdict.findings.length }
        });
      }
    }
    return true;
  }
}
