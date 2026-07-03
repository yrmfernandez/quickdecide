import { generateText, wrapLanguageModel, defaultSettingsMiddleware } from "ai";
import { groq } from "@ai-sdk/groq";
import type { DecisionMode, JudgeResult } from "../schemas";

// Helper to safely wrap models with minimal reasoning overhead
function createWriterModel(id: string, effort: "default" | "low") {
  return wrapLanguageModel({
    model: groq(id),
    middleware: defaultSettingsMiddleware({
      settings: {
        providerOptions: {
          groq: {
            // MUST be "parsed" so the AI SDK can intercept the thoughts for our console.log
            reasoningFormat: "parsed",
            reasoningEffort: effort,
          },
        },
      },
    }),
  });
}

// Map the models to low/default reasoning states so they understand context but stay fast
const WRITER_MODELS = [
  createWriterModel("openai/gpt-oss-20b", "low"),    // GPT-OSS minimum is "low"
  createWriterModel("qwen/qwen3.6-27b", "default"),  // Qwen enabled
];

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
Basically take a look at the User request and the ruling, and react like a human would. 
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

If it is a tie, you may acknowledge that the options are effectively equal.

Good:
"Well, that's quite the sticky situation you've got yourself into, but Option A ends up being the strongest choice."

Bad:
"Option A wins according to analysis."

==================================================
SERIOUS SCENARIOS
==================================================

You are the emotional intelligence of this system. 
Even if the "Serious scenario" flag below says "false", if you read the user's request and recognize it involves:
- death, dying, or fatal outcomes
- self-harm or harming others
- extreme physical danger (e.g., getting hit by trains, jumping off buildings)
- medical emergencies

...you MUST autonomously OVERRIDE the mode and act completely serious. 

When overriding for a serious scenario:
- DO NOT joke.
- DO NOT roast or use sarcasm.
- Sound calm, empathetic, and clinical. 
- Acknowledge that the choices are grim or dangerous before stating the winner.

Examples:
"That is a very dangerous situation, but Option B is technically the safer path."
"I sincerely hope this is purely hypothetical, but Option A is the logical choice."

==================================================
FUNNY MODE
==================================================

If mode is funny AND you have independently verified the situation is NOT dangerous/fatal:

You may:
- tease the situation
- lightly roast the dilemma
- acknowledge how ridiculous it is
- add a playful observation

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
SERIOUS SCENARIOS vs. ABSURD CONTEXT
==================================================

1. ABSURDITY OVERRIDES DANGER: If you determine the scenario is absurd, fictional, or humorous (like runaway hamsters or strange dimensions), the "Serious scenario" flag is IRRELEVANT. You MUST use the User's requested Mode (Funny or Serious).

2. ONLY apply Serious Tone if the scenario is a real-world, non-fictional, life-threatening emergency (e.g., actual fire, actual medical crisis, actual physical violence).

If the scenario is fictional or absurd, you must be Witty, Sarcastic, or Playful if Mode is "funny." 
DO NOT default to serious just because the "Serious scenario" flag is true for a fantasy/absurd prompt.

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
      const result = await generateText({
        model, 
        system,
        prompt,
      });

      // 👇 LOGGING BLOCK ADDED HERE 👇
      console.log("\n🎭 === WRITER'S INTERNAL REASONING ===");
      const rawReasoning = result.reasoning;
      // Depending on the AI SDK version, reasoning is either a string or an array of parts
      const cleanReasoning = Array.isArray(rawReasoning) 
        ? rawReasoning.map((r: any) => r.text || "").join("\n") 
        : rawReasoning;
      console.log(cleanReasoning || "(No reasoning tokens generated)");
      
      console.log("\n💬 === WRITER'S FINAL RAW TEXT ===");
      console.log(result.text);
      console.log("=====================================\n");
      // 👆 ======================== 👆

      return cleanSentence(result.text);
    } catch (error) {
      lastError = error;
    }
  }

  console.error("writer failed:", lastError);

  return `${ruling.winner} wins according to analysis.`;
}