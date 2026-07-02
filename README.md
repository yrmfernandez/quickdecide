# QuickDecide

A stateless, zero-friction AI decision engine. Not a chatbot. Dump your messy
thoughts into a text box, choose a mode, and get a definitive receipt. No
database, no login, no chat history.

## The flow

1. Brain dump: one massive text area for whatever you are stuck between.
2. Mode: Serious is default, Funny adds personality, Instant skips sliders.
3. Sliders: Serious/Funny render two custom sliders picked for the decision.
4. Receipt: winner, tie, or wildcard result with scores and concise reasoning.

## Modes

- Serious: grounded, practical, and default.
- Funny: same scoring discipline, more personality when the prompt is safe.
- Instant: one-pass decision when speed matters more than tuning.
- Wildcard: optional switch that lets the app suggest an outside answer when
  all provided choices are weak.

## The agentic pipeline

All LLM work runs in Next.js Server Actions. The browser never sees an API key
or a prompt.

| Brain | Role |
|---|---|
| Brain 1: Classifier | Extracts choices and picks two slider dimensions. |
| Brain 2: Judge | Uses tools, scores options, handles ties/wildcards, and normalizes output. |
| Brain 3: Writer | Turns the ruling into a concise mode-aware receipt sentence. |
| Monolith | Instant-mode one-pass judge with the same tie/wildcard guardrails. |

## Toolbelt

- Open-Meteo weather lookup
- Manila-aware time context
- Exact date context
- Broad cost comparison from the user's own option text

## Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Add your Groq API key to `.env.local`:

```bash
GROQ_API_KEY=gsk_...
```

## Tech stack

- Next.js 15 App Router
- React 19
- TypeScript
- Vercel AI SDK v5
- Groq
- Zod
- Plain CSS
