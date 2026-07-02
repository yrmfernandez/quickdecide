import { generateText, stepCountIs } from "ai";
import { groq } from "@ai-sdk/groq";
import { JudgeSchema, type JudgeResult, type DecisionMode, type ModelChoice } from "../schemas";
import { SLIDER_META, type SliderId } from "../sliders";
import { getWeather, getTimeContext, getDateContext, compareSimpleCosts } from "../tools";
import { generateObjectSafe } from "../ai-utils";
import { formatActualToolContext } from "../tool-context";

export interface JudgeInput {
  rawText: string;
  choices: string[];
  sliders: {
    id: SliderId;
    value: number;
    label?: string;
    low?: string;
    high?: string;
  }[];
  city: string | null;
  mode: Exclude<DecisionMode, "instant">;
  modelChoice: ModelChoice;
  wildcardAllowed: boolean;
}

const JUDGE_MODELS: Record<ModelChoice, string> = {
  balanced: "openai/gpt-oss-120b",
  fast: "openai/gpt-oss-20b",
  strong: "openai/gpt-oss-120b",
};

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

function normalizeJudgeResult(object: JudgeResult, input: JudgeInput): JudgeResult {
  const scores = input.choices.map((choice) => {
    const found = object.scores.find((score) => {
      const a = score.choice.toLowerCase();
      const b = choice.toLowerCase();
      return a === b || a.includes(b) || b.includes(a);
    });

    return {
      choice,
      score: clampScore(found?.score ?? 50),
      note: found?.note ?? "No reliable distinction found.",
    };
  });

  const sorted = [...scores].sort((a, b) => b.score - a.score);
  const top = sorted[0];
  const second = sorted[1];
  const tiedChoices = sorted
    .filter((score) => Math.abs(score.score - top.score) <= 2)
    .map((score) => score.choice);

  if (object.outcomeType === "wildcard" && input.wildcardAllowed) {
    return {
      ...object,
      winner: object.winner.slice(0, 80),
      outcomeType: "wildcard",
      tiedChoices: [],
      scores,
    };
  }

  if (object.outcomeType === "tie" || (second && Math.abs(top.score - second.score) <= 2)) {
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
    input.choices.find((choice) => {
      const lowerChoice = choice.toLowerCase();
      return (
        lowerChoice === lowerWinner ||
        lowerWinner.includes(lowerChoice) ||
        lowerChoice.includes(lowerWinner)
      );
    }) ?? top.choice;

  return {
    ...object,
    winner,
    outcomeType: "winner",
    tiedChoices: [],
    scores,
  };
}

export async function judge(input: JudgeInput): Promise<JudgeResult> {
  const sliderContext = input.sliders
    .map((s) => {
      const meta = SLIDER_META[s.id];
      const label = s.label ?? meta.label;
      const low = s.low ?? meta.low;
      const high = s.high ?? meta.high;
      return `- ${label}: ${s.value}/100 ("${low}" -> "${high}"). Canonical dimension: ${meta.label}. ${meta.judgeHint}`;
    })
    .join("\n");

  const toneRules =
    input.mode === "funny"
      ? "Tone: theme-aware and playful, but scoring must stay accurate. Humor belongs in wording, not fake facts."
      : "Tone: serious, concise, and grounded. Prefer practical accuracy over jokes.";

  const wildcardRules = input.wildcardAllowed
    ? "Wildcard is allowed only when a clearly better outside option follows from the user's own context. Still score every original choice."
    : "Wildcard is not allowed. Pick from the provided choices unless the honest result is a tie.";

  const result = await generateText({
    model: groq(JUDGE_MODELS[input.modelChoice]),
    tools: { getWeather, getTimeContext, getDateContext, compareSimpleCosts },
    stopWhen: stepCountIs(input.modelChoice === "fast" ? 4 : 6),
    system: `You are Brain 2 of QuickDecide.

You are an autonomous decision judge. Brain 1 has already extracted the user's choices and criteria.

${toneRules}
${wildcardRules}

Core rules:
- Do not invent locations, schedules, prices, weather, availability, or user preferences.
- Use tools when weather, date, local time, or obvious cost comparison could materially change the answer.
- If a tool is unavailable or returns an error, continue conservatively and mention the uncertainty in reasoningUsed.
- Evaluate every choice against every slider before selecting an outcome.
- Score every provided choice from 0 to 100.
- If the top choices are essentially equal or the score gap is 2 points or less, set outcomeType to "tie".
- If wildcard is disabled, winner must exactly match one provided choice unless outcomeType is "tie".
- Keep contextUsed for external/tool facts only.
- Keep reasoningUsed short and focused on slider effects and tradeoffs.

Available tools:
- getWeather
- getTimeContext
- getDateContext
- compareSimpleCosts

Sliders:
${sliderContext}`,
    prompt: `Original user request:
${input.rawText}

Choices:
${input.choices.map((choice, index) => `${index + 1}. ${choice}`).join("\n")}

City from request headers: ${input.city ?? "unknown"}

Make the judgment carefully, then provide a final summary with winner, outcomeType, tiedChoices, scores, contextUsed, and reasoningUsed.`,
  });

  const actualContext = formatActualToolContext(
    result.steps.flatMap((step) => step.toolResults)
  );

  const object = await generateObjectSafe({
    model: groq(JUDGE_MODELS[input.modelChoice]),
    schema: JudgeSchema,
    system: `Convert the judge's ruling into JSON.

Rules:
- Copy the outcome faithfully.
- Include one score object for every original choice.
- Use outcomeType "tie" if the ruling says the top choices are effectively equal.
- Use outcomeType "wildcard" only for an outside suggestion.
- contextUsed may be empty because the app replaces it with actual tool results.
- reasoningUsed contains only concise tradeoffs and slider effects.`,
    prompt: result.text,
    shapeHint: `{"winner": "...", "outcomeType": "winner", "tiedChoices": [], "scores": [{"choice": "...", "score": 0, "note": "..."}], "contextUsed": [], "reasoningUsed": []}`,
  });

  const filled: JudgeResult = {
    ...object,
    outcomeType: object.outcomeType ?? "winner",
    tiedChoices: object.tiedChoices ?? [],
    contextUsed: object.contextUsed ?? [],
    reasoningUsed: object.reasoningUsed ?? [],
  };
  const normalized = normalizeJudgeResult(filled, input);

  return {
    ...normalized,
    contextUsed: actualContext,
    reasoningUsed: normalizeReadableList(normalized.reasoningUsed ?? []),
  };
}
