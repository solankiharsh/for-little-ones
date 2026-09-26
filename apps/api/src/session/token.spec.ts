import { describe, expect, it } from "vitest";
import { generateBrowserToken, hashBrowserToken } from "../../src/session/token";

describe("api: browser token (F-001)", () => {
  it("generates a URL-safe, unpredictable carrier", () => {
    const token = generateBrowserToken();
    expect(token.length).toBeGreaterThan(32);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/u);
    expect(generateBrowserToken()).not.toBe(token);
  });

  it("persists only a SHA-256 digest, never the raw token", async () => {
    const token = generateBrowserToken();
    const digest = await hashBrowserToken(token);
    expect(digest.startsWith("sha256:")).toBe(true);
    expect(digest).not.toContain(token);
    expect(await hashBrowserToken(token)).toBe(digest);
    expect(await hashBrowserToken(`${token}x`)).not.toBe(digest);
  });
});