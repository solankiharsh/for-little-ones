import type { ProviderBoundary } from "./shared";

/**
 * IdentityReference — a reusable, provider-native private reference to a child's
 * likeness (F-005). It is a private reference id, never photo bytes and never a
 * public URL (GENERATION_ARCHITECTURE §12).
 */
export interface IdentityReference {
  providerId: string;
  referenceId: string;
  kind: "private-enduring-reference";
}

export interface IdentityProvider extends ProviderBoundary {
  deriveReference(inputs: {
    sourcePhotoRefs: string[];
  }): Promise<{ reference: IdentityReference; knownFacesCount: number }>;

  scoreLikeness(input: {
    reference: IdentityReference;
    candidateAssetRef: string;
  }): Promise<{ likenessScore01: number }>;
}