import type { CookieOptions } from "hono/utils/cookie";
import type { AnonymousSession } from "@for-little-ones/domain";

/** D024 §3: the browser token lives only in this cookie, never in a URL or a log. */
export const SESSION_COOKIE = "flo_session";
/** Anonymous, unclaimed sessions are swept in M6; the cookie outlives a long sitting. */
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
/** D024 §3 sliding renewal: re-issue once the session has been idle past this. */
export const SESSION_RENEW_AFTER_MS = 15 * 60 * 1000;

export function sessionCookieOptions(secure: boolean): CookieOptions {
  return {
    // HttpOnly: no script ever reads the token. SameSite=Lax: the baseline CSRF
    // posture D024 §3 accepts, which is why there is no separate CSRF token.
    httpOnly: true,
    sameSite: "Lax",
    secure,
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS
  };
}

/**
 * Whether this request should be handed a fresh cookie. Re-issuing the *same* token
 * (rather than rotating it) keeps two open tabs from invalidating each other, while
 * still sliding `lastSeenAt` forward so an active parent is never swept.
 */
export function shouldRenew(session: AnonymousSession, nowMs: number): boolean {
  const lastSeen = Date.parse(session.lastSeenAt);
  if (Number.isNaN(lastSeen)) return true;
  return nowMs - lastSeen > SESSION_RENEW_AFTER_MS;
}
