import {
  ConflictError,
  ModerationBlockedError,
  OwnershipError,
  ResourceNotFoundError,
  UnauthenticatedError,
  ValidationError
} from "../errors";

/**
 * One place that decides a status code from a failure (D024 §4).
 *
 * Classification is by error *class*, never by message text, so rewording a message can
 * never silently downgrade a 403 into a 500. Untyped `Error`s fall through to 500: a
 * failure we did not anticipate is a bug to surface, not a client error to excuse.
 */
export interface ErrorBody {
  error: {
    status: number;
    /** Stable, machine-readable discriminator the client can branch on. */
    code: string;
    message: string;
  };
}

export function errorBody(status: number, code: string, message: string): ErrorBody {
  return { error: { status, code, message } };
}

export function classifyError(err: unknown): ErrorBody {
  if (err instanceof UnauthenticatedError) {
    return errorBody(401, "unauthenticated", err.message);
  }
  if (err instanceof OwnershipError) {
    return errorBody(403, "forbidden", err.message);
  }
  if (err instanceof ResourceNotFoundError) {
    return errorBody(404, "not_found", err.message);
  }
  if (err instanceof ConflictError) {
    return errorBody(409, "conflict", err.message);
  }
  if (err instanceof ModerationBlockedError) {
    // 422: the request was well-formed and the caller may retry with different wording.
    return errorBody(422, "moderation_blocked", err.message);
  }
  if (err instanceof ValidationError) {
    return errorBody(400, "validation_failed", err.message);
  }
  return errorBody(500, "internal_error", err instanceof Error ? err.message : "unknown failure");
}
