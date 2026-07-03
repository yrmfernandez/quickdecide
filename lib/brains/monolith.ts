import { stepCountIs, wrapLanguageModel, defaultSettingsMiddleware } from "ai";
import { groq } from "@ai-sdk/groq";
import { z } from "zod";
import { getWeather, getTimeContext, getDateContext, compareSimpleCosts } from "../tools";
import { generateObjectSafe, generateTextSafe } from "../ai-utils";
import { formatActualToolContext } from "../tool-context";
import type { ModelChoice, Verdict } from "../schemas";

export interface MonobrainInput {
  rawText: string;
  city: string | null;
  modelChoice: ModelChoice;
  wildcardAllowed: boolean;
}

// Helper to safely wrap Groq models with their specific reasoning parameters
function createReasoningModel(id: string, effort: "none" | "low" | "medium" | "high" | "default", format: "parsed" | "hidden") {
  return wrapLanguageModel({
    model: groq(id),
    middleware: defaultSettingsMiddleware({
      settings: {
        providerOptions: {
          groq: {
            reasoningFormat: format,
            reasoningEffort: effort,
          },
        },
      },
    }),
  });
}

// Dynamically construct the chains based on mode to prevent Qwen/GPT cross-parameter crashes
function getMonoModels(choice: ModelChoice) {
  if (choice === "strong") {
    return [
      createReasoningModel("openai/gpt-oss-120b", "medium", "parsed"),
      createReasoningModel("qwen/qwen3.6-27b", "default", "parsed"),
    ];
  }
  if (choice === "balanced") {
    return [
      createReasoningModel("openai/gpt-oss-120b", "low", "parsed"),
      createReasoningModel("qwen/qwen3.6-27b", "default", "parsed"),
      createReasoningModel("openai/gpt-oss-20b", "low", "parsed"),
    ];
  }
  // Fast
  return [
    createReasoningModel("openai/gpt-oss-20b", "low", "parsed"),
    createReasoningModel("qwen/qwen3.6-27b", "none", "parsed"),
  ];
}

const STRUCTURER_CHAIN = ["openai/gpt-oss-20b", "qwen/qwen3.6-27b"];

const clamped = z.coerce
  .number()
  .catch(50)
  .transform((n) => (Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 50));

const MonolithSchema = z.object({
  winner: z.coerce.string().catch("").transform((s) => s.slice(0, 80)),
  outcomeType: z
    .string()
    .catch("winner")
    .transform((v): "winner" | "tie" | "wildcard" => {
      const s = v.toLowerCase().trim();
      return s === "tie" || s === "wildcard" ? s : "winner";
    }),
  tiedChoices: z.array(z.coerce.string()).catch([]).default([]),
  wildcardSuggestion: z.coerce.string().transform((s) => s.slice(0, 80)).nullable().catch(null).default(null),
  witty: z.coerce.string().catch("").describe("ONE concise sentence, max 22 words. No hashtags, no emoji, no quotes."),
  scores: z
    .array(
      z.object({
        choice: z.coerce.string().catch("").transform((s) => s.slice(0, 80)),
        score: clamped,
        note: z.coerce.string().catch("").transform((note) => note.slice(0, 200)),
      })
    )
    .catch([])
    .describe("Score per choice out of 100 with a terse justification note."),
  contextUsed: z.array(z.coerce.string()).catch([]).default([]),
  reasoningUsed: z.array(z.coerce.string().transform((reason) => reason.slice(0, 260))).catch([]).default([]),
});

type MonolithResult = z.infer<typeof MonolithSchema>;

