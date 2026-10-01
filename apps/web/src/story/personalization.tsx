import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { CreationDraft } from "../creation/story-preview";

/**
 * Central personalization state (§18). MARKETING MODE (nothing entered) uses
 * curated demo content; PERSONALIZED MODE (name or photos present) flows the
 * real child through every downstream section — copy, scenes and reader.
 * Components consume this; nobody keeps a private copy of the child.
 */

export const DEMO_NAME = "Maya";
export const STORY_COMPANIONS = ["Sibling", "Mum", "Dad", "Friend", "Pet"] as const;

/** Bridges into App-level overlays without prop drilling (App always lives). */
export const FLO_CREATE_EVENT = "flo:create-book";
export const FLO_SAMPLE_EVENT = "flo:sample-book";

export interface StoryCreationHandoff {
  draft?: CreationDraft;
  localPhotoCount: number;
}

export function requestCreation(handoff: StoryCreationHandoff) {
  window.dispatchEvent(new CustomEvent(FLO_CREATE_EVENT, { detail: handoff }));
}

export function requestSample(title: string) {
  window.dispatchEvent(new CustomEvent(FLO_SAMPLE_EVENT, { detail: { title } }));
}

export interface Personalization {
  mode: "marketing" | "personalized";
  /** Display name in use: the real child, or the demo stand-in. */
  heroName: string;
  /** True once the parent told us anything real. */
  hasRealChild: boolean;
  childName: string;
  childAge: string;
  /** Local object URLs only — photos never leave this browser in the story. */
  photos: string[];
  companions: string[];
  interests: string[];
  detail: string;
  dedication: string;
  selectedWorld: string | null;
  generated: boolean;
  setChildName(name: string): void;
  setChildAge(age: string): void;
  addPhotos(files: FileList | File[]): void;
  removePhoto(index: number): void;
  toggleCompanion(value: string): void;
  toggleInterest(value: string): void;
  setDetail(value: string): void;
  setDedication(value: string): void;
  selectWorld(id: string): void;
  markGenerated(): void;
  reset(): void;
}

const PersonalizationContext = createContext<Personalization | null>(null);

const MAX_PHOTOS = 5;

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

export function PersonalizationProvider({ children }: { children: ReactNode }) {
  const [childName, setChildName] = useState("");
  const [childAge, setChildAge] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [companions, setCompanions] = useState<string[]>([]);
  const [interests, setInterests] = useState<string[]>([]);
  const [detail, setDetail] = useState("");
  const [dedication, setDedication] = useState("");
  const [selectedWorld, setSelectedWorld] = useState<string | null>(null);
  const [generated, setGenerated] = useState(false);
  const photosRef = useRef(photos);
  photosRef.current = photos;

  useEffect(() => () => {
    for (const url of photosRef.current) URL.revokeObjectURL(url);
  }, []);

  const addPhotos = useCallback((files: FileList | File[]) => {
    const incoming = [...files].filter((file) => file.type.startsWith("image/")).slice(0, MAX_PHOTOS);
    if (incoming.length === 0) return;
    setPhotos((current) => {
      const room = Math.max(0, MAX_PHOTOS - current.length);
      return [...current, ...incoming.slice(0, room).map((file) => URL.createObjectURL(file))];
    });
  }, []);

  const removePhoto = useCallback((index: number) => {
    setPhotos((current) => {
      const doomed = current[index];
      if (doomed) URL.revokeObjectURL(doomed);
      return current.filter((_, i) => i !== index);
    });
  }, []);

  const value = useMemo<Personalization>(() => {
    const name = childName.trim();
    const personalized = name.length > 0 || photos.length > 0;
    return {
      mode: personalized ? "personalized" : "marketing",
      heroName: name || DEMO_NAME,
      hasRealChild: personalized,
      childName,
      childAge,
      photos,
      companions,
      interests,
      detail,
      dedication,
      selectedWorld,
      generated,
      setChildName,
      setChildAge,
      addPhotos,
      removePhoto,
      toggleCompanion: (v) => setCompanions((c) => toggle(c, v)),
      toggleInterest: (v) => setInterests((c) => toggle(c, v)),
      setDetail,
      setDedication,
      selectWorld: setSelectedWorld,
      markGenerated: () => setGenerated(true),
      reset: () => {
        setPhotos((current) => {
          for (const url of current) URL.revokeObjectURL(url);
          return [];
        });
        setChildName("");
        setChildAge("");
        setCompanions([]);
        setInterests([]);
        setDetail("");
        setDedication("");
        setSelectedWorld(null);
        setGenerated(false);
      }
    };
  }, [childName, childAge, photos, companions, interests, detail, dedication, selectedWorld, generated, addPhotos, removePhoto]);

  return <PersonalizationContext.Provider value={value}>{children}</PersonalizationContext.Provider>;
}

export function usePersonalization(): Personalization {
  const value = useContext(PersonalizationContext);
  if (!value) throw new Error("usePersonalization must be used inside PersonalizationProvider");
  return value;
}
