"use client";

import { useRef, useState, useTransition } from "react";
import { analyzeAction, decideAction } from "@/app/actions";
import type { Verdict } from "@/lib/schemas";
import { SLIDER_META, type SliderId } from "@/lib/sliders";

type Stage = "dump" | "analyzing" | "sliders" | "deciding" | "verdict";

const ANALYZE_STATUS = ["Reading your chaos", "Extracting the options", "Picking your dials"];
const DECIDE_STATUS = ["Checking the real world", "Weighing the options", "Locking in a ruling"];

export default function DecisionFlow() {
  const [stage, setStage] = useState<Stage>("dump");
  const [rawText, setRawText] = useState("");
  const [choices, setChoices] = useState<string[]>([]);
  const [sliderIds, setSliderIds] = useState<SliderId[]>([]);
  const [values, setValues] = useState<Record<string, number>>({});
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusIdx, setStatusIdx] = useState(0);
  const [, startTransition] = useTransition();
  const statusTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  function cycleStatus(len: number) {
    setStatusIdx(0);
    if (statusTimer.current) clearInterval(statusTimer.current);
    statusTimer.current = setInterval(
      () => setStatusIdx((i) => (i + 1) % len),
      1400
    );
  }
  function stopStatus() {
    if (statusTimer.current) clearInterval(statusTimer.current);
  }

  function analyze() {
    setError(null);
    setStage("analyzing");
    cycleStatus(ANALYZE_STATUS.length);
    startTransition(async () => {
      const res = await analyzeAction(rawText);
      stopStatus();
      if (!res.ok) {
        setError(res.error);
        setStage("dump");
        return;
      }
      setChoices(res.data.choices);
      setSliderIds(res.data.sliders);
      setValues(Object.fromEntries(res.data.sliders.map((id) => [id, 50])));
      setStage("sliders");
    });
  }

  function decide() {
    setError(null);
    setStage("deciding");
    cycleStatus(DECIDE_STATUS.length);
    startTransition(async () => {
      const res = await decideAction({
        rawText,
        choices,
        sliders: sliderIds.map((id) => ({ id, value: values[id] ?? 50 })),
      });
      stopStatus();
      if (!res.ok) {
        setError(res.error);
        setStage("sliders");
        return;
      }
      setVerdict(res.data);
      setStage("verdict");
    });
  }

  function reset() {
    setStage("dump");
    setRawText("");
    setChoices([]);
    setSliderIds([]);
    setVerdict(null);
    setError(null);
  }

  const maxScore = verdict ? Math.max(...verdict.scores.map((s) => s.score), 1) : 1;

  return (
    <main>
      <header className="brand">
        <h1>
          Quick<span>Decide</span>
        </h1>
        <span className="tag">stateless decision engine</span>
      </header>

      {(stage === "dump" || stage === "analyzing") && (
        <section>
          <p className="dump-label">The brain dump</p>
          <textarea
            className="dump"
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder={'"We\'re stuck between getting tacos, cooking some dry pasta, or ordering a quick pepperoni pizza..."'}
            disabled={stage === "analyzing"}
            aria-label="Describe what you are deciding between"
          />
          <div className="actions-row">
            <button
              className="btn btn-primary"
              onClick={analyze}
              disabled={stage === "analyzing" || rawText.trim().length < 8}
            >
              Analyze
            </button>
          </div>
          {stage === "analyzing" && (
            <div className="loading" role="status">
              <div className="bar" />
              <p className="status">{ANALYZE_STATUS[statusIdx]}…</p>
            </div>
          )}
          {error && <p className="error">{error}</p>}
        </section>
      )}

      {(stage === "sliders" || stage === "deciding") && (
        <section>
          <p className="dump-label">Detected options</p>
          <div className="choices">
            {choices.map((c) => (
              <span key={c} className="choice-chip">
                {c}
              </span>
            ))}
          </div>

          <div className="slider-panel">
            {sliderIds.map((id) => {
              const meta = SLIDER_META[id];
              const v = values[id] ?? 50;
              return (
                <div key={id} className="slider-block">
                  <div className="slider-head">
                    <span className="slider-name">{meta.label}</span>
                    <span className="slider-value">{v}/100</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={v}
                    style={{ ["--fill" as string]: `${v}%` }}
                    onChange={(e) =>
                      setValues((prev) => ({ ...prev, [id]: Number(e.target.value) }))
                    }
                    disabled={stage === "deciding"}
                    aria-label={meta.label}
                  />
                  <div className="slider-ends">
                    <span>{meta.low}</span>
                    <span>{meta.high}</span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="actions-row">
            <button className="btn btn-primary" onClick={decide} disabled={stage === "deciding"}>
              Decide for me
            </button>
            <button className="btn btn-ghost" onClick={reset} disabled={stage === "deciding"}>
              Start over
            </button>
          </div>

          {stage === "deciding" && (
            <div className="loading" role="status">
              <div className="bar" />
              <p className="status">{DECIDE_STATUS[statusIdx]}…</p>
            </div>
          )}
          {error && <p className="error">{error}</p>}
        </section>
      )}

      {stage === "verdict" && verdict && (
        <section className="verdict">
          <p className="eyebrow">The verdict is in</p>
          <h2 className="winner">{verdict.winner}</h2>
          <p className="witty">{verdict.witty}</p>

          <div className="receipt">
            {verdict.scores.map((s) => (
              <div className="row" key={s.choice}>
                <span className="k">{s.choice}</span>
                <span className="bar-track">
                  <span
                    className="bar-fill"
                    style={{ width: `${(s.score / maxScore) * 100}%` }}
                  />
                </span>
                <span>{Math.round(s.score)}</span>
              </div>
            ))}
            {verdict.contextUsed.length > 0 && (
              <p className="ctx">
                context: <span>{verdict.contextUsed.join(" · ")}</span>
              </p>
            )}
          </div>

          <div className="actions-row">
            <button className="btn btn-primary" onClick={reset}>
              Decide something else
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
