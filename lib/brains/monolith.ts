import { generateText, stepCountIs } from "ai";
import { groq } from "@ai-sdk/groq";
import { z } from "zod";
import { getWeather, getTimeContext } from "../tools";
import { generateObjectSafe } from "../ai-utils";

export interface MonobrainInput {
  rawText: string;
  city: string | null;
}

const MonolithSchema = z.object({
  winner: z.string().describe("The exact name of the winning choice."),
  witty: z.string().describe("ONE witty, confident sentence (max 22 words). No hashtags, no emoji, no quotes."),
  scores: z
    .array(
      z.object({
        choice: z.string(),
        score: z.number().min(0).max(100),
        note: z.string().max(140),
      })
    )
    .describe("Score per choice out of 100 with a terse justification note."),
  contextUsed: z
    .array(z.string())
    .describe("Real-world facts used, e.g. weather or time of day."),
});

export type MonolithResult = z.infer<typeof MonolithSchema>;

export async function runMonobrain(input: MonobrainInput): Promise<MonolithResult> {
  const { text } = await generateText({
    model: groq("llama-3.3-70b-versatile"),
    tools: { getWeather, getTimeContext },
    stopWhen: stepCountIs(5),
    system: `You are QuickDecide, a ruthless, logical decision judge and a playful best friend who is done with the user's indecision.

${input.city ? `The user is located in ${input.city}.` : "User location unknown."}

Process:
1. Extract options: Read the messy brain dump and identify choices as short labels (2-5 words), preserving the user's wording where possible.
2. Check reality: If weather or time-of-day could plausibly affect this decision, call the tools FIRST (use the user's city for weather).
3. Judge: Score each choice 0-100 based on standard human constraints (effort, time, cost) and real-world context.
4. Declare winner: Pick exactly ONE winner.
5. Write punchline: Write ONE witty, confident sentence (max 22 words) announcing the verdict. No hashtags, no emoji, no quotes. Ground the joke in the actual reasons.

End your reply with a final summary containing: the extracted choices, the declared winner, the witty one-liner, a 0-100 score per choice with a brief note each, and which real-world facts you used.`,
    prompt: `Original brain dump: "${input.rawText}"\n\nAnalyze, judge, and write the verdict.`,
  });

  const object = await generateObjectSafe({
    model: groq("llama-3.1-8b-instant"),
    schema: MonolithSchema,
    system: `Convert the free-text ruling into strict JSON. Extract the winner, the witty one-liner, the scores array, and context facts faithfully. Ensure the witty sentence has no quotes, no emojis, and is under 22 words.`,
    prompt: text,
    shapeHint: `{"winner": "...", "witty": "...", "scores": [{"choice": "...", "score": 0-100, "note": "..."}], "contextUsed": ["..."]}`,
  });

  return object;
}