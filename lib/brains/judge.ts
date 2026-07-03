import { stepCountIs, wrapLanguageModel, defaultSettingsMiddleware } from "ai";
import { wrapAcrossKeys } from "../groq-provider";
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
  mobility?: "transit" | "walking";
}

// Helper to safely wrap Groq models with their specific reasoning parameters
function createReasoningModel(id: string, effort: "none" | "low" | "medium" | "high" | "default") {
  // Expand across every API key for 24h rotation + failover.
  return wrapAcrossKeys(id, (base) =>
    wrapLanguageModel({
      model: base,
      middleware: defaultSettingsMiddleware({
        settings: {
          providerOptions: {
            groq: {
              reasoningFormat: "parsed", // Must be parsed for tool calling
              reasoningEffort: effort,
            },
          },
        },
      }),
    })
  );
}

// Dynamically construct the chains based on mode to prevent Qwen/GPT cross-parameter crashes
function getJudgeModels(choice: ModelChoice) {
  if (choice === "strong") {
    // Strong: Medium reasoning for GPT, default (enabled) for Qwen
    return [
      createReasoningModel("openai/gpt-oss-120b", "medium"),
      createReasoningModel("qwen/qwen3.6-27b", "default"),
    ].flat();
  }
  if (choice === "balanced") {
    // Balanced: Low reasoning for GPT, default (enabled) for Qwen
    return [
      createReasoningModel("openai/gpt-oss-120b", "low"),
      createReasoningModel("qwen/qwen3.6-27b", "default"),
      createReasoningModel("openai/gpt-oss-20b", "high"),
    ].flat();
  }
  // Fast: Low reasoning for GPT (lowest allowed), none (disabled) for Qwen
  return [
    createReasoningModel("openai/gpt-oss-20b", "low"),
    createReasoningModel("qwen/qwen3.6-27b", "none"),
  ].flat();
}

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
    .map((item) => item.replace(/^[\s*.-]+/, "").trim()) // Just strip leading bullets/spaces
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
    return { ...object, winner: wildcardSuggestion, outcomeType: "wildcard", tiedChoices: [], wildcardSuggestion, scores };
  }

  if (object.outcomeType === "tie" || (second && Math.abs(top.score - second.score) <= 2)) {
    return { ...object, winner: tiedChoices.join(" / "), outcomeType: "tie", tiedChoices, wildcardSuggestion, scores };
  }

  const allChoices = wildcardSuggestion ? [...input.choices, wildcardSuggestion] : input.choices;
  const winner = allChoices.find((choice) => fuzzyMatch(choice, object.winner)) ?? top.choice;
  const isWildcardWin = wildcardSuggestion !== null && fuzzyMatch(winner, wildcardSuggestion);

  return { ...object, winner, outcomeType: isWildcardWin ? "wildcard" : "winner", tiedChoices: [], wildcardSuggestion, scores };
}

