import { groq } from "@ai-sdk/groq";
import { z } from "zod";
import { ClassifierSchema, type ClassifierResult } from "../schemas";
import { SLIDER_META, SLIDER_IDS, type SliderId } from "../sliders";
import { generateObjectSafe } from "../ai-utils";

const RawClassifierSchema = ClassifierSchema.extend({
  sliders: z
    .array(
      z.object({
        id: z.string(),
        label: z.string().min(1).transform((value) => value.slice(0, 48)),
        low: z.string().min(1).transform((value) => value.slice(0, 48)),
        high: z.string().min(1).transform((value) => value.slice(0, 48)),
      })
    )
    .length(2),
});

const SLIDER_ID_ALIASES: Record<string, SliderId> = {
  budget: "budget_pressure",
  cost: "budget_pressure",
  cost_budget: "budget_pressure",
  money: "budget_pressure",
  price: "budget_pressure",
  expense: "budget_pressure",
  power: "energy_level",
  power_consumption: "energy_level",
  stamina: "energy_level",
  effort: "energy_level",
  time: "time_commitment",
  speed: "time_commitment",
  duration: "time_commitment",
  mental: "mental_bandwidth",
  cognitive: "mental_bandwidth",
  focus: "mental_bandwidth",
  social: "social_battery",
  people: "social_battery",
  health: "health_focus",
  healthy: "health_focus",
  adventure: "adventure_appetite",
  novelty: "adventure_appetite",
  comfort: "comfort_craving",
  cozy: "comfort_craving",
  risk: "risk_tolerance",
  safety: "risk_tolerance",
  urgent: "urgency",
  deadline: "urgency",
  rush: "urgency",
  future: "long_term_payoff",
  long_term: "long_term_payoff",
  peer: "social_pressure",
  reputation: "social_pressure",
  indulge: "indulgence",
  treat: "indulgence",
  guilt: "indulgence",
  fresh: "novelty_seeking",
  variety: "novelty_seeking",
};

function normalizeSliderId(rawId: string, used: Set<SliderId>): SliderId {
  if (SLIDER_IDS.includes(rawId as SliderId) && !used.has(rawId as SliderId)) {
    return rawId as SliderId;
  }

  const normalized = rawId.toLowerCase().replace(/[^a-z0-9]+/g, "_");
  const alias = Object.entries(SLIDER_ID_ALIASES).find(([key]) => normalized.includes(key))?.[1];
  if (alias && !used.has(alias)) return alias;

  return SLIDER_IDS.find((id) => !used.has(id)) ?? SLIDER_IDS[0];
}

/**
 * Brain 1 — The Classifier (Llama-3.1-8B, ultra-fast).
 *
 * Reads the raw brain dump and, via strict Zod structured output:
 * 1. extracts the choices into a clean array
 * 2. selects two context-appropriate sliders and invents dynamic labels for them
 * 3. flags if a walking vs. transit toggle is needed
 */
