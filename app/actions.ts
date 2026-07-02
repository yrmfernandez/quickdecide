"use server";

import { headers } from "next/headers";
import { classify } from "@/lib/brains/classifier";
import { judge } from "@/lib/brains/judge";
import { write } from "@/lib/brains/writer";
import { runMonobrain } from "@/lib/brains/monolith";
import type { ClassifierResult, Verdict } from "@/lib/schemas";
import type { SliderId } from "@/lib/sliders";

/**
 * Server Actions keep the GROQ_API_KEY strictly server-side —
 * the browser never sees a key, an endpoint, or a prompt.
 */

export async function analyzeAction(rawText: string): Promise<
  | { ok: true; data: ClassifierResult }
  | { ok: false; error: string }
> {
  const trimmed = rawText.trim();
  if (trimmed.length < 8) {
    return { ok: false, error: "Give me a little more to work with — what are the options?" };
  }
  if (trimmed.length > 2000) {
    return { ok: false, error: "That's a novel. Trim it under 2,000 characters." };
  }

  try {
    const data = await classify(trimmed);
    return { ok: true, data };
  } catch (e) {
    console.error("classify failed:", e);
    const detail = e instanceof Error ? e.message.slice(0, 200) : "unknown error";
    return { ok: false, error: `Classifier error: ${detail}` };
  }
}

export async function decideAction(input: {
  rawText: string;
  choices: string[];
  sliders: { id: SliderId; value: number }[];
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
    const ruling = await judge({ ...input, city });
    const witty = await write(ruling);
    return {
      ok: true,
      data: {
        winner: ruling.winner,
        witty,
        scores: ruling.scores,
        contextUsed: ruling.contextUsed,
      },
    };
  } catch (e) {
    console.error("judge/writer failed:", e);
    const detail = e instanceof Error ? e.message.slice(0, 200) : "unknown error";
    return { ok: false, error: `Judge error: ${detail}` };
  }
}

export async function instantDecideAction(rawText: string): Promise<
  | { ok: true; data: Verdict }
  | { ok: false; error: string }
> {
  const trimmed = rawText.trim();
  if (trimmed.length < 8) {
    return { ok: false, error: "Give me a little more to work with — what are the options?" };
  }
  if (trimmed.length > 2000) {
    return { ok: false, error: "That's a novel. Trim it under 2,000 characters." };
  }

  // Invisible location routing for the Monolith ReAct loop
  const h = await headers();
  const city = h.get("x-vercel-ip-city")
    ? decodeURIComponent(h.get("x-vercel-ip-city")!)
    : null;

  try {
    // runMonobrain returns an object perfectly shaped like Verdict
    const data = await runMonobrain({ rawText: trimmed, city });
    return { ok: true, data };
  } catch (e) {
    console.error("monobrain failed:", e);
    const detail = e instanceof Error ? e.message.slice(0, 200) : "unknown error";
    return { ok: false, error: `Instant decide error: ${detail}` };
  }
}