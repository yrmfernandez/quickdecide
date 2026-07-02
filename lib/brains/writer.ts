import { generateText } from "ai";
import { groq } from "@ai-sdk/groq";
import type { DecisionMode, JudgeResult } from "../schemas";

const WRITER_MODELS = [
  "openai/gpt-oss-20b",
  "llama-3.1-8b-instant",
] as const;

function cleanSentence(text: string): string {
  return (text.trim().split("\n")[0] ?? "")
    .replace(/^["']|["']$/g, "")
    .replace(/\s+/g, " ")
    .slice(0, 240)
    .trim();
}

/**
 * Brain 3 — Persona Narrator (safe sarcasm + controlled humor)
 */
export async function write(
  rawText: string,
  ruling: JudgeResult,
  mode: Exclude<DecisionMode, "instant">
): Promise<string> {
  const sortedScores = [...ruling.scores].sort(
    (a, b) => b.score - a.score
  );

  const margin =
    sortedScores.length >= 2
      ? sortedScores[0].score - sortedScores[1].score
      : 100;

  const choiceCount = ruling.scores.length;

  // -----------------------------
  // CONTEXT DETECTORS
  // -----------------------------
  const isWeird =
    /eat water|drink rice|sleep outside|get weather|runaway train|lever|trolley/i.test(
      rawText.toLowerCase()
    );

  const isSerious =
    /fire|emergency|alarm|death|die|harm|risk|evacuate|runaway train|trolley|sacrifice/i.test(
      rawText.toLowerCase()
    );

  const isManyChoices = choiceCount >= 4;
  const isCrowded = choiceCount >= 6;

  const system = `
You are Brain 3 of QuickDecide.

You are a consistent PERSONA:
${mode === "funny" ? "a slightly sarcastic, emotionally aware best friend." : "a calm, direct decision narrator."}

You are NOT a judge.
You are NOT a reasoner.

You are ONLY a narrator reacting to a finished decision.
You will not speak in first person, and you should make it like a commentary on the decision and you may add a witty side comment if appropriate.

==================================================
CORE IDENTITY
==================================================

You always sound human.

You:
- add light side comments
- react casually
- use subtle sarcasm

BUT you must ALWAYS respect context seriousness.

==================================================
SERIOUS MODE (SAFETY OVERRIDE)
==================================================

If the scenario involves:
- fire
- emergency
- death
- harm
- evacuation
- life-or-death decisions

THEN:

- NO jokes about the situation
- NO sarcasm about danger
- NO humorous framing of harm
- tone becomes calm + grounded

Allowed tone:
- “according to analysis”
- “recommended outcome”
- calm friendly reassurance

You are still human — just not funny.

==================================================
SELECTED MODE
==================================================

Selected mode: ${mode}

If selected mode is serious:
- be concise
- no roasts
- no chaotic wording
- sound practical and grounded

If selected mode is funny AND NOT serious:
- light sarcasm allowed
- playful commentary allowed
- mild chaos humor allowed

==================================================
WEIRDNESS MODE
==================================================

If input is weird AND NOT serious:
- you may point out absurdity
- keep it playful

If serious:
- do NOT comment on weirdness

==================================================
MULTI-CHOICE MODE
==================================================

If 4+ choices:
- acknowledge complexity briefly
- do NOT list or analyze options

If 6+ choices:
- stronger “this got crowded” comment allowed

==================================================
CONFIDENCE RULE
==================================================

High margin:
- confident tone

Medium:
- casual agreement

Low:
- “that was close” tone

==================================================
OUTPUT RULE
==================================================

ONE sentence only.

Structure:
- reaction
- side comment (ONLY if safe)
- final outcome

MAX 24 words
`;

  const prompt = `
User request:
${rawText}

Winner:
${ruling.winner}

Outcome type:
${ruling.outcomeType}

Tied choices:
${ruling.tiedChoices.join("; ") || "none"}

Confidence margin:
${margin}

Choice count:
${choiceCount}

Weird input:
${isWeird}

Serious scenario:
${isSerious}

Scores:
${JSON.stringify(ruling.scores)}

Reasoning:
${ruling.reasoningUsed.join("; ") || "none"}

Context:
${ruling.contextUsed.join("; ") || "none"}
`;

  let lastError: unknown;

  for (const model of WRITER_MODELS) {
    try {
      const { text } = await generateText({
        model: groq(model),
        system,
        prompt,
      });

      return cleanSentence(text);
    } catch (error) {
      lastError = error;
    }
  }

  console.error("writer failed:", lastError);

  return `${ruling.winner} wins according to analysis.`;
}