export async function classify(rawText: string): Promise<ClassifierResult> {
  // We only show the model the IDs and standard labels so it knows the general concept
  const sliderCatalog = SLIDER_IDS.map(
    (id) =>
      `- ${id}: "${SLIDER_META[id].label}" | canonical LOW (0) = "${SLIDER_META[id].low}" | canonical HIGH (100) = "${SLIDER_META[id].high}"`
  ).join("\n");

  const rawObject = await generateObjectSafe({
    models: [groq("openai/gpt-oss-20b"), groq("qwen/qwen3.6-27b")],
    schema: RawClassifierSchema,
    system: `
    You are Brain 1 of QuickDecide.

    Your job is to convert a user's messy decision into structured data for later AI systems.

    You DO NOT decide what the user should choose.
    You DO NOT explain your reasoning.
    You DO NOT invent information.

    If the prompt is weird, hypothetical, chaotic, multilingual, or written like a stream of consciousness,
    extract the literal decision options first. Do not improve the user's options into different actions.
    Brain 2 can analyze complexity later; your job is faithful parsing.

    ==================================================
    STEP 1 — EXTRACT THE CHOICES
    ==================================================

    Read the user's text carefully.

    Extract every decision option exactly as the user intended.

    Rules:

    • Never invent context.
    • Never invent locations.
    • Never invent products.
    • Never invent actions.
    • Never invent conditions.
    • Never infer missing information.

    Examples

    Input:
    banana, pancakes, strawberries

    Correct:
    - Banana
    - Pancakes
    - Strawberries

    Incorrect:
    - Buy frozen bananas
    - Banana pancakes at a diner
    - Go strawberry picking

    --------------------------

    Input:
    ChatGPT or Claude

    Correct:
    - ChatGPT
    - Claude

    Incorrect:
    - Buy ChatGPT Plus
    - Use Claude 4

    --------------------------

    Input:
    Go now or wait until Gemini Pro comes back

    Correct:
    - Go now
    - Wait for Gemini Pro

    Incorrect:
    - Go immediately
    - Wait

    --------------------------

    Input:
    Watch Netflix or study

    Correct:
    - Watch Netflix
    - Study

    Incorrect:
    - Relax
    - Finish homework

    Preserve important wording whenever possible.

    Keep each choice concise (roughly 2–7 words). Extract up to 8 distinct choices; if the user lists more, keep the 8 most distinct.

    If the user writes "A or B or C", extract A, B, and C as separate choices.
    If the user writes "should I X or Y", extract "X" and "Y".
    If the user implies a tie or says both options seem the same, still extract the options normally.

    Once the choices are extracted,
    consider them FINAL.

    Do not modify them during later steps.

    ==================================================
    STEP 2 — CHOOSE SLIDER IDS
    ==================================================

    Select EXACTLY TWO different slider IDs that best describe the biggest tradeoffs.

    Choose ONLY from this catalog.

    ${sliderCatalog}

    Rules

    • Copy the IDs EXACTLY.
    • Never invent IDs.
    • Never rename IDs.
    • Never create aliases.
    • Choose the two dimensions that would best help compare ALL choices.

    ==================================================
    STEP 3 — CREATE THE UI TEXT
    ==================================================

    Now that the choices and slider IDs are locked,
    rewrite ONLY the visible slider text.

    For each slider return:

    label
    low
    high

    Rules

    • Keep the ID unchanged.
    • CRITICAL DIRECTION RULE: your custom "low" text MUST mean the same as the canonical LOW,
      and your custom "high" MUST mean the same as the canonical HIGH. NEVER invert the direction —
      Brain 2 interprets 0 as the canonical LOW meaning and 100 as the canonical HIGH meaning.
    • The labels should feel personal and relevant.
    • The labels should make sense for THIS dilemma.
    • They may be humorous.
    • They should sound like something a human would naturally say.

    Examples

    Generic

    Comfort Craving

    Better

    Breakfast Comfort

    Low
    Fresh & Fruity

    High
    Warm & Filling

    --------------------------

    Generic

    Budget Pressure

    Better

    Money Today

    Low
    Treat Yourself

    High
    Save Every Dollar

    --------------------------

    Generic

    Energy Level

    Better

    How Much Effort?

    Low
    Bare Minimum

    High
    Let's Do This

    IMPORTANT

    You may ONLY rewrite:

    label
    low
    high

    You may NEVER rewrite:

    choices
    IDs

    ==================================================
    STEP 4 — MOBILITY
    ==================================================

    Set requires_mobility_toggle to TRUE only when the user must physically travel between places.

    Examples

    Restaurant A vs Restaurant B
    → true

    Walk vs MRT
    → true

    Pizza vs Burger
    → false

    Study vs Netflix
    → false

    Laptop A vs Laptop B
    → false

    ==================================================
    FINAL RULES
    ==================================================

    Return ONLY valid JSON.

    Do not explain anything.

    Do not output markdown.

    Do not invent information that was not written by the user.

    Creativity is allowed ONLY for:

    • slider label
    • low
    • high

    Everything else must remain faithful to the user's original input.
  `,
    prompt: rawText,
    shapeHint: `{
      "choices": [
        "literal user choice",
        "literal user choice"
      ],
      "sliders": [
        {
          "id": "${SLIDER_IDS[0]}",
          "label": "personalized slider title",
          "low": "low endpoint",
          "high": "high endpoint"
        },
        {
          "id": "${SLIDER_IDS[1]}",
          "label": "personalized slider title",
          "low": "low endpoint",
          "high": "high endpoint"
        }
      ],
      "requires_mobility_toggle": false
    }`,
  });

  const used = new Set<SliderId>();
  const sliders = rawObject.sliders.map((slider) => {
    const id = normalizeSliderId(slider.id, used);
    used.add(id);
    return { ...slider, id };
  });

  // Final strict parse keeps the rest of the app working with the exact contract.
  return ClassifierSchema.parse({ ...rawObject, sliders });
}
