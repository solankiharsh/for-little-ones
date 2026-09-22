/**
 * Deterministic seeded PRNG + string hash — the mock's only source of "randomness",
 * so every run reproduces identically (the experiment's reproducibility claim).
 */
export function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededRng(key: string): () => number {
  return mulberry32(fnv1a(key));
}

export function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

/** Deterministic gaussian-ish sample: sum of 3 uniforms, mean 0, sigma ~ sqrt(3/36). */
export function seededNormal(rng: () => number): number {
  return (rng() + rng() + rng() - 1.5) / 1.5;
}

/** Deterministic gaussian variance, per [0,1] scale. */
export function seededGaussian(rng: () => number, sigma: number): number {
  return seededNormal(rng) * sigma;
}