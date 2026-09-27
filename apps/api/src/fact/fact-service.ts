import {
  checkCustomFactQuota,
  generationEligibleFacts,
  getFactOptions,
  isLocale,
  validateFactValue,
  type Fact,
  type FactLocale,
  type FactOption,
  type FactState,
  type FactType,
  type FactValue,
  type ChildProfile,
  type Locale
} from "@for-little-ones/domain";
import type { CreationStore } from "../creation/creation-store";
import type { SessionStore } from "../session/session-service";

/**
 * F-006 fact writers + F-003's audited confirm/reject/remove, behind the
 * `FactService` seam. The rules that matter:
 *
 *  - `addFact` can only ever write `suggested`; `parentConfirmed` is reachable ONLY
 *    through `confirmFact` (F-006 §8 "client cannot set parentConfirmed without a
 *    confirmation action");
 *  - `getFactsForStory` is the sole generation-eligible read (F-006 §8, F-007 §7);
 *  - every confirm/reject appends to the profile's `confirmations[]` audit (F-003).
 */
export interface FactServiceDeps {
  store: CreationStore;
  sessions: Pick<SessionStore, "getProjectByOwner" | "addToProject">;
  now: () => string;
  newId: (prefix: string) => string;
}

export class FactService {
  constructor(private readonly deps: FactServiceDeps) {}

  /** F-006 §8 `GetFactOptions { type, locale }` — static, locale-bound enums. */
  async getFactOptions(input: { type: FactType; locale: string }): Promise<readonly FactOption[]> {
    if (!isLocale(input.locale)) return [];
    return getFactOptions(input.type, input.locale as Locale);
  }

  async addFact(input: {
    anonymousProjectId: string;
    childProfileId: string;
    /** F-006 idempotency: a retried add returns the fact the first call made. */
    factToken: string;
    type: FactType;
    value: FactValue;
    locale: FactLocale;
    /** Only `aiSuggested` is accepted from a sanctioned job; clients send nothing. */
    source?: Fact["source"];
    /** Present only so the service can REJECT a client trying to self-confirm. */
    state?: FactState;
  }): Promise<Fact> {
    const profile = await this.requireOwnedProfile(input.anonymousProjectId, input.childProfileId);

    if (input.state !== undefined && input.state !== "suggested") {
      throw new Error(`a client cannot write fact state ${input.state}; parentConfirmed requires the confirm verb (F-006 §8)`);
    }
    const issues = validateFactValue({ type: input.type, value: input.value }, { relationshipIds: profile.relationshipIds ?? [] });
    if (issues.length > 0) throw new Error(`invalid fact: ${issues.join("; ")}`);

    const existingId = await this.deps.store.findFactByToken(input.factToken);
    if (existingId) {
      const existing = await this.deps.store.getFact(existingId);
      if (existing) return existing;
    }

    if (input.type === "customFact") {
      const custom = (await this.deps.store.listFactsByProfile(profile.id)).filter((fact) => fact.type === "customFact");
      const quota = checkCustomFactQuota(custom.length);
      if (quota.length > 0) throw new Error(quota.join("; "));
    }

    const fact: Fact = {
      id: this.deps.newId("fact"),
      childProfileId: profile.id,
      type: input.type,
      value: input.value,
      locale: input.locale,
      source: input.source ?? "parentTyped",
      state: "suggested",
      createdAt: this.deps.now(),
      storyUsage: [],
      factToken: input.factToken
    };
    await this.deps.store.saveFact(fact);
    // A newly added fact is always `suggested` until the parent confirms it, so it is
    // parked in `suggestedFactIds`. `factIds` is the generation-eligible bucket, and
    // only `confirmFact` may write there.
    await this.attachToSuggestedBucket(profile.id, fact.id);
    return fact;
  }

  /** F-003/F-006 `ConfirmFact` — the only writer that reaches `parentConfirmed`. */
  async confirmFact(input: { anonymousProjectId: string; factId: string }): Promise<Fact> {
    const fact = await this.requireOwnedFact(input.anonymousProjectId, input.factId);
    if (fact.state === "parentConfirmed") return fact;
    if (fact.state === "rejected") throw new Error(`fact ${fact.id} was rejected; add it again to ask once more`);

    const now = this.deps.now();
    const confirmed: Fact = {
      ...fact,
      state: "parentConfirmed",
      confirmedBy: { sessionOwnerId: input.anonymousProjectId, recordedAt: now }
    };
    await this.deps.store.saveFact(confirmed);
    await this.audit(fact.childProfileId, `I confirmed this fact: ${fact.id}`);
    await this.moveBetweenProfileBuckets(fact.childProfileId, fact.id, "confirm");
    return confirmed;
  }

