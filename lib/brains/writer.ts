import { generateText } from "ai";
import { groq } from "@ai-sdk/groq";
import type { JudgeResult } from "../schemas";

/**
 * Brain 3 — The Writer (Llama-3.1-8B, fast and cheeky).
 *
 * Takes the dry mathematical ruling from Brain 2 and turns it into the
 * single witty, human-sounding sentence shown under the verdict.
 */
export async function write(ruling: JudgeResult): Promise<string> {
  const { text } = await generateText({
    model: groq("llama-3.1-8b-instant"),
    system: `You write ONE witty, confident sentence (max 22 words) announcing a decision verdict.
Tone: playful best friend who is done with your indecision. No hashtags, no emoji, no quotes around the sentence.
Ground the joke in the actual reasons — do not invent facts.`,
    prompt: `Winner: ${ruling.winner}
Scores & notes: ${JSON.stringify(ruling.scores)}
Real-world context used: ${ruling.contextUsed.join("; ") || "none"}`,
  });

  return text.trim().replace(/^["']|["']$/g, "");
}
