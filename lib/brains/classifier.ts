import { generateObject } from "ai";
import { groq } from "@ai-sdk/groq";
import { ClassifierSchema, type ClassifierResult } from "../schemas";
import { SLIDER_META, SLIDER_IDS } from "../sliders";

/**
 * Brain 1 — The Classifier (Llama-3.1-8B, ultra-fast).
 *
 * Reads the raw brain dump and, via strict Zod structured output:
 *   1. extracts the choices into a clean array
 *   2. selects exactly two context-appropriate sliders from the master enum
 *
 * The schema's enum constraint makes hallucinated sliders impossible.
 */
export async function classify(rawText: string): Promise<ClassifierResult> {
  const sliderCatalog = SLIDER_IDS.map(
    (id) => `- ${id}: "${SLIDER_META[id].label}" (${SLIDER_META[id].judgeHint})`
  ).join("\n");

  const { object } = await generateObject({
    model: groq("llama-3.1-8b-instant"),
    schema: ClassifierSchema,
    system: `You extract decision options from messy human text and pick relevant UI sliders.
Rules:
- Choices must be short labels (2-5 words), preserving the user's own wording where possible.
- Pick exactly TWO DIFFERENT sliders from this catalog, choosing the two dimensions most in tension for THIS decision:
${sliderCatalog}`,
    prompt: rawText,
  });

  // Belt-and-suspenders: dedupe sliders if the model repeated one.
  if (object.sliders[0] === object.sliders[1]) {
    const fallback = SLIDER_IDS.find((id) => id !== object.sliders[0])!;
    object.sliders[1] = fallback;
  }

  return object;
}
