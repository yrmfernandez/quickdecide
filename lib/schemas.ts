import { z } from "zod";
import { SLIDER_IDS } from "./sliders";

/** Brain 1 output: extracted choices + two context-appropriate sliders. */
export const ClassifierSchema = z.object({
  choices: z
    .array(z.string().min(1).max(80))
    .min(2)
    .max(6)
    .describe("The distinct options the user is deciding between, short labels."),
  sliders: z
    .array(z.enum(SLIDER_IDS))
    .length(2)
    .describe("Exactly two DISTINCT slider ids most relevant to this decision."),
});

export type ClassifierResult = z.infer<typeof ClassifierSchema>;

/** Brain 2 output: the dry, mathematical ruling. */
export const JudgeSchema = z.object({
  winner: z.string().describe("The single winning choice, verbatim from the list."),
  scores: z
    .array(
      z.object({
        choice: z.string(),
        score: z.number().min(0).max(100),
        note: z.string().max(140),
      })
    )
    .describe("Score per choice with a terse justification note."),
  contextUsed: z
    .array(z.string())
    .describe("Real-world facts used, e.g. weather or time of day."),
});

export type JudgeResult = z.infer<typeof JudgeSchema>;

/** Full verdict returned to the client. */
export interface Verdict {
  winner: string;
  witty: string;
  scores: JudgeResult["scores"];
  contextUsed: string[];
}
