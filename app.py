"""
QuickDecide — A smart, single-page web app that ends choice fatigue.

Pipeline:
1. Messy Input      -> user dumps a free-text sentence with options
2. AI Extraction    -> LLM parses text into a clean JSON array of options
3. Weighted Math     -> scoring engine applies time/budget constraint penalties & boosts
4. Final Winner      -> LLM writes a short, cheeky justification for the winning option
"""

import os
import json
import random

import streamlit as st
from anthropic import Anthropic

from scoring import score_options

# ---------------------------------------------------------------------------
# Setup
# ---------------------------------------------------------------------------

st.set_page_config(page_title="QuickDecide", page_icon="⚡", layout="centered")

# Support both local env vars and Streamlit Community Cloud secrets
if "ANTHROPIC_API_KEY" not in os.environ and "ANTHROPIC_API_KEY" in st.secrets:
    os.environ["ANTHROPIC_API_KEY"] = st.secrets["ANTHROPIC_API_KEY"]

client = Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))
MODEL = "claude-sonnet-4-6"


# ---------------------------------------------------------------------------
# Step 1 + 2: AI Natural Language Parser
# ---------------------------------------------------------------------------

def extract_options(raw_text: str) -> list[str]:
    """Turn a messy sentence into a clean list of option strings."""
    prompt = f"""Extract the distinct options/choices being considered from the text below.
Return ONLY a JSON array of short strings, nothing else — no markdown, no preamble.

Text: "{raw_text}"
"""
    response = client.messages.create(
        model=MODEL,
        max_tokens=300,
        messages=[{"role": "user", "content": prompt}],
    )
    text = response.content[0].text.strip()
    text = text.removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    try:
        options = json.loads(text)
        return [str(o).strip() for o in options if str(o).strip()]
    except json.JSONDecodeError:
        # Fallback: naive split if the model didn't return clean JSON
        return [chunk.strip() for chunk in raw_text.replace(" or ", ",").split(",") if chunk.strip()]


# ---------------------------------------------------------------------------
# Step 4: Final Winner justification
# ---------------------------------------------------------------------------

def justify_winner(winner: str, options: list[str], time_pref: str, budget_pref: str) -> str:
    prompt = f"""The winning choice from {options} is "{winner}", given a time constraint of
"{time_pref}" and a budget tier of "{budget_pref}". Write one short, cheeky, upbeat sentence
(max 25 words) justifying this pick to the user. No emoji spam, one is fine."""
    response = client.messages.create(
        model=MODEL,
        max_tokens=100,
        messages=[{"role": "user", "content": prompt}],
    )
    return response.content[0].text.strip()


# ---------------------------------------------------------------------------
# UI
# ---------------------------------------------------------------------------

st.title("⚡ QuickDecide")
st.caption("Dump your options. Set your constraints. Stop deliberating.")

with st.form("decision_form"):
    raw_text = st.text_area(
        "What are you stuck choosing between?",
        placeholder='e.g. "We\'re stuck between getting tacos, cooking some dry pasta, or ordering a quick pepperoni pizza."',
        height=100,
    )

    col1, col2 = st.columns(2)
    with col1:
        time_pref = st.select_slider("Time available", options=["Low", "Medium", "High"], value="Medium")
    with col2:
        budget_pref = st.select_slider("Budget tier", options=["$", "$$", "$$$"], value="$$")

    submitted = st.form_submit_button("Decide for me ⚡", use_container_width=True)

if submitted:
    if not raw_text.strip():
        st.warning("Type something first — give me some options to work with.")
    elif not os.environ.get("ANTHROPIC_API_KEY"):
        st.error("ANTHROPIC_API_KEY is not set. Add it to your environment or Streamlit secrets.")
    else:
        with st.spinner("Parsing your chaos..."):
            options = extract_options(raw_text)

        if len(options) < 2:
            st.warning("Couldn't find at least two distinct options — try rephrasing.")
        else:
            with st.spinner("Running the weighted math..."):
                scored = score_options(options, time_pref, budget_pref)
                winner = scored[0][0]

            with st.spinner("Writing your verdict..."):
                justification = justify_winner(winner, options, time_pref, budget_pref)

            st.success(f"### 🏆 {winner}")
            st.write(justification)

            with st.expander("See the full scoring breakdown"):
                for name, score in scored:
                    st.write(f"**{name}** — score: {score:.2f}")
