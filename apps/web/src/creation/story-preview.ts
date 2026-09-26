import {
  StoryPreviewResultSchema,
  type StoryPreviewRequest,
  type StoryPreviewResult
} from "@for-little-ones/contracts";

export interface CreationDraft {
  childName: string;
  age: string;
  world: string;
  favourites: string[];
  detail: string;
  dedication: string;
}

export const CREATION_STORAGE_KEY = "flo.creation-draft.v1";

export interface SavedCreation {
  draft: CreationDraft;
  story?: StoryPreviewResult;
  project?: StoryProjectCredential;
  concepts?: StoryConcept[];
  selectedConceptId?: string;
}

export interface StoryConcept {
  id: string;
  title: string;
  pitch: string;
  emotionalGoal: "confidence" | "bravery" | "kindness" | "friendship" | "belonging" | "bedtime calm" | "fun" | "curiosity";
  tone: string;
  readingLevel: "1-3" | "4-6" | "7-9" | "10-12";
  approximateLengthPages: 6;
  source: "model" | "fallback";
}

export interface StoryProjectCredential {
  projectId: string;
  revisionId: string;
  ownerToken: string;
  entitlement: "TEASER" | "PAID" | "REVOKED";
}

export interface StoryProjectSnapshot {
  entitlement: StoryProjectCredential["entitlement"];
  revisionId: string;
  revisionStatus: "DRAFT" | "GENERATING" | "TEASER_READY";
  story?: StoryPreviewResult;
  jobKind?: "CONCEPT_BUNDLE" | "STORY_PREVIEW";
  jobStatus?: "RUNNING" | "READY" | "FAILED";
  progress?: number;
  concepts?: StoryConcept[];
  selectedConceptId?: string;
}

export async function createStoryProject(draft: CreationDraft): Promise<StoryProjectCredential> {
  const response = await fetch("/api/create-project", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(draft)
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok || !isProjectCredential(body)) {
    const message = typeof body === "object" && body !== null && "error" in body && typeof body.error === "string"
      ? body.error : "Your draft could not be saved. Please try again.";
    throw new Error(message);
  }
  return body;
}

export async function loadStoryProject(project: StoryProjectCredential): Promise<StoryProjectSnapshot> {
  const response = await fetch("/api/project-status", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ projectId: project.projectId, ownerToken: project.ownerToken })
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error("Your saved story could not be restored just now.");
  const snapshot = parseStoryProjectSnapshot(body);
  if (!snapshot) throw new Error("Your saved story record was incomplete.");
  return snapshot;
}

export async function generateStoryConcepts(draft: CreationDraft, project: StoryProjectCredential): Promise<{ concepts: StoryConcept[]; servedFromFallback: boolean }> {
  const response = await fetch("/api/generate-concepts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      childName: draft.childName, age: Number(draft.age), world: draft.world,
      favourites: draft.favourites, detail: draft.detail,
      projectId: project.projectId, revisionId: project.revisionId, ownerToken: project.ownerToken
    })
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok || typeof body !== "object" || body === null) throw new Error("We couldn't find story ideas just now. Please try again.");
  const record = body as Record<string, unknown>;
  const concepts = parseStoryConcepts(record.concepts);
  if (!concepts) throw new Error("The story ideas were incomplete. Please try again.");
  return { concepts, servedFromFallback: record.servedFromFallback === true };
}

export async function selectStoryConcept(project: StoryProjectCredential, conceptId: string): Promise<void> {
  const response = await fetch("/api/select-concept", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ projectId: project.projectId, revisionId: project.revisionId, ownerToken: project.ownerToken, conceptId })
  });
  if (!response.ok) throw new Error("Your story choice could not be saved. Please try again.");
}

export async function generateStoryPreview(draft: CreationDraft, project: StoryProjectCredential, concept: StoryConcept): Promise<StoryPreviewResult> {
  const request = {
    schemaVersion: "1",
    childName: draft.childName,
    age: Number(draft.age),
    world: draft.world,
    favourites: draft.favourites,
    detail: draft.detail,
    dedication: draft.dedication,
    locale: "en-GB",
    projectId: project.projectId,
    revisionId: project.revisionId,
    ownerToken: project.ownerToken,
    selectedConcept: { id: concept.id, title: concept.title, pitch: concept.pitch, emotionalGoal: concept.emotionalGoal, tone: concept.tone }
  } satisfies StoryPreviewRequest & Pick<StoryProjectCredential, "projectId" | "revisionId" | "ownerToken"> & { selectedConcept: Pick<StoryConcept, "id" | "title" | "pitch" | "emotionalGoal" | "tone"> };
  const response = await fetch("/api/generate-story", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request)
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = typeof body === "object" && body !== null && "error" in body && typeof body.error === "string"
      ? body.error
      : "The story studio could not be reached. Please try again.";
    throw new Error(message);
  }
  const result = StoryPreviewResultSchema.safeParse(body);
  if (!result.success) throw new Error("The story preview was incomplete. Please try again.");
  return result.data;
}

