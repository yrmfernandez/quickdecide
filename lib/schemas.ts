import { z } from "zod";
import { SLIDER_IDS } from "./sliders";

export const DECISION_MODES = ["serious", "funny", "instant"] as const;
export const MODEL_CHOICES = ["balanced", "fast", "strong"] as const;

export type DecisionMode = (typeof DECISION_MODES)[number];
export type ModelChoice = (typeof MODEL_CHOICES)[number];

function truncateText(value: string, max: number): string {
  if (value.length <= max) return value;
  const clipped = value.slice(0, max + 1);
  return (clipped.slice(0, clipped.lastIndexOf(" ")) || clipped.slice(0, max)).trim();
}

/**
 * VALIDATION PHILOSOPHY: never hard-fail on sloppy model output.
 * Long strings get truncated, out-of-range numbers get clamped, wrong-case
 * enums get normalized, and missing optionals get defaults. A Zod error
 * should only mean "the output was unusable", not "a label was 81 chars".
 */

const clampedScore = z.coerce
  .number()
  .catch(50)
  .transform((n) => (Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 50));

const shortText = (max: number) =>
  z
    .coerce.string()
    .catch("")
    .transform((s) => truncateText(s.trim(), max));

/** Brain 1 output: extracted choices + dynamic sliders + mobility check. */
export const ClassifierSchema = z.object({
  choices: z
    .array(z.coerce.string().min(1).transform((s) => truncateText(s.trim(), 80)))
    .min(2)
    .transform((arr) => {
      // Dedupe (case-insensitive) and cap at 8 for the deep pipeline.
      const seen = new Set<string>();
      return arr
        .filter((c) => {
          const key = c.toLowerCase();
          if (seen.has(key) || c.length === 0) return false;
          seen.add(key);
          return true;
        })
        .slice(0, 8);
    })
    .describe("The distinct options the user is deciding between, short labels (max 8)."),
  sliders: z
    .array(
      z.object({
        id: z.enum(SLIDER_IDS),
        label: shortText(48).describe(
          "A custom, highly relevant label for this slider based on the user's text."
        ),
        low: shortText(48).describe("Label for value 0 — must match the canonical LOW meaning."),
        high: shortText(48).describe("Label for value 100 — must match the canonical HIGH meaning."),
      })
    )
    .length(2)
    .describe(
      "Exactly two DISTINCT sliders most relevant to this decision, with labels dynamically customized to fit the context."
    ),
  requires_mobility_toggle: z
    .boolean()
    .catch(false)
    .describe(
      "True ONLY if the decision involves physically traveling, commuting, or leaving the house where walking vs. transit matters."
    ),
});

export type ClassifierResult = z.infer<typeof ClassifierSchema>;

const outcomeEnum = z
  .string()
  .catch("winner")
  .transform((v): "winner" | "tie" | "wildcard" => {
    const s = v.toLowerCase().trim();
    return s === "tie" || s === "wildcard" ? s : "winner";
  });

/** Brain 2 output: the dry, mathematical ruling. */
export const JudgeSchema = z.object({
  winner: shortText(80).describe("The winning choice, tie label, or wildcard suggestion."),
  outcomeType: outcomeEnum
    .describe(
      "winner = one provided option wins, tie = provided options are effectively equal, wildcard = the added wildcard suggestion wins."
    ),
  tiedChoices: z.array(z.coerce.string()).catch([]).default([]),
  wildcardSuggestion: shortText(80)
    .nullable()
    .catch(null)
    .default(null)
    .describe("The ONE extra option added by the judge when wildcard is enabled, else null."),
  scores: z
    .array(
      z.object({
        choice: shortText(80),
        score: clampedScore,
        note: shortText(200),
      })
    )
    .catch([])
    .describe("Score per choice with a terse justification note."),
  contextUsed: z
    .array(z.coerce.string())
    .catch([])
    .default([])
    .describe("Only external real-world facts used, e.g. weather or time of day."),
  reasoningUsed: z
    .array(z.coerce.string().transform((reason) => truncateText(reason, 260)))
    .catch([])
    .default([])
    .describe("One line per slider explaining how it weighed the scores, plus at most one extra tradeoff."),
});

export type JudgeResult = z.infer<typeof JudgeSchema>;

/** Full verdict returned to the client. */
export interface Verdict {
  winner: string;
  outcomeType: "winner" | "tie" | "wildcard";
  tiedChoices: string[];
  wildcardSuggestion: string | null;
  mode: DecisionMode;
  wildcardAllowed: boolean;
  witty: string;
  scores: JudgeResult["scores"];
  contextUsed: string[];
  reasoningUsed: string[];
}
