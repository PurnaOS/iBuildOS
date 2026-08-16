import { z } from "zod";

// FORMATS.md §2 — artifact identifier grammar.
// Final IDs: <PREFIX>-<NNNN> (uppercase prefix, hyphen, zero-padded 4-digit number,
// expanding past 9999 without re-padding existing IDs). Case-insensitive on input,
// canonical uppercase on write.
export const ID_PREFIXES = [
  "PB", "RQ", "EP", "ST", "TA", "BG", "SK", "DC", "AR", "RB", "PS", "DD", "NT",
  "TC", "SU", "TR", "CH", "RN", "RV", "CM", "DP", "RL", "MS", "SP", "US", "TM",
] as const;

export type IdPrefix = (typeof ID_PREFIXES)[number];

const prefixAlternation = ID_PREFIXES.join("|");

// Final ID: PREFIX-NNNN (4+ digits).
export const FINAL_ID_PATTERN = new RegExp(`^(${prefixAlternation})-\\d{4,}$`);

// Provisional ID (FORMATS §2, KB-010): <PREFIX>-p<4-char base36 nonce>-<n>.
// Valid only within the stream branch that minted it; finalized by the merge queue.
// Case-insensitive on the prefix (the nonce itself is conventionally lowercase).
export const PROVISIONAL_ID_PATTERN = new RegExp(
  `^(${prefixAlternation})-p[0-9a-z]{4}-\\d+$`,
  "i",
);

export const ArtifactIdSchema = z
  .string()
  .refine((v) => FINAL_ID_PATTERN.test(v.toUpperCase()), {
    message: "must match <PREFIX>-<NNNN> (see FORMATS.md §2)",
  })
  .transform((v) => v.toUpperCase());

export const ProvisionalIdSchema = z
  .string()
  .refine((v) => PROVISIONAL_ID_PATTERN.test(v), {
    message: "must match <prefix>-p<nonce>-<n> (see FORMATS.md §2)",
  });

// Either a landed final ID or a stream-local provisional one — links may point at
// either depending on where they're resolved from (KB-010 rule 1).
export const AnyIdSchema = z.union([ArtifactIdSchema, ProvisionalIdSchema]);

// Criterion reference: "ST-0042#AC-2" — an artifact ID plus an inline criterion id.
export const CRITERION_REF_PATTERN = new RegExp(
  `^(${prefixAlternation})-(?:\\d{4,}|p[0-9a-z]{4}-\\d+)#AC-\\d+$`,
  "i",
);

export const CriterionRefSchema = z.string().refine(
  (v) => CRITERION_REF_PATTERN.test(v),
  { message: "must match <ID>#AC-<n> (see FORMATS.md §2)" },
);

// A `links:` array entry may be a plain ID or a criterion reference.
export const LinkTargetSchema = z.union([AnyIdSchema, CriterionRefSchema]);

export function isFinalId(value: string): boolean {
  return FINAL_ID_PATTERN.test(value.toUpperCase());
}

export function isProvisionalId(value: string): boolean {
  return PROVISIONAL_ID_PATTERN.test(value);
}

export function idPrefix(value: string): IdPrefix | null {
  const match = /^([A-Za-z]{2})-/.exec(value);
  if (!match) return null;
  const prefix = match[1]!.toUpperCase();
  return (ID_PREFIXES as readonly string[]).includes(prefix)
    ? (prefix as IdPrefix)
    : null;
}
