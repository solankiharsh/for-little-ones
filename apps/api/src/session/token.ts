/**
 * F-001 browser token — random carrier with a digest at rest (AGENTS guide §7: the
 * raw token is the only thing the browser holds; the durable owner key is the
 * `anonymousProjectId`, so a lost token stays recoverable via the M6 email claim).
 */

const TOKEN_BYTES = 32;

export function generateBrowserToken(): string {
  const bytes = new Uint8Array(TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

/** Raw token must never be logged or persisted; always store its SHA-256 digest only. */
export async function hashBrowserToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return `sha256:${bytesToHex(new Uint8Array(digest))}`;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}