// 👇 FIXED: Removed the aggressive split() regex so labels with "?" don't break
function normalizeReadableList(items: string[], maxItems = 4): string[] {
  return items
    .map((item) => item.replace(/^[\s*.-]+/, "").trim())
    .filter((item) => item.length > 0)
    .filter((item) => !/non[- ]?existent|fake tool|web search|search tool/i.test(item))
    .slice(0, maxItems);
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 50;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizeMonolith(object: MonolithResult, wildcardAllowed: boolean): MonolithResult {
  const scores = object.scores.map((score) => ({
    ...score,
    score: clampScore(score.score),
  }));
  const sorted = [...scores].sort((a, b) => b.score - a.score);
  const top = sorted[0];
  const second = sorted[1];

  if (object.outcomeType === "wildcard" && wildcardAllowed) {
    return {
      ...object,
      winner: object.winner.slice(0, 80),
      wildcardSuggestion: object.wildcardSuggestion ?? object.winner.slice(0, 80),
      tiedChoices: [],
      scores,
    };
  }

  if (object.outcomeType === "tie" || (second && Math.abs(top.score - second.score) <= 2)) {
    const tiedChoices = sorted
      .filter((score) => Math.abs(score.score - top.score) <= 2)
      .map((score) => score.choice);
    return {
      ...object,
      winner: tiedChoices.join(" / "),
      outcomeType: "tie",
      tiedChoices,
      scores,
    };
  }

  const lowerWinner = object.winner.toLowerCase();
  const winner =
    scores.find((score) => {
      const choice = score.choice.toLowerCase();
      return lowerWinner === choice || lowerWinner.includes(choice) || choice.includes(lowerWinner);
    })?.choice ?? top.choice;

  return { ...object, winner, outcomeType: "winner", tiedChoices: [], scores };
}

export async function runMonobrain(input: MonobrainInput): Promise<Verdict> {
  const wildcardRule = input.wildcardAllowed
    ? `WILDCARD IS ON: after extracting the user's options, you MUST invent exactly ONE additional option they did not list — practical or delightfully chaotic, but genuinely doable. Score it with the rest and report it in wildcardSuggestion. It wins ONLY if it honestly outscores everything (outcomeType "wildcard"). Your witty sentence MUST acknowledge that you added a new option.`
    : "Wildcard is disabled. Choose from the extracted original options unless it is a tie.";

  const result = await generateTextSafe({
    models: getMonoModels(input.modelChoice),
    tools: { getWeather, getTimeContext, getDateContext, compareSimpleCosts },
    stopWhen: stepCountIs(input.modelChoice === "fast" ? 4 : input.modelChoice === "strong" ? 8 : 6),
    system: `You are QuickDecide in instant mode: fast, practical, and accurate.

${input.city ? `The user is located in ${input.city}.` : "User location is unknown."}
${wildcardRule}

Process:
1. Extract the user's actual options as short labels, preserving wording.
2. Use tools first when date, local time, weather, or broad cost could materially affect the answer.
3. Do not invent locations, schedules, prices, availability, weather, or user preferences.
4. Score every original option from 0 to 100.
5. If the top choices are effectively equal or within 2 points, set outcomeType to "tie".
6. Write one concise verdict sentence.

Available tools: getWeather, getTimeContext, getDateContext, compareSimpleCosts.

End with a final summary containing winner, outcomeType, tiedChoices, witty, scores, contextUsed, and reasoningUsed.`,
    prompt: `Original brain dump: "${input.rawText}"`,
  });

  console.log("\n⚡ === MONOLITH'S INTERNAL REASONING ===");
  const rawReasoning = result.reasoning;
  const cleanReasoning = Array.isArray(rawReasoning) 
    ? rawReasoning.map((r: any) => r.text || "").join("\n") 
    : rawReasoning;
  console.log(cleanReasoning || "(No reasoning tokens generated)");
  
  console.log("\n🚀 === MONOLITH'S FINAL RAW TEXT ===");
  console.log(result.text);
  console.log("=====================================\n");

  const actualContext = formatActualToolContext(
    result.steps.flatMap((step) => step.toolResults)
  );

  const object = await generateObjectSafe({
    models: STRUCTURER_CHAIN.map((id) =>
      createReasoningModel(id, id.includes("qwen") ? "none" : "low", "hidden")
    ),
    schema: MonolithSchema,
    system: `Convert the free-text ruling into strict JSON.

Rules:
- Include one score object for every extracted original option.
- Use outcomeType "tie" when choices are essentially equal.
- Use outcomeType "wildcard" only for an outside suggestion.
- Keep witty under 22 words, with no quotes or emoji.
- contextUsed must contain only external/tool facts; the app will replace it with actual tool output.
// 👇 FIXED: Enforce clean Label: Explanation formatting
- reasoningUsed: format each line strictly as "Label: Explanation" without stating numeric scores (e.g., "50/100").`,
    prompt: result.text,
    shapeHint: `{"winner": "...", "outcomeType": "winner", "tiedChoices": [], "wildcardSuggestion": null, "witty": "...", "scores": [{"choice": "...", "score": 0, "note": "..."}], "contextUsed": [], "reasoningUsed": []}`,
  });

  const filled: MonolithResult = {
    ...object,
    outcomeType: object.outcomeType ?? "winner",
    tiedChoices: object.tiedChoices ?? [],
    contextUsed: object.contextUsed ?? [],
    reasoningUsed: object.reasoningUsed ?? [],
  };
  const normalized = normalizeMonolith(filled, input.wildcardAllowed);

  return {
    ...normalized,
    wildcardSuggestion: normalized.wildcardSuggestion ?? null,
    mode: "instant",
    wildcardAllowed: input.wildcardAllowed,
    contextUsed: actualContext,
    reasoningUsed: normalizeReadableList(normalized.reasoningUsed ?? []),
  };
}