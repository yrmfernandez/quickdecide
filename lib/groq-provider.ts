import { createGroq } from "@ai-sdk/groq";
import type { LanguageModelV2 } from "@ai-sdk/provider";

/**
 * Multi-key Groq provider with 24-hour rotation + automatic failover.
 *
 * WHY: a single Groq free-tier key hits daily/rate limits. By loading several
 * keys and rotating them, the app spreads load and survives one key being
 * rate-limited or timing out.
 *
 * TWO ROTATION MECHANISMS, working together:
 *
 *  1. TIME-BASED (the "alternate for 24 hrs" requirement): the *primary* key
 *     is chosen by which 24-hour window we're in since an epoch. Key 0 is
 *     primary on day 0, key 1 on day 1, ... wrapping around. This spreads the
 *     daily quota evenly across keys over a week instead of hammering key 0
 *     until it dies each day.
 *
 *  2. FAILOVER (per request): if a call throws a retryable error (timeout,
 *     429 rate limit, 5xx), the caller advances to the next key and retries.
 *     `orderedProviders()` returns every key ordered starting from today's
 *     primary, so callers can just walk the list.
 *
 * SETUP: put your keys in the environment as GROQ_API_KEY, GROQ_API_KEY_2,
 * GROQ_API_KEY_3, ... (any number). GROQ_API_KEYS="k1,k2,k3" also works as a
 * single comma-separated variable. On Vercel, add each under Settings →
 * Environment Variables.
 */

const ROTATION_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

function loadKeys(): string[] {
  const keys: string[] = [];

  // Comma-separated bundle, if provided.
  const bundle = process.env.GROQ_API_KEYS;
  if (bundle) {
    for (const k of bundle.split(",")) {
      const t = k.trim();
      if (t) keys.push(t);
    }
  }

  // Individual vars: GROQ_API_KEY, GROQ_API_KEY_2, GROQ_API_KEY_3, ...
  if (process.env.GROQ_API_KEY) keys.push(process.env.GROQ_API_KEY.trim());
  for (let i = 2; i <= 20; i++) {
    const v = process.env[`GROQ_API_KEY_${i}`];
    if (v && v.trim()) keys.push(v.trim());
  }

  // De-duplicate while preserving order.
  return [...new Set(keys.filter(Boolean))];
}

const KEYS = loadKeys();

if (KEYS.length === 0) {
  // Don't throw at import time (breaks builds); surface clearly at call time.
  console.warn(
    "[groq-provider] No Groq API keys found. Set GROQ_API_KEY (and optionally GROQ_API_KEY_2, _3, ... or GROQ_API_KEYS)."
  );
}

// One provider instance per key, created once and reused.
const PROVIDERS = KEYS.map((apiKey) => createGroq({ apiKey }));

/** Which key index is primary for the current 24h window. */
export function currentPrimaryIndex(now: number = Date.now()): number {
  if (PROVIDERS.length <= 1) return 0;
  const windowNumber = Math.floor(now / ROTATION_WINDOW_MS);
  return windowNumber % PROVIDERS.length;
}

/**
 * All providers, ordered starting from today's primary key and wrapping
 * around. Callers walk this list for failover.
 */
export function orderedProviders(): ReturnType<typeof createGroq>[] {
  if (PROVIDERS.length === 0) {
    // Fall back to a keyless provider so error messages come from the SDK
    // (clearer than a thrown "no keys" here), and builds never break.
    return [createGroq({})];
  }
  const start = currentPrimaryIndex();
  return PROVIDERS.map((_, i) => PROVIDERS[(start + i) % PROVIDERS.length]);
}

export function keyCount(): number {
  return PROVIDERS.length;
}

/**
 * Drop-in replacement for the default `groq(id)` helper, but bound to today's
 * primary key. Use this for the *first* attempt; use orderedProviders() when
 * you want to walk every key for failover (see generateTextSafe/ObjectSafe).
 */
export function groq(modelId: string): LanguageModelV2 {
  return orderedProviders()[0](modelId);
}

/** Build the same model id across every key, in failover order. */
export function modelAcrossKeys(modelId: string): LanguageModelV2[] {
  return orderedProviders().map((provider) => provider(modelId));
}

/**
 * Build a model id across every key AND apply a per-model transform (e.g. the
 * reasoning-format middleware each brain uses). Returns one ready-to-use
 * LanguageModel per key, ordered by today's primary first.
 *
 * The brains use this so a single logical "model in the chain" actually
 * expands into [that model on key0, on key1, ...] for transparent failover.
 */
export function wrapAcrossKeys(
  modelId: string,
  wrap: (base: LanguageModelV2) => LanguageModelV2
): LanguageModelV2[] {
  return orderedProviders().map((provider) => wrap(provider(modelId)));
}
