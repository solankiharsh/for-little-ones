import type { ModerationInput, ModerationProvider, ModerationResult } from "./moderation";
import type { ProviderCard } from "./shared";

/**
 * The F-007 §10 text safety gate. `policies/safety/content-rules.md` is the
 * binding source for these rules; the findings below are a direct, cited
 * encoding of that document.
 *
 * This is a deliberately *interim* control, not a qualified vendor moderation
 * service (recorded in D026). It is deterministic, in-process, and sends no
 * child data across any seam, so it satisfies the "no data leaves" constraint
 * that makes it acceptable pre-launch. Pattern matching cannot see paraphrase,
 * so the tiers are tuned to favour recording over wrongly blocking: only the
 * severe categories stop a unit.
 */
export const TEXT_MODERATION_POLICY_SET = "for-little-ones/text/v1";
const RULES_VERSION = "2026-09-27.1";

/** Stops a unit outright. Sourced from the "must never appear" tier of the content rules. */
const HARD_BLOCK_RULES = [
  { id: "violence", pattern: /\b(kill\w*|murder\w*|bloody|blood|stab\w*|strangl\w+|tortur\w+|shoot\w*|beat\s+(?:him|her|them)\s+up|corpse)\b/i },
  { id: "weapon", pattern: /\b(gun|weapon|knife|bomb|grenade|sword)\b/i },
  { id: "self_harm", pattern: /\b(suicid\w*|self[\s-]?harm\w*|hanged|overdose)\b/i },
  { id: "substance", pattern: /\b(drugs|cocaine|heroin|meth\w*|vape\w*|alcohol)\b/i },
  { id: "sexual_content", pattern: /\b(sex|porn\w*|erotic\w*|orgasm\w*|masturbat\w*)\b/i }
] as const;

/** Recorded for review, never blocks. The fear-intensity and brand tiers of the content rules. */
const SOFT_FLAG_RULES = [
  { id: "peril", pattern: /\b(terrifying|nightmare\w*|trapped|drowning|burning|scream\w*|haunted|devour\w*)\b/i },
  { id: "brand", pattern: /\b(disney|marvel|pokemon|elsa|lego|nintendo|barbie|dior)\b/i }
] as const;

/**
 * F-007 §10 forbids the model restating the child's canonical facts as free prose.
 * Invented hardship for the real child is a hard stop; any other real-world
 * assertion about them is recorded so a human can judge it later.
 */
const DISTRESS_CLAIM = /\b(never\s+(?:comes?|came|visits?)|(?:nobody|no\s+one)\s+(?:loves?|wants?|visits?)|abandoned|left\s+behind|all\s+alone|hates?)\b/i;
const REAL_CLAIM = /\b(always|never|every\s+day|lives\s+with|is\s+allergic|is\s+afraid\s+of|real\s+life)\b/i;

function matched(rule: { pattern: RegExp }, content: string): string | undefined {
  const match = rule.pattern.exec(content);
  if (!match) return undefined;
  return match[0].replace(/\s+/g, " ").trim().toLowerCase();
}

export class PolicyTextModerationProvider implements ModerationProvider {
  readonly card: ProviderCard = {
    dataPolicy: {
      verifiedAt: "2026-09-27",
      policyVersion: RULES_VERSION,
      childDataSent: false,
      childDataScope: [],
      retentionMode: "NONE",
      trainingUse: "PROHIBITED",
      deletionMechanism: "CONTRACTUAL_ZERO_RETENTION",
      region: "in-process",
      evidenceRef: "policies/safety/content-rules.md"
    },
    idempotency: "deterministic per contentRef + rules version; re-screening a ref is side-effect free",
    timeoutMs: 1000,
    retryPolicy: "no retries; deterministic in-process evaluation, so a throw is a real defect",
    costMetadata: "none; no external call is made and no cost is incurred"
  };

  async screen(input: ModerationInput): Promise<ModerationResult> {
    if (input.policySetVersion !== TEXT_MODERATION_POLICY_SET) {
      throw new Error(`moderation does not implement policy set ${input.policySetVersion}`);
    }
    if (input.contentType !== "text" || !input.content) {
      throw new Error(`moderation has no rule set for ${input.contentType} content`);
    }
    const findings: string[] = [];
    for (const rule of HARD_BLOCK_RULES) {
      const term = matched(rule, input.content);
      if (term) findings.push(`HARD_BLOCK:${rule.id}: matched "${term}"`);
    }
    for (const rule of SOFT_FLAG_RULES) {
      const term = matched(rule, input.content);
      if (term) findings.push(`SOFT_FLAG:${rule.id}: matched "${term}"`);
    }
    // Without the child's name there is nothing to attribute a claim to, so the
    // structural rule stays silent rather than guessing.
    if (input.childDisplayName && DISTRESS_CLAIM.test(input.content)) {
      findings.push(`HARD_BLOCK:real_child_claim: invents hardship for ${input.childDisplayName}`);
    } else if (input.childDisplayName && REAL_CLAIM.test(input.content)) {
      findings.push(`SOFT_FLAG:real_child_claim: asserts a real-world fact about ${input.childDisplayName}`);
    }
    const verdict = findings.some((finding) => finding.startsWith("HARD_BLOCK"))
      ? "BLOCK"
      : findings.length
        ? "FLAG"
        : "ALLOW";
    return { verdict, findings };
  }
}
