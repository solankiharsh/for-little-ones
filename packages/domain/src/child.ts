export interface PersonalFact {
  key: string;
  value: string;
  immutable: boolean;
}

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
}