export function loadSavedCreation(storage: Pick<Storage, "getItem">): SavedCreation | null {
  try {
    const raw = storage.getItem(CREATION_STORAGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<SavedCreation>;
    if (!isDraft(value.draft)) return null;
    const story = StoryPreviewResultSchema.safeParse(value.story);
    const project = isProjectCredential(value.project) ? value.project : undefined;
    const concepts = parseStoryConcepts(value.concepts);
    const selectedConceptId = typeof value.selectedConceptId === "string" && concepts?.some((concept) => concept.id === value.selectedConceptId) ? value.selectedConceptId : undefined;
    return {
      draft: value.draft,
      ...(story.success ? { story: story.data } : {}),
      ...(project ? { project } : {}),
      ...(concepts ? { concepts } : {}),
      ...(selectedConceptId ? { selectedConceptId } : {})
    };
  } catch {
    return null;
  }
}

export function parseStoryProjectSnapshot(value: unknown): StoryProjectSnapshot | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  if (!isEntitlement(record.entitlement) || typeof record.revision !== "object" || record.revision === null) return null;
  const revision = record.revision as Record<string, unknown>;
  if (typeof revision.revisionId !== "string" || !revision.revisionId.startsWith("revision_") || !isRevisionStatus(revision.status)) return null;
  // The creation service already shaped this for the entitlement, so a pre-payment
  // reader can only ever hold the teaser. A captured purchase receives the full story.
  const readable = revision.story ?? revision.teaser;
  const parsedStory = StoryPreviewResultSchema.safeParse(readable);
  if (revision.status === "TEASER_READY" && !parsedStory.success) return null;
  let jobStatus: StoryProjectSnapshot["jobStatus"];
  let jobKind: StoryProjectSnapshot["jobKind"];
  let progress: number | undefined;
  if (record.job !== null && record.job !== undefined) {
    if (typeof record.job !== "object") return null;
    const job = record.job as Record<string, unknown>;
    if (job.kind !== "CONCEPT_BUNDLE" && job.kind !== "STORY_PREVIEW") return null;
    if (job.status !== "RUNNING" && job.status !== "READY" && job.status !== "FAILED") return null;
    if (typeof job.progress !== "number" || !Number.isInteger(job.progress) || job.progress < 0 || job.progress > 100) return null;
    jobStatus = job.status;
    jobKind = job.kind;
    progress = job.progress;
  }
  const concepts = parseStoryConcepts(revision.concepts);
  return {
    entitlement: record.entitlement,
    revisionId: revision.revisionId,
    revisionStatus: revision.status,
    ...(parsedStory.success ? { story: parsedStory.data } : {}),
    ...(concepts ? { concepts } : {}),
    ...(typeof revision.selectedConceptId === "string" ? { selectedConceptId: revision.selectedConceptId } : {}),
    ...(jobKind && jobStatus && progress !== undefined ? { jobKind, jobStatus, progress } : {})
  };
}

export function parseStoryConcepts(value: unknown): StoryConcept[] | null {
  if (!Array.isArray(value) || value.length !== 3) return null;
  const concepts: StoryConcept[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) return null;
    const concept = item as Record<string, unknown>;
    if (typeof concept.id !== "string" || !concept.id.startsWith("concept_")
      || typeof concept.title !== "string" || !concept.title.trim() || concept.title.length > 60
      || typeof concept.pitch !== "string" || !concept.pitch.trim() || concept.pitch.length > 240
      || !isEmotionalGoal(concept.emotionalGoal) || typeof concept.tone !== "string"
      || !isReadingLevel(concept.readingLevel) || concept.approximateLengthPages !== 6
      || (concept.source !== "model" && concept.source !== "fallback")) return null;
    concepts.push(concept as unknown as StoryConcept);
  }
  return new Set(concepts.map((concept) => concept.title.toLocaleLowerCase("en-GB"))).size === 3 ? concepts : null;
}

function isEmotionalGoal(value: unknown): value is StoryConcept["emotionalGoal"] {
  return value === "confidence" || value === "bravery" || value === "kindness" || value === "friendship" || value === "belonging" || value === "bedtime calm" || value === "fun" || value === "curiosity";
}

function isReadingLevel(value: unknown): value is StoryConcept["readingLevel"] {
  return value === "1-3" || value === "4-6" || value === "7-9" || value === "10-12";
}

function isProjectCredential(value: unknown): value is StoryProjectCredential {
  if (typeof value !== "object" || value === null) return false;
  const project = value as Record<string, unknown>;
  return typeof project.projectId === "string" && project.projectId.startsWith("project_")
    && typeof project.revisionId === "string" && project.revisionId.startsWith("revision_")
    && typeof project.ownerToken === "string" && /^[a-f0-9]{64}$/i.test(project.ownerToken)
    && isEntitlement(project.entitlement);
}

function isEntitlement(value: unknown): value is StoryProjectCredential["entitlement"] {
  return value === "TEASER" || value === "PAID" || value === "REVOKED";
}

function isRevisionStatus(value: unknown): value is StoryProjectSnapshot["revisionStatus"] {
  return value === "DRAFT" || value === "GENERATING" || value === "TEASER_READY";
}

export function saveCreation(storage: Pick<Storage, "setItem">, value: SavedCreation): void {
  storage.setItem(CREATION_STORAGE_KEY, JSON.stringify(value));
}

function isDraft(value: unknown): value is CreationDraft {
  if (typeof value !== "object" || value === null) return false;
  const draft = value as Record<string, unknown>;
  return typeof draft.childName === "string"
    && typeof draft.age === "string"
    && typeof draft.world === "string"
    && Array.isArray(draft.favourites)
    && draft.favourites.every((item) => typeof item === "string")
    && typeof draft.detail === "string"
    && typeof draft.dedication === "string";
}
