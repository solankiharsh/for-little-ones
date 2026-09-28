import { describe, expect, it } from "vitest";
import {
  PolicyTextModerationProvider,
  TEXT_MODERATION_POLICY_SET
} from "../src/index";
import type { ModerationInput } from "../src/index";

const provider = new PolicyTextModerationProvider();

function text(content: string, extra: Partial<ModerationInput> = {}): ModerationInput {
  return {
    contentType: "text",
    contentRef: "book:book-1/concept:concept_1",
    content,
    policySetVersion: TEXT_MODERATION_POLICY_SET,
    ...extra
  };
}

/**
 * The F-007 §10 gate. `policies/safety/content-rules.md` is binding: moderation
 * screens the actual copy before it is persisted, and a severe finding stops the
 * unit rather than degrading to a pass.
 */
describe("text moderation: safety categories", () => {
  it("allows an ordinary warm concept pitch", async () => {
    const result = await provider.screen(text(
      "Milo and the Quiet Comet — Milo helps a shy comet find its way home before the sky goes dark."
    ));
    expect(result.verdict).toBe("ALLOW");
    expect(result.findings).toEqual([]);
  });

  it("blocks weapons and violence in a child-facing pitch", async () => {
    for (const content of [
      "Milo Finds the Gun — Milo picks up a gun left on the garden wall.",
      "The Last Fight — Milo watches the neighbour kill the cat in the alley."
    ]) {
      const result = await provider.screen(text(content));
      expect(result.verdict).toBe("BLOCK");
      expect(result.findings.join(" ")).toMatch(/HARD_BLOCK/);
    }
  });

  it("blocks self-harm and drugs in a child-facing pitch", async () => {
    for (const content of [
      "A Quiet End — Milo's story ends with suicide and nobody noticing.",
      "The Sleepy Medicine — Milo finds her mum's drugs in the cupboard."
    ]) {
      expect((await provider.screen(text(content))).verdict).toBe("BLOCK");
    }
  });

  it("flags peril intensity without blocking the journey", async () => {
    const result = await provider.screen(text("The Haunted Attic — Something terrifying waits in the dark upstairs."));
    expect(result.verdict).toBe("FLAG");
    expect(result.findings.join(" ")).toMatch(/SOFT_FLAG/);
  });

  it("flags branded and copyrighted characters", async () => {
    const result = await provider.screen(text("Milo and Elsa — Milo meets Elsa in the snow."));
    expect(result.verdict).toBe("FLAG");
    expect(result.findings.join(" ")).toMatch(/brand/);
  });

  it("does not block a word that merely contains a blocked stem", async () => {
    const result = await provider.screen(text(
      "Milo the Beginner — Milo is a skillful beginner baker and loves the smell of bread."
    ));
    expect(result.verdict).toBe("ALLOW");
  });
});

/**
 * F-007 §10 forbids the model restating the child's canonical facts as free prose.
 * A distress claim about the real child is a hard stop; any other real-world
 * assertion about them is recorded for review rather than silently shipped.
 */
describe("text moderation: claims about the real child", () => {
  it("blocks a pitch that invents hardship for the named child", async () => {
    const result = await provider.screen(
      text("Milo's Brave Little Wish — Milo's mum never comes home and Milo waits alone.", { childDisplayName: "Milo" })
    );
    expect(result.verdict).toBe("BLOCK");
    expect(result.findings.join(" ")).toMatch(/real_child_claim/);
  });

  it("flags a benign real-world assertion about the named child", async () => {
    const result = await provider.screen(
      text("The Smallest Door — Milo always carries a red scarf to school.", { childDisplayName: "Milo" })
    );
    expect(result.verdict).toBe("FLAG");
  });

  it("cannot judge the real child when no name is supplied", async () => {
    const result = await provider.screen(text("Milo's mum never comes home and Milo waits alone."));
    expect(result.verdict).toBe("ALLOW");
  });
});

describe("text moderation: fail closed", () => {
  it("refuses a policy set it does not implement", async () => {
    await expect(provider.screen(text("A gentle story about Milo.", { policySetVersion: "for-little-ones/text/v99" })))
      .rejects.toThrow(/policy set/i);
  });

  it("declares on its card that no child data leaves the process", () => {
    expect(provider.card.dataPolicy.childDataSent).toBe(false);
    expect(provider.card.dataPolicy.trainingUse).toBe("PROHIBITED");
    expect(provider.card.idempotency).toMatch(/content/i);
    expect(provider.card.dataPolicy.evidenceRef).toContain("safety/content-rules");
  });
});
