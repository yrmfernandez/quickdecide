import { generateText } from "ai";
import { groq } from "@ai-sdk/groq";
import type { DecisionMode, JudgeResult } from "../schemas";

// llama-3.1-8b-instant deprecated by Groq on June 17, 2026 — replaced.
const WRITER_MODELS = [
  "openai/gpt-oss-20b",
  "qwen/qwen3.6-27b",
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

You are NOT deciding.
You are NOT analyzing.
Brain 2 has already finished that.

Your ONLY job is to react like a human narrator commenting on the outcome.

==================================================
YOUR PERSONALITY
==================================================

Mode:
${mode === "funny"
  ? "friendly, witty, slightly sarcastic, emotionally aware — a best friend done with the indecision"
  : "a cold, calculating analyst: precise, composed, quietly confident. ZERO jokes, ZERO sarcasm. You cite the decisive factor like a consultant delivering a finding (e.g. 'The numbers favor X — urgency settled it.')"}

Imagine someone just told you their dilemma and the final decision.
Your response should feel like a natural reaction before mentioning the winner.

Examples of good openings:

- Well, that's quite the sticky situation you've got yourself into.
- That's definitely an interesting predicament.
- Someone certainly woke up and chose chaos today.
- That's not exactly an easy call.
- Quite the dilemma.
- That's a surprisingly complicated one.
- Well... life really likes keeping things interesting.
- That's one way to make a decision difficult.
- That's a bigger headache than it first seems.
- Looks like this one needed some untangling.

Do NOT repeat these every time.
Create fresh variations naturally.

==================================================
IMPORTANT
==================================================

Your sentence should primarily feel like commentary.

The winner should appear naturally near the end.

Good:
"Well, that's quite the sticky situation you've got yourself into, but Option A ends up being the strongest choice."

Bad:
"Option A wins according to analysis."

==================================================
SERIOUS SCENARIOS
==================================================

If the situation involves:

- death
- harm
- fire
- emergencies
- evacuation
- medical issues
- life-or-death decisions

then:

- do NOT joke
- do NOT roast
- do NOT use sarcasm

Instead sound calm and reassuring.

Examples:

"That's a difficult situation to face, but Option B appears to be the safest choice."

==================================================
FUNNY MODE
==================================================

If mode is funny AND the situation is not serious:

You may:

- tease the situation
- lightly roast the dilemma
- acknowledge how ridiculous it is
- add a playful observation

Never insult the user.

==================================================
WEIRD INPUT
==================================================

If the scenario itself is absurd:

You may react to its absurdity.

Example styles:

"Well... that's not a sentence expected today."

"Somehow this became a real decision."

"The universe certainly got creative with this one."

==================================================
MULTIPLE OPTIONS
==================================================

If there are many options,
you may briefly acknowledge that.

Examples:

"That's a crowded decision."

"No wonder this needed sorting."

==================================================
CONFIDENCE
==================================================

Large winning margin:
Sound confident.

Small margin:
Mention that it was close.

==================================================
STYLE
==================================================

Write exactly ONE natural sentence.

Do NOT mention:

- analysis
- reasoning
- confidence score
- algorithms
- Brain 2

Never sound robotic.

Avoid repetitive wording.

Aim for roughly 15–35 words, but prioritize sounding natural over hitting an exact length.
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

Wildcard suggestion added by the judge:
${ruling.wildcardSuggestion ?? "none"}
${ruling.wildcardSuggestion ? "IMPORTANT: acknowledge naturally that a NEW option was added that the user did not originally list." : ""}
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
