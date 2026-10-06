import { describe, expect, it } from 'vitest';
import { sampleForWorld } from '../story/samples';

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
