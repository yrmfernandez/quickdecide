import { stepCountIs } from "ai";
import { groq } from "@ai-sdk/groq";
import { JudgeSchema, type JudgeResult, type DecisionMode, type ModelChoice } from "../schemas";
import { SLIDER_META, type SliderId } from "../sliders";
import { getWeather, getTimeContext, getDateContext, compareSimpleCosts } from "../tools";
import { generateObjectSafe, generateTextSafe } from "../ai-utils";
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

// Chains verified against Groq's July 2026 lineup (llama-3.x deprecated).
const JUDGE_CHAINS: Record<ModelChoice, string[]> = {
  balanced: ["openai/gpt-oss-120b", "qwen/qwen3.6-27b", "openai/gpt-oss-20b"],
  fast: ["openai/gpt-oss-20b", "qwen/qwen3.6-27b"],
  strong: ["openai/gpt-oss-120b", "qwen/qwen3.6-27b"],
};
const STRUCTURER_CHAIN = ["openai/gpt-oss-20b", "qwen/qwen3.6-27b"];

function leanText(value: number, low: string, high: string): string {
  if (value <= 15) return `STRONGLY toward "${low}"`;
  if (value <= 40) return `leaning toward "${low}"`;
  if (value < 60) return `neutral between "${low}" and "${high}"`;
  if (value < 85) return `leaning toward "${high}"`;
  return `STRONGLY toward "${high}"`;
}

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

function fuzzyMatch(a: string, b: string): boolean {
  const na = a.toLowerCase().trim();
  const nb = b.toLowerCase().trim();
  if (na === nb) return true;
  if (na.length >= 4 && nb.length >= 4) return na.includes(nb) || nb.includes(na);
  return false;
}

function normalizeJudgeResult(object: JudgeResult, input: JudgeInput): JudgeResult {
  const scores = input.choices.map((choice) => {
    const found = object.scores.find((score) => fuzzyMatch(score.choice, choice));
    return {
      choice,
      score: clampScore(found?.score ?? 50),
      note: found?.note ?? "No reliable distinction found.",
    };
  });

  // Wildcard: keep the ONE added suggestion as an extra scored row.
  let wildcardSuggestion: string | null = null;
  if (input.wildcardAllowed) {
    const extra =
      object.scores.find(
        (s) =>
          !input.choices.some((c) => fuzzyMatch(s.choice, c)) &&
          (object.wildcardSuggestion ? fuzzyMatch(s.choice, object.wildcardSuggestion) : true)
      ) ??
      (object.wildcardSuggestion
        ? { choice: object.wildcardSuggestion, score: 55, note: "wildcard suggestion" }
        : null);
    if (extra) {
      wildcardSuggestion = extra.choice;
      scores.push({
        choice: extra.choice,
        score: clampScore(extra.score),
        note: extra.note || "wildcard suggestion",
      });
    }
  }

  const sorted = [...scores].sort((a, b) => b.score - a.score);
  const top = sorted[0];
  const second = sorted[1];
  const tiedChoices = sorted
    .filter((score) => Math.abs(score.score - top.score) <= 2)
    .map((score) => score.choice);

  if (object.outcomeType === "wildcard" && input.wildcardAllowed && wildcardSuggestion) {
    return {
      ...object,
      winner: wildcardSuggestion,
      outcomeType: "wildcard",
      tiedChoices: [],
      wildcardSuggestion,
      scores,
    };
  }

  if (object.outcomeType === "tie" || (second && Math.abs(top.score - second.score) <= 2)) {
    return {
      ...object,
      winner: tiedChoices.join(" / "),
      outcomeType: "tie",
      tiedChoices,
      wildcardSuggestion,
      scores,
    };
  }

  const allChoices = wildcardSuggestion ? [...input.choices, wildcardSuggestion] : input.choices;
  const winner = allChoices.find((choice) => fuzzyMatch(choice, object.winner)) ?? top.choice;
  const isWildcardWin = wildcardSuggestion !== null && fuzzyMatch(winner, wildcardSuggestion);

  return {
    ...object,
    winner,
    outcomeType: isWildcardWin ? "wildcard" : "winner",
    tiedChoices: [],
    wildcardSuggestion,
    scores,
  };
}

