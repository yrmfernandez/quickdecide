/**
 * The Master Slider List.
 *
 * Brain 1 (the Classifier) is only allowed to pick slider IDs from this list —
 * the Zod schema enforces it as a strict enum, so the model is physically
 * incapable of hallucinating a slider we haven't designed.
 */

export const SLIDER_IDS = [
  "mental_bandwidth",
  "time_commitment",
  "budget_pressure",
  "energy_level",
  "social_battery",
  "health_focus",
  "adventure_appetite",
  "comfort_craving",
  "risk_tolerance",
  "urgency",
  "long_term_payoff",
  "social_pressure",
  "indulgence",
  "novelty_seeking",
] as const;

export type SliderId = (typeof SLIDER_IDS)[number];

export interface SliderMeta {
  id: SliderId;
  label: string;
  low: string; // label at value 0
  high: string; // label at value 100
  judgeHint: string; // how Brain 2 should interpret the value
}

export const SLIDER_META: Record<SliderId, SliderMeta> = {
  mental_bandwidth: {
    id: "mental_bandwidth",
    label: "Mental Bandwidth",
    low: "Brain is fried",
    high: "Fully caffeinated",
    judgeHint:
      "Low = pick the option requiring the least thinking/planning. High = complex options are fine.",
  },
  time_commitment: {
    id: "time_commitment",
    label: "Time Commitment",
    low: "Need it now",
    high: "Got all day",
    judgeHint:
      "Low = heavily penalize slow or effortful options. High = duration is not a factor.",
  },
  budget_pressure: {
    id: "budget_pressure",
    label: "Budget Pressure",
    low: "Wallet is crying",
    high: "Money is no object",
    judgeHint:
      "Low = penalize expensive options hard, reward free/cheap ones. High = ignore cost.",
  },
  energy_level: {
    id: "energy_level",
    label: "Energy Level",
    low: "Running on fumes",
    high: "Could run a marathon",
    judgeHint:
      "Low = penalize physically demanding options. High = active options get a boost.",
  },
  social_battery: {
    id: "social_battery",
    label: "Social Battery",
    low: "Do not perceive me",
    high: "Life of the party",
    judgeHint:
      "Low = favor solo/low-interaction options. High = favor social options.",
  },
  health_focus: {
    id: "health_focus",
    label: "Health Focus",
    low: "Treat yourself",
    high: "Temple mode",
    judgeHint:
      "Low = indulgent options are fine. High = favor the healthier option.",
  },
  adventure_appetite: {
    id: "adventure_appetite",
    label: "Adventure Appetite",
    low: "Stick to the classics",
    high: "Surprise me",
    judgeHint:
      "Low = favor familiar/safe options. High = favor novel or risky options.",
  },
  risk_tolerance: {
    id: "risk_tolerance",
    label: "Risk Tolerance",
    low: "Play it safe",
    high: "Roll the dice",
    judgeHint:
      "Low = penalize options with uncertain outcomes. High = risky/uncertain options are acceptable or even preferred.",
  },
  urgency: {
    id: "urgency",
    label: "Urgency",
    low: "No rush at all",
    high: "Needed yesterday",
    judgeHint:
      "Low = deadlines don't matter, favor quality. High = favor whatever resolves the situation fastest.",
  },
  long_term_payoff: {
    id: "long_term_payoff",
    label: "Long-term Payoff",
    low: "Tonight only matters",
    high: "Future me matters",
    judgeHint:
      "Low = optimize for immediate satisfaction. High = favor the option with the best long-term consequences.",
  },
  social_pressure: {
    id: "social_pressure",
    label: "Social Pressure",
    low: "Nobody's watching",
    high: "Everyone will know",
    judgeHint:
      "Low = ignore what others think. High = favor the option that looks best to other people involved.",
  },
  indulgence: {
    id: "indulgence",
    label: "Indulgence",
    low: "Discipline mode",
    high: "Treat yourself",
    judgeHint:
      "Low = favor the responsible/restrained option. High = favor the pleasurable, indulgent option guilt-free.",
  },
  novelty_seeking: {
    id: "novelty_seeking",
    label: "Novelty Seeking",
    low: "The usual, please",
    high: "Something new",
    judgeHint:
      "Low = favor familiar, proven options. High = favor options the user hasn't tried before.",
  },
  comfort_craving: {
    id: "comfort_craving",
    label: "Comfort Craving",
    low: "Efficiency mode",
    high: "Maximum coziness",
    judgeHint:
      "Low = practical wins. High = favor the warm, cozy, soothing option.",
  },
};
