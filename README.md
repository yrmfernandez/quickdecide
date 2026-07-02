# ⚡ QuickDecide

A stateless, zero-friction AI decision engine. Not a chatbot. Dump your messy
thoughts into a text box, adjust two dynamic sliders, and get a definitive
choice with a witty explanation. No database, no login, no chat history.

## The flow

1. **The Brain Dump** — one massive text area. Type what you're stuck between.
2. **Dynamic Sliders** — the app renders two custom sliders picked *for your
   specific decision* (e.g. "Mental Bandwidth", "Budget Pressure").
3. **The Execution** — adjust the sliders to match your vibe, hit **Decide for me**.
4. **The Reveal** — massive typography verdict + witty one-liner + a score receipt.

## The 3-Brain agentic pipeline

All LLM work runs in **Next.js Server Actions** — the browser never sees an
API key or a prompt.

| Brain | Model | Role |
|---|---|---|
| **1 — Classifier** | Llama-3.1-8B | Extracts choices into an array and picks two sliders. **Strict Zod enum** means it's physically incapable of inventing a slider that isn't in `lib/sliders.ts`. |
| **2 — Judge** | Llama-3.3-70B | The heavy lifter. Autonomous ReAct loop via the Vercel AI SDK's tool calling (`stopWhen: stepCountIs(5)`). Weighs choices against slider values and calls real-world tools before locking in a winner. |
| **3 — Writer** | Llama-3.1-8B | Translates the dry mathematical ruling into the witty sentence on screen. |

### The free toolbelt (Brain 2)

- **Open-Meteo** — keyless weather API (geocoding + current conditions), $0
- **Native JS `Date`** — time/day/weekend context, no API at all

### Invisible location routing

No GPS permission popups. On Vercel, the user's city is read server-side from
the `x-vercel-ip-city` header and fed straight into Brain 2's prompt. Locally
it's simply `null` and the judge decides without it.

## Project structure

```
quickdecide/
├── app/
│   ├── actions.ts          # Server Actions: analyze + decide (keys stay server-side)
│   ├── layout.tsx
│   ├── page.tsx
│   └── globals.css         # design tokens, custom sliders, verdict animation
├── components/
│   └── DecisionFlow.tsx    # the whole UI state machine (dump → sliders → verdict)
└── lib/
    ├── brains/
    │   ├── classifier.ts   # Brain 1
    │   ├── judge.ts        # Brain 2 (+ structuring pass)
    │   └── writer.ts       # Brain 3
    ├── schemas.ts          # Zod schemas
    ├── sliders.ts          # the hardcoded master slider list
    └── tools.ts            # Open-Meteo + time tools
```

## Setup

```bash
npm install
cp .env.example .env.local   # then paste your real key
npm run dev
```

Get a free Groq API key at [console.groq.com](https://console.groq.com) and put
it in `.env.local`:

```
GROQ_API_KEY=gsk_...
```

## Deploy (Vercel)

1. Push to GitHub.
2. Import the repo at [vercel.com/new](https://vercel.com/new).
3. Add `GROQ_API_KEY` under **Settings → Environment Variables**.
4. Deploy. The `x-vercel-ip-city` header (invisible location) works
   automatically in production.

## Tech stack

- **Next.js 15** (App Router, React 19, TypeScript, Server Actions)
- **Vercel AI SDK v5** (`generateObject`, `generateText`, tool calling)
- **Groq** (`llama-3.1-8b-instant`, `llama-3.3-70b-versatile`)
- **Zod** for strict JSON schema enforcement
- Zero database, zero component libraries, plain CSS
