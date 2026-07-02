import { generateText, stepCountIs } from "ai";
import { groq } from "@ai-sdk/groq";
import { z } from "zod";
import { getWeather, getTimeContext, getDateContext, compareSimpleCosts } from "../tools";
import { generateObjectSafe } from "../ai-utils";
import { formatActualToolContext } from "../tool-context";
import type { ModelChoice, Verdict } from "../schemas";

export interface MonobrainInput {
  rawText: string;
  city: string | null;
  modelChoice: ModelChoice;
  wildcardAllowed: boolean;
}

const MONO_MODELS: Record<ModelChoice, string> = {
  balanced: "openai/gpt-oss-120b",
  fast: "openai/gpt-oss-20b",
  strong: "openai/gpt-oss-120b",
};

const MonolithSchema = z.object({
  winner: z.string().describe("The exact winning choice, tie label, or wildcard suggestion."),
  outcomeType: z.enum(["winner", "tie", "wildcard"]).default("winner"),
  tiedChoices: z.array(z.string()).default([]),
  witty: z.string().describe("ONE concise sentence, max 22 words. No hashtags, no emoji, no quotes."),
  scores: z
    .array(
      z.object({
        choice: z.string(),
        score: z.number().min(0).max(100),
        note: z.string().transform((note) => note.slice(0, 140)),
      })
    )
    .describe("Score per original choice out of 100 with a terse justification note."),
  contextUsed: z.array(z.string()).default([]),
  reasoningUsed: z.array(z.string().transform((reason) => reason.slice(0, 140))).default([]),
});

type MonolithResult = z.infer<typeof MonolithSchema>;

function normalizeReadableList(items: string[], maxItems = 4): string[] {
  return items
    .flatMap((item) =>
      item
        .replace(/^[\s*.-]+/, "")
        .split(/(?<=[.!?])\s+/)
        .map((part) => part.trim())
    )
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
    return { ...object, winner: object.winner.slice(0, 80), tiedChoices: [], scores };
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
    ? "Wildcard is allowed only when a clearly better outside suggestion follows from the user's text."
    : "Wildcard is disabled. Choose from the extracted original options unless it is a tie.";

  const result = await generateText({
    model: groq(MONO_MODELS[input.modelChoice]),
    tools: { getWeather, getTimeContext, getDateContext, compareSimpleCosts },
    stopWhen: stepCountIs(input.modelChoice === "fast" ? 4 : 6),
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

  const actualContext = formatActualToolContext(
    result.steps.flatMap((step) => step.toolResults)
  );

  const object = await generateObjectSafe({
    model: groq(input.modelChoice === "fast" ? "openai/gpt-oss-20b" : "llama-3.1-8b-instant"),
    schema: MonolithSchema,
    system: `Convert the free-text ruling into strict JSON.

Rules:
- Include one score object for every extracted original option.
- Use outcomeType "tie" when choices are essentially equal.
- Use outcomeType "wildcard" only for an outside suggestion.
- Keep witty under 22 words, with no quotes or emoji.
- contextUsed must contain only external/tool facts; the app will replace it with actual tool output.`,
    prompt: result.text,
    shapeHint: `{"winner": "...", "outcomeType": "winner", "tiedChoices": [], "witty": "...", "scores": [{"choice": "...", "score": 0, "note": "..."}], "contextUsed": [], "reasoningUsed": []}`,
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
    mode: "instant",
    wildcardAllowed: input.wildcardAllowed,
    contextUsed: actualContext,
    reasoningUsed: normalizeReadableList(normalized.reasoningUsed ?? []),
  };
}
