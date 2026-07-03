import { generateText, type LanguageModel, type ToolSet, type StopCondition } from "ai";
import type { z } from "zod";

/**
 * Guardrails layer.
 *
 * Every LLM call runs through a MODEL FALLBACK CHAIN: if the primary model
 * errors (rate limit, decommissioned model, transient 5xx), the next model in
 * the chain is tried automatically. Structured outputs additionally retry
 * once per model on malformed JSON.
 *
 * Model note (verified against Groq docs, July 2026): llama-3.1-8b-instant
 * and llama-3.3-70b-versatile were deprecated on June 17, 2026. Recommended
 * replacements are openai/gpt-oss-20b, openai/gpt-oss-120b, and
 * qwen/qwen3.6-27b — which is what every chain in this app now uses.
 */

export async function generateTextSafe(opts: {
  models: LanguageModel[];
  system: string;
  prompt: string;
  tools?: ToolSet;
  stopWhen?: StopCondition<ToolSet> | Array<StopCondition<ToolSet>>;
}) {
  let lastError: unknown;
  for (const model of opts.models) {
    try {
      return await generateText({
        model,
        system: opts.system,
        prompt: opts.prompt,
        ...(opts.tools ? { tools: opts.tools } : {}),
        ...(opts.stopWhen ? { stopWhen: opts.stopWhen } : {}),
      });
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
}

export async function generateObjectSafe<S extends z.ZodTypeAny>(opts: {
  models: LanguageModel[];
  schema: S;
  system: string;
  prompt: string;
  /** Shape hint appended to the system prompt, e.g. `{"winner": "..."}` */
  shapeHint: string;
}): Promise<z.output<S>> {
  const system =
    opts.system +
    `\n\nCRITICAL OUTPUT RULE: Respond with ONLY a raw JSON object — no markdown fences, no commentary, no preamble. Exact shape:\n${opts.shapeHint}`;

  let lastError: unknown;
  for (const model of opts.models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const { text } = await generateText({
          model,
          system,
          prompt:
            attempt === 0
              ? opts.prompt
              : opts.prompt +
                "\n\n(Your previous reply was not valid JSON. Output ONLY the JSON object.)",
        });
        const cleaned = text
          .trim()
          .replace(/^```(?:json)?/i, "")
          .replace(/```$/, "")
          .trim();
        const match = cleaned.match(/\{[\s\S]*\}/);
        return opts.schema.parse(JSON.parse(match ? match[0] : cleaned)) as z.output<S>;
      } catch (e) {
        lastError = e;
      }
    }
  }
  throw lastError;
}