/** Guarantee one consistent reasoning line per slider (synthesized if missing). */
function enforceSliderReasoning(
  reasoning: string[],
  sliders: JudgeInput["sliders"]
): string[] {
  const out: string[] = [];
  for (const s of sliders) {
    const meta = SLIDER_META[s.id];
    const label = s.label ?? meta.label;
    const found = reasoning.find((line) =>
      line.toLowerCase().includes(label.toLowerCase().slice(0, 12))
    );
    out.push(
      found ??
        `${label} ${s.value}/100: applied as a ${leanText(s.value, s.low ?? meta.low, s.high ?? meta.high)} preference.`
    );
  }
  const extra = reasoning.find((line) => !out.includes(line));
  if (extra) out.push(extra);
  return out;
}

export async function judge(input: JudgeInput): Promise<JudgeResult> {
  const sliderContext = input.sliders
    .map((s) => {
      const meta = SLIDER_META[s.id];
      const label = s.label ?? meta.label;
      const low = s.low ?? meta.low;
      const high = s.high ?? meta.high;
      return [
        `- ${label} = ${s.value}/100. The user is ${leanText(s.value, low, high)}.`,
        `  Scale meaning: 0 = "${low}" (canonically: ${meta.low}) ... 100 = "${high}" (canonically: ${meta.high}).`,
        `  Canonical dimension: ${meta.label}. How to apply: ${meta.judgeHint}`,
      ].join("\n");
    })
    .join("\n");

  const toneRules =
    input.mode === "funny"
      ? "PERSONA: chaotic-good game-show judge. Scoring stays rigorous, but every score note lands a light, theme-aware joke. Humor lives in wording only — never in fake facts."
      : "PERSONA: cold, calculating analyst. Score notes read like an auditor's ledger: terse, quantitative, zero jokes. Each note names the slider or context fact that drove the number (e.g. 'loses 30 pts to urgency at 85/100').";

  const wildcardRules = input.wildcardAllowed
    ? `WILDCARD IS ON: you MUST invent exactly ONE additional option ("the wildcard") the user did not list — practical or delightfully chaotic, but genuinely doable given their context. Score it alongside the originals and report it in the wildcardSuggestion field. It wins ONLY if it honestly outscores everything (then set outcomeType to "wildcard" and winner to it); otherwise the outcome stays among the originals but the suggestion is still shown.`
    : "Wildcard is not allowed. Pick from the provided choices unless the honest result is a tie.";

  const result = await generateTextSafe({
    models: JUDGE_CHAINS[input.modelChoice].map((id) => groq(id)),
    tools: { getWeather, getTimeContext, getDateContext, compareSimpleCosts },
    stopWhen: stepCountIs(input.modelChoice === "fast" ? 4 : input.modelChoice === "strong" ? 8 : 6),
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
- reasoningUsed FORMAT CONTRACT: exactly one line per slider, formatted "<Slider label> <value>/100: <how it moved the ranking in this situation>", plus AT MOST one extra line for a decisive tradeoff or real-world fact. No other reasoning lines.

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
    models: STRUCTURER_CHAIN.map((id) => groq(id)),
    schema: JudgeSchema,
    system: `Convert the judge's ruling into JSON.

Rules:
- Copy the outcome faithfully.
- Include one score object for every original choice.
- Use outcomeType "tie" if the ruling says the top choices are effectively equal.
- Use outcomeType "wildcard" only for an outside suggestion.
- contextUsed may be empty because the app replaces it with actual tool results.
- reasoningUsed: exactly one line per slider in the format "<Slider label> <value>/100: <effect>", plus at most one extra tradeoff line.
- wildcardSuggestion: the added wildcard option's name if one was proposed, else null.`,
    prompt: result.text,
    shapeHint: `{"winner": "...", "outcomeType": "winner", "tiedChoices": [], "wildcardSuggestion": null, "scores": [{"choice": "...", "score": 0, "note": "..."}], "contextUsed": [], "reasoningUsed": []}`,
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
    reasoningUsed: enforceSliderReasoning(
      normalizeReadableList(normalized.reasoningUsed ?? [], 6),
      input.sliders
    ),
  };
}
