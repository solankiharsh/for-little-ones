/**
 * Mirrors `policies/MANIFEST.md`: resolved policy-set ids, versions and the
 * ordered file lists used for hashing. The policy *contents* live in `/policies`;
 * this package is the machine-readable manifest of what those files are.
 */
export const POLICY_SET_IDS = ["text.v1", "illustration.v1", "qa.v1"] as const;
export type PolicySetId = (typeof POLICY_SET_IDS)[number];

export const POLICY_SET_VERSION = 1;

export const POLICY_SET_FILES: Record<PolicySetId, readonly string[]> = {
  "text.v1": [
    "age/reading-age.md",
    "story/story-tone.md",
    "localisation/en-gb-en-us.md"
  ],
  "illustration.v1": [
    "age/reading-age.md",
    "illustration/illustration-style.md",
    "localisation/en-gb-en-us.md",
    "safety/content-rules.md"
  ],
  "qa.v1": [
    "safety/content-rules.md",
    "illustration/illustration-style.md"
  ]
};

export interface ResolvedPolicySet {
  policySetId: PolicySetId;
  version: number;
  files: readonly string[];
}

export function resolvePolicySet(id: PolicySetId): ResolvedPolicySet {
  return { policySetId: id, version: POLICY_SET_VERSION, files: POLICY_SET_FILES[id] };
}