function enforceSliderReasoning(
  reasoning: string[],
  sliders: JudgeInput["sliders"]
): string[] {
  const out: string[] = [];
  const usedLines = new Set<string>();

  for (const s of sliders) {
    const meta = SLIDER_META[s.id];
    const label = s.label ?? meta.label;
    
    // Grab the first 10 characters of the label to fuzzy-match the line
    const labelPrefix = label.toLowerCase().slice(0, 10);
    
    const found = reasoning.find((line) => 
      !usedLines.has(line) && line.toLowerCase().includes(labelPrefix)
    );

    if (found) {
      usedLines.add(found);
      const cleaned = found
        .replace(/^[-\*\s]+/, "") 
        .replace(/\s*\d{1,3}\/100/g, "") 
        .replace(/={2,}/g, "") 
        .trim();
      out.push(cleaned);
    } else {
      out.push(`${label}: Applied as a ${leanText(s.value, s.low ?? meta.low, s.high ?? meta.high)} preference.`);
    }
  }
  
  const extra = reasoning.find((line) => !usedLines.has(line));
  if (extra) {
    out.push(
      extra
        .replace(/^[-\*\s]+/, "")
        .replace(/\s*\d{1,3}\/100/g, "") // Scrub the extra line too just in case
        .replace(/={2,}/g, "")
        .trim()
    );
  }
  
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
        `=== SLIDER: ${label} ===`,
        `[0 SCORE DEFINITION]: The choice strongly aligns with "${low}".`,
        `[100 SCORE DEFINITION]: The choice strongly aligns with "${high}".`,
        `[USER PREFERENCE]: The user set this slider to ${s.value}/100. They are ${leanText(s.value, low, high)}.`,
        `[HOW TO JUDGE]: First, determine where each choice falls on the 0-100 scale between "${low}" and "${high}". Then, reward the choices that sit closest to the user's requested ${s.value}/100.`,
      ].join("\n");
    })
    .join("\n\n");

  const toneRules = input.mode === "funny"
    ? "PERSONA: chaotic-good game-show judge. Scoring stays rigorous, but every score note lands a light, theme-aware joke. Humor lives in wording only — never in fake facts."
    : "PERSONA: cold, calculating analyst. Score notes read like an auditor's ledger: terse, quantitative, zero jokes. Each note names the slider or context fact that drove the number (e.g. 'loses 30 pts to urgency at 85/100').";

  const wildcardRules = input.wildcardAllowed
    ? `WILDCARD IS ON: you MUST invent exactly ONE additional option ("the wildcard") the user did not list — practical or delightfully chaotic, but genuinely doable given their context. Score it alongside the originals and report it in the wildcardSuggestion field. It wins ONLY if it honestly outscores everything (then set outcomeType to "wildcard" and winner to it); otherwise the outcome stays among the originals but the suggestion is still shown.`
    : "Wildcard is not allowed. Pick from the provided choices unless the honest result is a tie.";

  const result = await generateTextSafe({
    // Using our safely wrapped models that have their specific reasoning params baked in!
    models: getJudgeModels(input.modelChoice),
    tools: { getWeather, getTimeContext, getDateContext, compareSimpleCosts },
    stopWhen: stepCountIs(input.modelChoice === "fast" ? 4 : input.modelChoice === "strong" ? 8 : 6),
    system: `You are Brain 2 of QuickDecide.

You are an autonomous decision judge. Brain 1 has already extracted the user's choices and criteria.

${toneRules}
${wildcardRules}
${input.mobility ? `CRITICAL CONTEXT: The user has indicated their transportation method is: ${input.mobility.toUpperCase()}. Heavily penalize options that are incompatible with this.` : ""}

Core rules:
- Do not invent locations, schedules, prices, weather, availability, or user preferences.
- Use tools when weather, date, local time, or obvious cost comparison could materially change the answer.
- If a tool is unavailable or returns an error, continue conservatively and mention the uncertainty in reasoningUsed.
- Evaluate every choice against every slider before selecting an outcome.
- Score every provided choice from 0 to 100.
- If the top choices are essentially equal or the score gap is 2 points or less, set outcomeType to "tie".
- If wildcard is disabled, winner must exactly match one provided choice unless outcomeType is "tie".
- Keep contextUsed for external/tool facts only.
- reasoningUsed: exactly ONE combined line per slider summarizing how the choices compared. Format strictly as "Slider Name: Explanation". NEVER output multiple lines for the same slider. Do NOT include numbers or scores in the text. The final line can be "Tradeoff: Explanation".

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

  console.log("\n🧠 === JUDGE'S INTERNAL REASONING ===");
  console.log(result.reasoning || "(No reasoning tokens generated)");
  
  console.log("\n⚖️ === JUDGE'S FINAL RAW TEXT ===");
  console.log(result.text);
  console.log("=====================================\n");

  const actualContext = formatActualToolContext(result.steps.flatMap((step) => step.toolResults));

  const object = await generateObjectSafe({
    models: STRUCTURER_CHAIN.flatMap((id) =>
      wrapAcrossKeys(id, (base) =>
        wrapLanguageModel({
          model: base,
          middleware: defaultSettingsMiddleware({
            settings: {
              providerOptions: {
                groq: {
                  // Must be hidden for structured outputs to avoid parsing errors
                  reasoningFormat: "hidden",
                },
              },
            },
          }),
        })
      )
    ),
    schema: JudgeSchema,
    system: `Convert the judge's ruling into JSON.
Rules:
- Copy the outcome faithfully.
- Include one score object for every original choice.
- Use outcomeType "tie" if the ruling says the top choices are effectively equal.
- Use outcomeType "wildcard" only for an outside suggestion.
- contextUsed may be empty because the app replaces it with actual tool results.
- reasoningUsed: format each line strictly as "Slider Name: Explanation". You MUST use the exact slider name as the prefix before the colon. NEVER use a choice name as the prefix. The final line can be "Tradeoff: Explanation".
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

  return { ...normalized, contextUsed: actualContext, reasoningUsed: enforceSliderReasoning(normalizeReadableList(normalized.reasoningUsed ?? [], 6), input.sliders) };
}