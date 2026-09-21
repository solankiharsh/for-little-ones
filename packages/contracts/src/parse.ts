import type { z } from "zod";

export interface ParseIssue {
  path: string;
  message: string;
}

export interface ParseFailure {
  ok: false;
  contract: string;
  issues: ParseIssue[];
}

export interface ParseSuccess<T> {
  ok: true;
  contract: string;
  value: T;
}

export type ParseResult<T> = ParseSuccess<T> | ParseFailure;

const toIssue = (issue: z.ZodIssue): ParseIssue => ({
  path: issue.path.map((p) => String(p)).join("."),
  message: issue.message
});

/**
 * GENERATION_ARCHITECTURE §3: parsing is done by the agreed runtime schema system.
 * Validation failure is explicit — a typed, structured error, never a silent fix.
 * Returns a discriminated union; it never throws on malformed input.
 */
export function parseContract<T>(
  contract: string,
  schema: z.ZodType<T>,
  data: unknown
): ParseResult<T> {
  const result = schema.safeParse(data);
  if (result.success) {
    return { ok: true, contract, value: result.data };
  }
  return {
    ok: false,
    contract,
    issues: result.error.issues.slice(0, 5).map(toIssue)
  };
}