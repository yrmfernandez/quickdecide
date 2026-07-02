"""
Weighted Math Scoring Engine.

Applies penalty/boost offsets to each candidate option based on:
  - Time Evaluator Engine: penalizes labor-intensive options when time is Low,
    boosts fast/pre-packaged options.
  - Budget Alignment Engine: penalizes premium options at low budget tiers,
    rewards budget-friendly ones.

This is intentionally lightweight (keyword heuristics) rather than a trained
model, matching the "lightweight Python architecture" described in the deck.
Swap in real signals (prices, prep time, etc.) as the project matures.
"""

import random

LABOR_KEYWORDS = ["cook", "make", "prep", "bake", "diy", "homemade", "grill"]
FAST_KEYWORDS = ["delivery", "order", "takeout", "instant", "ready", "pre-packaged", "microwave"]
PREMIUM_KEYWORDS = ["premium", "fancy", "steak", "sushi", "fine dining", "delivery"]
BUDGET_KEYWORDS = ["pantry", "leftover", "cheap", "instant", "home", "budget"]

TIME_WEIGHTS = {"Low": -1.5, "Medium": 0.0, "High": 0.5}
BUDGET_WEIGHTS = {"$": -1.5, "$$": 0.0, "$$$": 0.5}


def _keyword_hits(text: str, keywords: list[str]) -> int:
    text = text.lower()
    return sum(1 for kw in keywords if kw in text)


def score_options(options: list[str], time_pref: str, budget_pref: str) -> list[tuple[str, float]]:
    """Return options sorted descending by score, highest score wins."""
    scores = []
    for opt in options:
        base = random.uniform(0, 0.3)  # small tie-breaking noise

        # Time Evaluator Engine
        if time_pref == "Low":
            base -= 1.0 * _keyword_hits(opt, LABOR_KEYWORDS)
            base += 1.0 * _keyword_hits(opt, FAST_KEYWORDS)
        elif time_pref == "High":
            base += 0.3 * _keyword_hits(opt, LABOR_KEYWORDS)  # slow cooking is fine, even nice

        # Budget Alignment Engine
        if budget_pref == "$":
            base -= 1.0 * _keyword_hits(opt, PREMIUM_KEYWORDS)
            base += 1.0 * _keyword_hits(opt, BUDGET_KEYWORDS)
        elif budget_pref == "$$$":
            base += 0.3 * _keyword_hits(opt, PREMIUM_KEYWORDS)

        scores.append((opt, base))

    return sorted(scores, key=lambda pair: pair[1], reverse=True)
