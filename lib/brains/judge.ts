import { generateText, stepCountIs } from "ai";
import { groq } from "@ai-sdk/groq";
import { JudgeSchema, type JudgeResult } from "../schemas";
import { SLIDER_META, type SliderId } from "../sliders";
import { getWeather, getTimeContext } from "../tools";
import { generateObjectSafe } from "../ai-utils";

export interface JudgeInput {
  rawText: string;
  choices: string[];
  sliders: {
    id: SliderId;
    value: number;
    label?: string;
    low?: string;
    high?: string;
  }[]; // value: 0-100
  city: string | null; // from x-vercel-ip-city, may be null locally
}

/**
 * Brain 2 — The Judge (Llama-3.3-70B, the heavy lifter).
 *
 * Runs an autonomous ReAct loop with the free toolbelt (weather + time),
 * weighs each choice against the user's slider values, and locks in a winner.
 * A final structuring pass guarantees clean JSON via Zod.
 */
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

  const { text } = await generateText({
    model: groq("openai/gpt-oss-120b"),
    tools: { getWeather, getTimeContext },
    stopWhen: stepCountIs(5),
    system: `You are a ruthless, logical decision judge. Choices: ${JSON.stringify(input.choices)}.

User's constraint sliders (0-100):
${sliderContext}

${input.city ? `The user is located in ${input.city}.` : "User location unknown."}

Process:
1. If weather or time-of-day could plausibly affect this decision, call the tools FIRST (use the user's city for weather).
2. Score each choice 0-100 against the slider values and any real-world context.
3. Declare exactly one winner from the choices list, verbatim.

Separate your evidence:
- contextUsed: ONLY external facts from tools or objective timing/location facts. If none, say none; do not put slider reasoning here.
- reasoningUsed: internal tradeoffs, slider effects, and why the winner beat the alternatives.

End your reply with a final summary: winner, a 0-100 score per choice with a one-line note each, contextUsed, and reasoningUsed.`,
    prompt: `Original brain dump: "${input.rawText}"\n\nJudge it.`,
  });

  // Structuring pass: convert the judge's free-text ruling into strict JSON.
  const object = await generateObjectSafe({
    model: groq("openai/gpt-oss-120b"),
    schema: JudgeSchema,
    system: `Convert the ruling into JSON. The winner MUST be one of: ${JSON.stringify(input.choices)}. Copy scores and notes faithfully; do not invent facts.

Rules:
- contextUsed must contain ONLY real external facts from tool calls, time, weather, or location. If no external facts were used, return [].
- reasoningUsed must contain slider effects, tradeoffs, and internal judgment reasons.`,
    prompt: text,
    shapeHint: `{"winner": "...", "scores": [{"choice": "...", "score": 0-100, "note": "..."}], "contextUsed": ["..."], "reasoningUsed": ["..."]}`,
  });

  // Guard: if the model mangled the winner label, snap to closest choice.
  if (!input.choices.includes(object.winner)) {
    const lower = object.winner.toLowerCase();
    object.winner =
      input.choices.find((c) => lower.includes(c.toLowerCase()) || c.toLowerCase().includes(lower)) ??
      input.choices[0];
  }

  return object;
}
