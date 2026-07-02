import { generateObject, generateText, type LanguageModel } from "ai";
import type { z } from "zod";

/**
 * generateObject, but resilient to providers/models that reject strict
 * JSON-schema response mode (some Groq models do). Falls back to plain text
 * generation + manual JSON extraction, still validated by the same Zod schema.
 */
export async function generateObjectSafe<T>(opts: {
  model: LanguageModel;
  schema: z.ZodType<T>;
  system: string;
  prompt: string;
  /** Extra shape hint appended to the system prompt on the fallback path. */
  shapeHint: string;
}): Promise<T> {
  try {
    const { object } = await generateObject({
      model: opts.model,
      schema: opts.schema,
      system: opts.system,
      prompt: opts.prompt,
    });
    return object;
  } catch {
    const { text } = await generateText({
      model: opts.model,
      system:
        opts.system +
        `\n\nRespond with ONLY a raw JSON object — no markdown fences, no commentary. Shape:\n${opts.shapeHint}`,
      prompt: opts.prompt,
    });
    const cleaned = text
      .trim()
      .replace(/^```(?:json)?/i, "")
      .replace(/```$/, "")
      .trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    return opts.schema.parse(JSON.parse(match ? match[0] : cleaned));
  }
}
