import { describe, expect, it } from 'vitest';
import { sampleForWorld, sampleTitleForWorld } from '../story/samples';

describe('catalogue sample selection', () => {
  it('opens distinct stories and artwork for the chosen world', () => {
    const garden = sampleForWorld('The Secret Garden Map');
    const sea = sampleForWorld('The Lighthouse That Sang');
    expect(garden.story.title).toContain('Garden');
    expect(sea.story.title).toContain('Lighthouse');
    expect(garden.story.pages[0]?.text).not.toBe(sea.story.pages[0]?.text);
    expect(garden.cover.src).not.toBe(sea.cover.src);
    expect(garden.art[0]?.src).not.toBe(garden.art[1]?.src);
  });
  it('keeps catalogue samples separate from personalised generation', () => {
    expect(sampleForWorld('moon').childName).toBe('Aarav');
    expect(sampleForWorld('garden').childName).toBe('Mira');
    expect(sampleForWorld('lighthouse').childName).toBe('Leo');
  });
});

it('resolves every sample button title to its own complete illustrated book', () => {
  const ids = ['moon', 'garden', 'lighthouse', 'dinosaurs', 'space'];
  for (const id of ids) {
    const sample = sampleForWorld(sampleTitleForWorld(id));
    expect(sample.id).toBe(id);
    expect(sample.story.pages).toHaveLength(6);
    expect(new Set(sample.art.map((art) => art.src)).size).toBe(3);
  }
  expect(new Set(ids.map((id) => sampleForWorld(id).story.title)).size).toBe(5);
});
