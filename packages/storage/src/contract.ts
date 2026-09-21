/**
 * StorageContract — foundational boundary for private object storage. It encodes
 * the D017 invariants that hold regardless of upload topology (direct-to-storage
 * vs API-relay): private objects (no permanent public URLs), owner-scoped access,
 * signed expiring URLs only, and owner-enforced deletion.
 */
export interface StorageObject {
  bucket: string;
  key: string;
}

export interface PutObjectRequest {
  ownerId: string;
  object: StorageObject;
  contentType: string;
  contentLengthBytes: number;
}

export interface StoragePutResult {
  object: StorageObject;
  ownerId: string;
}

export interface SignedUrlRequest {
  ownerId: string;
  object: StorageObject;
  ttlSeconds: number;
}

export interface SignedUrlResult {
  url: string;
  /** Epoch millis when the signed URL stops working. */
  expiresAt: number;
}

export type OwnershipResult = { ok: true } | { ok: false; reason: "not-owner" | "not-found" };

/**
 * Implementation-independent. All reads/writes are owner-scoped: a caller may not
 * read or delete an object it does not own; expiring signed URLs are the only way
 * to hand bytes to a third party (e.g. a provider) and they are never permanent.
 */
export interface StorageContract {
  putObject(request: PutObjectRequest): Promise<StoragePutResult>;
  signedUrl(request: SignedUrlRequest): Promise<SignedUrlResult>;
  deleteObject(ownerId: string, object: StorageObject): Promise<OwnershipResult>;
}