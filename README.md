# ⚡ QuickDecide

A smart, single-page web app that ends choice fatigue. Dump a messy sentence
full of options, set your time and budget constraints, and get an instant
decision with a cheeky justification.

> "Every day, humans make thousands of micro-decisions. QuickDecide breaks
> that loop with zero-friction natural language input."

## How it works

1. **Messy Input** — you type a free-form sentence describing your options.
2. **AI Extraction** — a fast LLM call parses that sentence into a clean
   JSON array of options (`scoring` never sees raw text).
3. **Weighted Math** — a lightweight scoring engine (`scoring.py`) applies
   penalty/boost offsets based on your **time** and **budget** constraints.
4. **Final Winner** — the top-scoring option is returned along with a short,
   LLM-generated justification.

## Architecture

- **Zero database** — everything runs in-memory / session state, no SQL setup.
- **Pure Python GUI** — [Streamlit](https://streamlit.io) front end, no JS build step.
- **Low OpEx** — LLM calls use small payloads (extraction + one-liner justification).

```
quickdecide/
├── app.py                          # Streamlit UI + pipeline orchestration
├── scoring.py                      # Weighted math scoring engine (Step 3)
├── requirements.txt
├── .streamlit/
│   └── secrets.toml.example        # copy to secrets.toml for local/cloud secrets
└── .gitignore
```

## Setup

```bash
git clone <your-repo-url>
cd quickdecide
python -m venv venv && source venv/bin/activate   # optional but recommended
pip install -r requirements.txt
```

Set your Anthropic API key, either as an environment variable:

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
```

or by copying `.streamlit/secrets.toml.example` to `.streamlit/secrets.toml`
and filling in the key (this file is gitignored).

## Run locally

```bash
streamlit run app.py
```

## Deploy

Push to GitHub, then deploy for free on
[Streamlit Community Cloud](https://streamlit.io/cloud):
point it at `app.py`, and add `ANTHROPIC_API_KEY` under **Settings → Secrets**.

## Roadmap

| Task | Status |
|---|---|
| LLM extraction JSON prompt development | ✅ Complete |
| Streamlit layout, input box design | 🔄 In progress |
| Weighted math grid & penalty scoring logic | ⬜ Backlog |
| Winner formatting & AI justification generation | ⬜ Backlog |
| Production release (Streamlit Community Cloud) | ⬜ Backlog |

## License

MIT — do whatever you want with it.
