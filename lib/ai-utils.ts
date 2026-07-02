import { generateText, type LanguageModel } from "ai";
import type { z } from "zod";

/**
 * Structured output for providers/models that reject strict JSON-schema
 * response mode (Groq's Llama models do not support `json_schema`).
 *
 * Strategy: plain text generation with an explicit shape instruction,
 * then JSON extraction + Zod validation. Retries once on a parse failure.
 */
export async function generateObjectSafe<T>(opts: {
  model: LanguageModel;
  schema: z.ZodType<T>;
  system: string;
  prompt: string;
  /** Shape hint appended to the system prompt, e.g. `{"winner": "..."}` */
  shapeHint: string;
}): Promise<T> {
  const system =
    opts.system +
    `\n\nCRITICAL OUTPUT RULE: Respond with ONLY a raw JSON object — no markdown fences, no commentary, no preamble. Exact shape:\n${opts.shapeHint}`;

  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const { text } = await generateText({
      model: opts.model,
      system,
      prompt:
        attempt === 0
          ? opts.prompt
          : opts.prompt + "\n\n(Your previous reply was not valid JSON. Output ONLY the JSON object.)",
    });

    try {
      const cleaned = text
        .trim()
        .replace(/^```(?:json)?/i, "")
        .replace(/```$/, "")
        .trim();
      const match = cleaned.match(/\{[\s\S]*\}/);
      return opts.schema.parse(JSON.parse(match ? match[0] : cleaned));
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
}
