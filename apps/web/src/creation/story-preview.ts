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
}

export async function generateStoryPreview(draft: CreationDraft): Promise<StoryPreviewResult> {
  const request: StoryPreviewRequest = {
    schemaVersion: "1",
    childName: draft.childName,
    age: Number(draft.age),
    world: draft.world,
    favourites: draft.favourites,
    detail: draft.detail,
    dedication: draft.dedication,
    locale: "en-GB"
  };
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
    return story.success ? { draft: value.draft, story: story.data } : { draft: value.draft };
  } catch {
    return null;
  }
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
