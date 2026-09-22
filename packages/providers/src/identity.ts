import { assertEligibleForChildPhotos, type ProviderBoundary } from "./shared";

const childPhotoAccess: unique symbol = Symbol("childPhotoAccess");

/** Branded only after the provider's data policy is checked. */
export interface ChildPhotoInputs {
  sourcePhotoRefs: string[];
  readonly [childPhotoAccess]: true;
}

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
  deriveReference(inputs: ChildPhotoInputs): Promise<{ reference: IdentityReference; knownFacesCount: number }>;

  scoreLikeness(input: {
    reference: IdentityReference;
    candidateAssetRef: string;
  }): Promise<{ likenessScore01: number }>;
}

/** The application must use this gate before any child photo references reach a provider. */
export function deriveIdentityReference(
  provider: IdentityProvider,
  inputs: { sourcePhotoRefs: string[] }
): Promise<{ reference: IdentityReference; knownFacesCount: number }> {
  assertEligibleForChildPhotos(provider.card.dataPolicy);
  return provider.deriveReference({ ...inputs, [childPhotoAccess]: true });
}
