"use server";

import { headers } from "next/headers";
import { classify } from "@/lib/brains/classifier";
import { judge } from "@/lib/brains/judge";
import { write } from "@/lib/brains/writer";
import { runMonobrain } from "@/lib/brains/monolith";
import type { ClassifierResult, DecisionMode, ModelChoice, Verdict } from "@/lib/schemas";
import type { SliderId } from "@/lib/sliders";

/**
 * Server Actions keep the GROQ_API_KEY strictly server-side —
 * the browser never sees a key, an endpoint, or a prompt.
 */


/** Retry transient failures once, then translate errors into human language. */
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (first) {
    // brief backoff, then one more attempt — most Groq hiccups are transient
    await new Promise((r) => setTimeout(r, 400));
    try {
      return await fn();
    } catch {
      throw first;
    }
  }
}

function friendlyError(e: unknown, fallback: string): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/rate.?limit|429|too many/i.test(msg))
    return "The AI lanes are jammed right now — wait a few seconds and try again.";
  if (/401|invalid api key|unauthorized/i.test(msg))
    return "Server configuration issue with the AI key. The site owner needs to check it.";
  if (/timeout|aborted|econnreset|fetch failed|network/i.test(msg))
    return "Network hiccup reaching the AI. Try again in a moment.";
  if (/decommission|model.*(not.*(found|exist)|unavailable)/i.test(msg))
    return "An AI engine was retired upstream — a backup took over. Try again.";
  console.error("unmapped AI error:", msg);
  return fallback;
}

export async function analyzeAction(rawText: string): Promise<
  | { ok: true; data: ClassifierResult }
  | { ok: false; error: string }
> {
  const trimmed = rawText.trim();
  if (trimmed.length < 8) {
    return { ok: false, error: "Give me a little more to work with — what are the options?" };
  }
  if (trimmed.length > 1000) {
    return { ok: false, error: "That's a novel. Keep it under 1,000 characters — the receipt is only so long." };
  }

  try {
    const data = await withRetry(() => classify(trimmed));
    return { ok: true, data };
  } catch (e) {
    console.error("classify failed:", e);
    return {
      ok: false,
      error: friendlyError(e, "Couldn't parse that one — try rephrasing your options a little."),
    };
  }
}

export async function decideAction(input: {
  rawText: string;
  choices: string[];
  sliders: {
    id: SliderId;
    value: number;
    label?: string;
    low?: string;
    high?: string;
  }[];
  mode: Exclude<DecisionMode, "instant">;
  modelChoice: ModelChoice;
  wildcardAllowed: boolean;
  mobility?: "transit" | "walking";
}): Promise<{ ok: true; data: Verdict } | { ok: false; error: string }> {
  if (input.choices.length < 2) {
    return { ok: false, error: "Need at least two choices to judge." };
  }

  // Invisible location routing: no GPS popup, just Vercel's IP headers.
  const h = await headers();
  const city = h.get("x-vercel-ip-city")
    ? decodeURIComponent(h.get("x-vercel-ip-city")!)
    : null;

  try {
    const ruling = await withRetry(() => judge({ ...input, city }));
    const witty = await withRetry(() => write(input.rawText, ruling, input.mode));

    return {
      ok: true,
      data: {
        winner: ruling.winner,
        outcomeType: ruling.outcomeType,
        tiedChoices: ruling.tiedChoices,
        wildcardSuggestion: ruling.wildcardSuggestion ?? null,
        mode: input.mode,
        wildcardAllowed: input.wildcardAllowed,
        witty,
        scores: ruling.scores,
        contextUsed: ruling.contextUsed,
        reasoningUsed: ruling.reasoningUsed,
      },
    };
  } catch (e) {
    console.error("judge/writer failed:", e);
    return {
      ok: false,
      error: friendlyError(e, "The judge fumbled mid-ruling. Hit decide again — it usually lands on retry."),
    };
  }
}

export async function instantDecideAction(
  rawText: string,
  input?: {
    modelChoice?: ModelChoice;
    wildcardAllowed?: boolean;
  }
): Promise<
  | { ok: true; data: Verdict }
  | { ok: false; error: string }
> {
  const trimmed = rawText.trim();
  if (trimmed.length < 8) {
    return { ok: false, error: "Give me a little more to work with — what are the options?" };
  }
  if (trimmed.length > 1000) {
    return { ok: false, error: "That's a novel. Keep it under 1,000 characters — the receipt is only so long." };
  }

  // Invisible location routing for the Monolith ReAct loop
  const h = await headers();
  const city = h.get("x-vercel-ip-city")
    ? decodeURIComponent(h.get("x-vercel-ip-city")!)
    : null;

  try {
    // runMonobrain returns an object perfectly shaped like Verdict
    const data = await withRetry(() => runMonobrain({
      rawText: trimmed,
      city,
      modelChoice: input?.modelChoice ?? "balanced",
      wildcardAllowed: input?.wildcardAllowed ?? false,
    }));
    return { ok: true, data };
  } catch (e) {
    console.error("monobrain failed:", e);
    return {
      ok: false,
      error: friendlyError(e, "Instant mode tripped over itself. One more click usually does it."),
    };
  }
}
