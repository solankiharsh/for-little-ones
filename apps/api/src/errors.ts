/**
 * Transport-agnostic failure types (D024 §4).
 *
 * The services and the HTTP layer both depend on these, so status classification is a
 * property of *what failed*, decided once at the throw site — never inferred from an
 * error message in the transport. That keeps "403 because this is an ownership
 * violation" honest if a message is ever reworded.
 *
 * Names avoid the lib.dom globals (`NotFoundError`, `ForbiddenError`...) so an import
 * here can never be shadowed by, or shadow, a browser type.
 */

/** The addressed resource does not exist, or does not exist *for this caller*. */
export class ResourceNotFoundError extends Error {}
/** Cross-session access: the session is real, the resource is not its own. */
export class OwnershipError extends Error {}
/** No resolvable `flo_session` cookie. */
export class UnauthenticatedError extends Error {}
/** The request body/query failed validation before any state was touched. */
export class ValidationError extends Error {}
/** A write lost an optimistic-lock race, or a bounded budget is spent. */
export class ConflictError extends Error {}
/** A safety rail refused the content itself, not the request shape. */
export class ModerationBlockedError extends Error {}
