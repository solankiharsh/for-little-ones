export interface PersonalFact {
  key: string;
  value: string;
  immutable: boolean;
}

/**
 * Parent/guardian consent required before a profile can be stored against an
 * account (F-003 §12, guide §7). Draft-session profiles are temp and auto-purged
 * under the F-025 schedule.
 */
export interface ProfileConsent {
  parentConfirmed: boolean;
  recordedAt?: string;
  /** Product-facing identity of the adult giving consent (never audio/photo). */
  givenBy?: string;
  sessionOwnerId?: string;
}

export type ChildProfileStatus = "draft" | "active" | "archived";

/**
 * Canonical ChildProfile (F-003; guide §3). Facts the AI derives are NEVER stored as
 * confirmed facts — they live in the `suggested` bucket or the Character Bible
 * (F-005) until a human confirms them (spec §2/§11/§25).
 *
 * The legacy `facts: PersonalFact[]` capture shape (M0 rails) is retained for the
 * reader/demo fixtures; the canonical typed facts (F-006) are the `Fact` entities
 * referenced by `factIds`.
 */
export interface ChildProfile {
  id: string;
  name: string;
  displayName: string;
  /** ISO date string (YYYY-MM-DD). No visual reference photos in M1. */
  dateOfBirth: string;
  pronouns: string;
  locale: string;
  interests: string[];
  facts: PersonalFact[];
  consent: {
    grantedAt: string;
    retentionClass: "default";
  };
  retentionClass: "default" | "short";
  status?: ChildProfileStatus;
  /** F-003: canonical typed facts (F-006), parent-confirmed only when confirmed. */
  factIds?: string[];
  /** F-003: facts awaiting parent confirm/remove; excluded from generation. */
  suggestedFactIds?: string[];
  /** F-003: refs to PhotoReference rows (F-004). Empty in M1. */
  photoReferenceIds?: string[];
  /** F-003: refs to Relationship rows (guide §3). */
  relationshipIds?: string[];
  /** F-003: audit of fact confirmations ("I confirmed this fact"). */
  confirmations?: string[];
  consentRecord?: ProfileConsent;
}

/** F-003: age is derived at read time from DOB, never frozen at capture. */
export function ageYearsOn(dateOfBirth: string, today: string): number | undefined {
  const birth = new Date(`${dateOfBirth}T00:00:00Z`);
  const now = new Date(`${today}T00:00:00Z`);
  if (Number.isNaN(birth.getTime()) || birth >= now) return undefined;
  let years = now.getUTCFullYear() - birth.getUTCFullYear();
  const birthdayPassed =
    now.getUTCMonth() > birth.getUTCMonth() ||
    (now.getUTCMonth() === birth.getUTCMonth() && now.getUTCDate() >= birth.getUTCDate());
  if (!birthdayPassed) years -= 1;
  return years;
}