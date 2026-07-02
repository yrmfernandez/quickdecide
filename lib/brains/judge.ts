import { generateText, stepCountIs } from "ai";
import { groq } from "@ai-sdk/groq";
import { JudgeSchema, type JudgeResult } from "../schemas";
import { SLIDER_META, type SliderId } from "../sliders";
import { getWeather, getTimeContext } from "../tools";
import { generateObjectSafe } from "../ai-utils";
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
  }[]; // value: 0-100
  city: string | null; // from x-vercel-ip-city, may be null locally
}

function normalizeReadableList(items: string[], maxItems = 4): string[] {
  return items
    .flatMap((item) =>
      item
        .replace(/^[\s•*-]+/, "")
        .split(/(?<=[.!?])\s+/)
        .map((part) => part.trim())
    )
    .filter((item) => item.length > 0)
    .filter((item) => !/non[- ]?existent|fake tool|web search|search tool/i.test(item))
    .slice(0, maxItems);
}

/**
 * Brain 2 — The Judge (Llama-3.3-70B, the heavy lifter).
 *
 * Runs an autonomous ReAct loop with the free toolbelt (weather + time),
 * weighs each choice against the user's slider values, and locks in a winner.
 * A final structuring pass guarantees clean JSON via Zod.
 */
export async function judge(input: JudgeInput): Promise<JudgeResult> {
  
  console.log("========== BRAIN 2 START ==========");
  console.log({
    rawText: input.rawText,
    choices: input.choices,
    sliders: input.sliders,
    city: input.city,
  });

  const sliderContext = input.sliders
    .map((s) => {
      const meta = SLIDER_META[s.id];
      const label = s.label ?? meta.label;
      const low = s.low ?? meta.low;
      const high = s.high ?? meta.high;
      return `- ${label}: ${s.value}/100 ("${low}" -> "${high}"). Canonical dimension: ${meta.label}. ${meta.judgeHint}`;
    })
    .join("\n");

  const result = await generateText({
    model: groq("openai/gpt-oss-120b"),
    tools: { getWeather, getTimeContext },
    stopWhen: stepCountIs(5),
    system: `You are Brain 2 of QuickDecide.

      You are an autonomous decision judge.

      Brain 1 has already extracted the user's choices and identified the relevant decision criteria.

      Your responsibility is to make the highest-quality judgment possible using the available information.

      ==================================================
      OBJECTIVE
      ==================================================

      Reduce uncertainty before making a decision.

      Your goal is not to sound intelligent.

      Your goal is to make the most reliable decision possible.

      Whenever uncertainty exists, prefer evidence over assumptions.

      ==================================================
      WORKFLOW
      ==================================================

      Always reason in this order.

      1. Understand the user's dilemma.

      2. Review the extracted choices provided by the user.

      3. Evaluate whether additional objective evidence could materially change the outcome (example: checking weather for a travel or jogging decision, or checking time if such tasks are probable).

      4. If yes, use the available tools.

      5. Evaluate every choice against every slider.

      6. Compare the tradeoffs.

      7. Score every choice.

      8. Select exactly one winner.

      ==================================================
      SLIDERS
      ==================================================

      The following sliders represent USER PREFERENCES.

      ${sliderContext}

      Interpret slider values as:

      0
      The user strongly prefers the LOW endpoint.

      50
      Neutral.

      100
      The user strongly prefers the HIGH endpoint.

      Evaluate every option against every slider independently before deciding.

      ==================================================
      EVIDENCE
      ==================================================

      You may use information from:

      • the user's original request
      • the extracted choices
      • slider preferences
      • verified tool results
      • stable general knowledge

      Anything else should be treated as unknown.

      ==================================================
      GENERAL KNOWLEDGE
      ==================================================

      You may use stable facts that are generally true regardless of time or location.

      If a comparison depends on unknown characteristics of the choices, acknowledge the uncertainty instead of inventing differences.

      Do not fabricate distinguishing features simply because a comparison is required.

      Examples include:

      • typical food preparation
      • common transportation characteristics
      • basic product characteristics
      • common human habits

      Do NOT invent facts that depend on:

      • time
      • location
      • availability
      • schedules
      • prices
      • weather
      • traffic
      • the user's mood
      • the user's plans

      Use tools whenever those facts could materially improve the decision.

      ==================================================
      UNCERTAINTY
      ==================================================

      When important information is missing, do not invent it.

      Instead:

      • acknowledge the uncertainty

      • score conservatively

      • explain what information is missing

      A cautious judgment is better than a confident hallucination.

      ==================================================
      TOOLS
      ==================================================

      The ONLY available tools are:

      - getWeather
      - getTimeContext

      Never mention, request, or pretend to use any other tool.

      Treat tools as sources of objective evidence.

      Before making your judgment ask yourself:

      "Would additional evidence reasonably change this decision?"

      If yes, use the appropriate tool.
      If no, continue without tools.

      Do not call tools merely because they exist.
      Do not ignore tools when they would significantly reduce uncertainty.
      You MUST NOT call any other tool under any circumstances.
      If a tool is not listed, it does not exist.

      ==================================================
      SCORING
      ==================================================

      Do not decide the winner immediately.

      Instead evaluate the decision in two stages.

      Stage 1

      Evaluate every slider independently.

      For each slider:

      • determine which choice performs best

      • determine which performs worst

      • explain the tradeoff

      Stage 2

      Combine all slider evaluations.

      Incorporate any verified external evidence.

      Assign every choice a score from 0–100.

      Only after every choice has been evaluated should you determine the final winner.

      Never choose a winner first and invent reasons afterward.

      ==================================================
      OUTPUT
      ==================================================

      Return:

      • exactly one winner
      • one score for every choice
      • one concise explanation per choice
      • contextUsed
      • reasoningUsed

      contextUsed

      Contains ONLY:

      • verified tool results
      • current time
      • current weather
      • current location
      • other objective external facts

      reasoningUsed

      Contains ONLY:

      • slider effects
      • tradeoffs
      • comparative reasoning

      Never mix them.

      The winner MUST exactly match one of the provided choices.
      `,
    prompt: `Original user request:
      ${input.rawText}

      Choices:

      ${input.choices.map((c, i) => `${i + 1}. ${c}`).join("\n")}

      Make your judgment following the workflow in the system prompt.
      `,
  });

  const text = result.text;
  console.log("\n===== RAW JUDGE OUTPUT =====");
  console.log(text);
  const actualContext = formatActualToolContext(
    result.steps.flatMap((step) => step.toolResults)
  );

  // Structuring pass: convert the judge's free-text ruling into strict JSON.
  const object = await generateObjectSafe({
    model: groq("openai/gpt-oss-120b"),
    schema: JudgeSchema,
    system: `
      Convert the judge's ruling into JSON.

      Rules:

      - Copy the winner exactly.
      - Copy every score exactly.
      - Copy every note faithfully.
      - Do not reinterpret.
      - Do not invent.
      - contextUsed may be empty because the application will replace it with actual executed tool results.
      - reasoningUsed contains only reasoning.
      `,
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

  return {
    ...object,
    contextUsed: actualContext,
    reasoningUsed: normalizeReadableList(object.reasoningUsed ?? []),
  };
}
