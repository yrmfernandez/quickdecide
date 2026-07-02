import { generateText, generateObject, stepCountIs } from "ai";
import { groq } from "@ai-sdk/groq";
import { JudgeSchema, type JudgeResult } from "../schemas";
import { SLIDER_META, type SliderId } from "../sliders";
import { getWeather, getTimeContext } from "../tools";

export interface JudgeInput {
  rawText: string;
  choices: string[];
  sliders: { id: SliderId; value: number }[]; // value: 0–100
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
      return `- ${meta.label}: ${s.value}/100 ("${meta.low}" → "${meta.high}"). ${meta.judgeHint}`;
    })
    .join("\n");

  const { text } = await generateText({
    model: groq("llama-3.3-70b-versatile"),
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

End your reply with a final summary: winner, a 0-100 score per choice with a one-line note each, and which real-world facts you used.`,
    prompt: `Original brain dump: "${input.rawText}"\n\nJudge it.`,
  });

  // Structuring pass: convert the judge's free-text ruling into strict JSON.
  const { object } = await generateObject({
    model: groq("llama-3.1-8b-instant"),
    schema: JudgeSchema,
    system: `Convert the ruling into JSON. The winner MUST be one of: ${JSON.stringify(input.choices)}. Copy scores and notes faithfully; do not invent facts.`,
    prompt: text,
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
