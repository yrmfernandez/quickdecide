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

/** Brain 1 output: extracted choices + dynamic sliders + mobility check. */
export const ClassifierSchema = z.object({
  choices: z
    .array(z.string().min(1).max(80))
    .min(2)
    .max(6)
    .describe("The distinct options the user is deciding between, short labels."),
  sliders: z
    .array(
      z.object({
        id: z.enum(SLIDER_IDS),
        label: z.string().min(1).max(48).describe("A custom, highly relevant label for this slider based on the user's text."),
        low: z.string().min(1).max(48).describe("Witty label for value 0"),
        high: z.string().min(1).max(48).describe("Witty label for value 100"),
      })
    )
    .length(2)
    .describe("Exactly two DISTINCT sliders most relevant to this decision, with labels dynamically customized to fit the context."),
  requires_mobility_toggle: z
    .boolean()
    .describe("True ONLY if the decision involves physically traveling, commuting, or leaving the house where walking vs. transit matters."),
});

export type ClassifierResult = z.infer<typeof ClassifierSchema>;

/** Brain 2 output: the dry, mathematical ruling. */
export const JudgeSchema = z.object({
  winner: z.string().describe("The winning choice, tie label, or wildcard suggestion."),
  outcomeType: z
    .enum(["winner", "tie", "wildcard"])
    .default("winner")
    .describe("winner = one provided option wins, tie = provided options are effectively equal, wildcard = a better outside suggestion."),
  tiedChoices: z.array(z.string()).default([]).describe("Only filled when outcomeType is tie."),
  scores: z
    .array(
      z.object({
        choice: z.string(),
        score: z.number().min(0).max(100),
        note: z.string().transform((note) => truncateText(note, 140)),
      })
    )
    .describe("Score per choice with a terse justification note."),
  contextUsed: z
    .array(z.string())
    .default([])
    .describe("Only external real-world facts used, e.g. weather or time of day. Do not include slider reasoning here."),
  reasoningUsed: z
    .array(z.string().transform((reason) => truncateText(reason, 220)))
    .default([])
    .describe("Internal decision reasons, including slider effects and tradeoffs."),
});

export type JudgeResult = z.infer<typeof JudgeSchema>;

/** Full verdict returned to the client. */
export interface Verdict {
  winner: string;
  outcomeType: "winner" | "tie" | "wildcard";
  tiedChoices: string[];
  mode: DecisionMode;
  wildcardAllowed: boolean;
  witty: string;
  scores: JudgeResult["scores"];
  contextUsed: string[];
  reasoningUsed: string[];
}