  /** F-006 `RejectFact` — the parent's explicit no; never auto-re-asked. */
  async rejectFact(input: { anonymousProjectId: string; factId: string }): Promise<Fact> {
    const fact = await this.requireOwnedFact(input.anonymousProjectId, input.factId);
    if (fact.state === "rejected") return fact;
    const rejected: Fact = { ...fact, state: "rejected" };
    await this.deps.store.saveFact(rejected);
    await this.audit(fact.childProfileId, `I rejected this fact: ${fact.id}`);
    await this.moveBetweenProfileBuckets(fact.childProfileId, fact.id, "reject");
    return rejected;
  }

  /**
   * F-003 `RemoveFact`: the fact leaves every read path and its value is scrubbed,
   * but the row is retained so the story-usage audit survives (F-025 owns deletion).
   */
  async removeFact(input: { anonymousProjectId: string; factId: string }): Promise<void> {
    const fact = await this.requireOwnedFact(input.anonymousProjectId, input.factId);
    await this.deps.store.removeFact(fact.id);
    await this.audit(fact.childProfileId, `I removed this fact: ${fact.id}`);
    await this.detachFromProfile(fact.childProfileId, fact.id);
  }

  /** F-006 §8 `GetFactsForStory` — the ONLY generation-eligible read path. */
  async getFactsForStory(input: { anonymousProjectId: string; childProfileId: string }): Promise<Fact[]> {
    await this.requireOwnedProfile(input.anonymousProjectId, input.childProfileId);
    return generationEligibleFacts(await this.deps.store.listFactsByProfile(input.childProfileId));
  }

  async listFacts(input: { anonymousProjectId: string; childProfileId: string }): Promise<Fact[]> {
    await this.requireOwnedProfile(input.anonymousProjectId, input.childProfileId);
    return this.deps.store.listFactsByProfile(input.childProfileId);
  }

  private async requireOwnedProfile(anonymousProjectId: string, childProfileId: string) {
    const profile = await this.deps.store.getProfile(childProfileId);
    if (!profile) throw new FactNotFoundError(`child profile not found: ${childProfileId}`);
    const project = await this.deps.sessions.getProjectByOwner(anonymousProjectId);
    if (!project?.childProfileIds.includes(childProfileId)) {
      throw new FactForbiddenError(`session ${anonymousProjectId} does not own profile ${childProfileId}`);
    }
    return profile;
  }

  private async requireOwnedFact(anonymousProjectId: string, factId: string): Promise<Fact> {
    const fact = await this.deps.store.getFact(factId);
    if (!fact) throw new FactNotFoundError(`fact not found: ${factId}`);
    await this.requireOwnedProfile(anonymousProjectId, fact.childProfileId);
    return fact;
  }

  private async attachToSuggestedBucket(profileId: string, factId: string): Promise<void> {
    const profile = await this.deps.store.getProfile(profileId);
    if (!profile) return;
    const current = profile.suggestedFactIds ?? [];
    if (current.includes(factId)) return;
    const next: Fact["id"][] = [...current, factId];
    await this.deps.store.saveProfile({ ...profile, suggestedFactIds: next, revision: (profile.revision ?? 0) + 1 });
  }

  /** A confirmed fact belongs in `factIds`; a rejected/suggested one in `suggestedFactIds`. */
  private async moveBetweenProfileBuckets(profileId: string, factId: string, move: "confirm" | "reject"): Promise<void> {
    const profile = await this.deps.store.getProfile(profileId);
    if (!profile) return;
    const factIds = (profile.factIds ?? []).filter((id) => id !== factId);
    const suggested = new Set(profile.suggestedFactIds ?? []);
    if (move === "confirm") {
      factIds.push(factId);
      suggested.delete(factId);
    } else {
      suggested.add(factId);
    }
    await this.deps.store.saveProfile({
      ...profile,
      factIds,
      ...(suggested.size > 0 ? { suggestedFactIds: [...suggested] } : { suggestedFactIds: [] }),
      revision: (profile.revision ?? 0) + 1
    });
  }

  private async detachFromProfile(profileId: string, factId: string): Promise<void> {
    const profile = await this.deps.store.getProfile(profileId);
    if (!profile) return;
    await this.deps.store.saveProfile({
      ...profile,
      factIds: (profile.factIds ?? []).filter((id) => id !== factId),
      suggestedFactIds: (profile.suggestedFactIds ?? []).filter((id) => id !== factId),
      revision: (profile.revision ?? 0) + 1
    });
  }

  private async audit(profileId: string, entry: string): Promise<void> {
    const profile = await this.deps.store.getProfile(profileId);
    if (!profile) return;
    const confirmations = profile.confirmations ?? [];
    if (confirmations.includes(entry)) return;
    await this.deps.store.saveProfile({
      ...profile,
      confirmations: [...confirmations, entry],
      revision: (profile.revision ?? 0) + 1
    });
  }

  }

export class FactNotFoundError extends Error {}
export class FactForbiddenError extends Error {}
