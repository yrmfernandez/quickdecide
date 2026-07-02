"use client";

import { useRef, useState, useTransition } from "react";
import { analyzeAction, decideAction, instantDecideAction } from "@/app/actions";
import type { ClassifierResult, DecisionMode, ModelChoice, Verdict } from "@/lib/schemas";

type Stage = "dump" | "analyzing" | "sliders" | "deciding" | "verdict";

const ANALYZE_STATUS = ["Reading the prompt", "Extracting the options", "Choosing useful dials"];
const DECIDE_STATUS = ["Checking context", "Weighing tradeoffs", "Printing the receipt"];

const MODE_LABELS: Record<DecisionMode, string> = {
  serious: "Serious",
  funny: "Funny",
  instant: "Instant",
};

const MODEL_LABELS: Record<ModelChoice, string> = {
  balanced: "Balanced",
  fast: "Fast",
  strong: "Strong",
};

function clip(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trim()}...`;
}

export default function DecisionFlow() {
  const [stage, setStage] = useState<Stage>("dump");
  const [mode, setMode] = useState<DecisionMode>("serious");
  const [modelChoice, setModelChoice] = useState<ModelChoice>("balanced");
  const [wildcardAllowed, setWildcardAllowed] = useState(false);
  const [rawText, setRawText] = useState("");
  const [choices, setChoices] = useState<string[]>([]);
  const [sliders, setSliders] = useState<ClassifierResult["sliders"]>([]);
  const [values, setValues] = useState<Record<string, number>>({});
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [decidedAt, setDecidedAt] = useState<string>("");
  const [elapsed, setElapsed] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusIdx, setStatusIdx] = useState(0);
  const [, startTransition] = useTransition();
  const statusTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);

  function cycleStatus(len: number) {
    setStatusIdx(0);
    if (statusTimer.current) clearInterval(statusTimer.current);
    statusTimer.current = setInterval(() => setStatusIdx((i) => (i + 1) % len), 1400);
  }

  function stopStatus() {
    if (statusTimer.current) clearInterval(statusTimer.current);
  }

  function scrollHome() {
    window.setTimeout(() => {
      shellRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  }

  function stampNow() {
    return new Date()
      .toLocaleString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZone: "Asia/Manila",
      })
      .toUpperCase();
  }

  async function analyze() {
    setError(null);
    setVerdict(null);
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
      setSliders(res.data.sliders);
      setValues(Object.fromEntries(res.data.sliders.map((s) => [s.id, 50])));
      setStage("sliders");
      scrollHome();
    });
  }

  async function decide() {
    setError(null);
    setStage("deciding");
    cycleStatus(DECIDE_STATUS.length);
    const t0 = performance.now();
    startTransition(async () => {
      const res = await decideAction({
        rawText,
        choices,
        mode: mode === "instant" ? "serious" : mode,
        modelChoice,
        wildcardAllowed,
        sliders: sliders.map((s) => ({
          id: s.id,
          value: values[s.id] ?? 50,
          label: s.label,
          low: s.low,
          high: s.high,
        })),
      });
      stopStatus();
      if (!res.ok) {
        setError(res.error);
        setStage("sliders");
        return;
      }
      setElapsed(((performance.now() - t0) / 1000).toFixed(1));
      setDecidedAt(stampNow());
      setVerdict(res.data);
      setStage("verdict");
      scrollHome();
    });
  }

  async function instantDecide() {
    setError(null);
    setVerdict(null);
    setStage("deciding");
    cycleStatus(DECIDE_STATUS.length);
    const t0 = performance.now();
    startTransition(async () => {
      const res = await instantDecideAction(rawText, { modelChoice, wildcardAllowed });
      stopStatus();
      if (!res.ok) {
        setError(res.error);
        setStage("dump");
        return;
      }
      setChoices(res.data.scores.map((s) => s.choice));
      setSliders([]);
      setElapsed(((performance.now() - t0) / 1000).toFixed(1));
      setDecidedAt(stampNow());
      setVerdict(res.data);
      setStage("verdict");
      scrollHome();
    });
  }

  function reset(keepText = false) {
    setStage("dump");
    if (!keepText) setRawText("");
    setChoices([]);
    setSliders([]);
    setValues({});
    setVerdict(null);
    setCopied(false);
    setError(null);
    stopStatus();
    scrollHome();
  }

  async function copyResult() {
    if (!verdict) return;
    const lines = [
      `QUICKDECIDE MODE: ${MODE_LABELS[verdict.mode]}`,
      `OUTCOME: ${verdict.outcomeType.toUpperCase()}`,
      `VERDICT: ${verdict.winner}`,
      verdict.witty,
      "",
      ...verdict.scores.map((s) => `${s.choice}: ${Math.round(s.score)} pts`),
    ];
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard unavailable.
    }
  }

  const sortedScores = verdict ? [...verdict.scores].sort((a, b) => b.score - a.score) : [];
  const maxScore = Math.max(...sortedScores.map((s) => s.score), 1);
  const tied = new Set(verdict?.tiedChoices ?? []);
  const winnerScore = sortedScores.find((s) => s.choice === verdict?.winner);
  const losers = sortedScores.filter((s) => {
    if (!verdict) return false;
    if (verdict.outcomeType === "tie") return !tied.has(s.choice);
    if (verdict.outcomeType === "wildcard") return true;
    return s.choice !== verdict.winner;
  });
  const showInput = (stage === "dump" || stage === "analyzing" || stage === "deciding") && !verdict;
  const isBusy = stage === "analyzing" || stage === "deciding";

  return (
    <div className="app-shell" ref={shellRef}>
      <div className="app-bar">
        <div className="dot" />
        <div className="dot" />
        <div className="dot" />
        <div className="url">quickdecide.app</div>
        {stage === "verdict" && <div className="hint">Receipt ready</div>}
      </div>

      <div className="app-body">
        {showInput && (
          <section>
            <p className="field-label">What are you deciding between?</p>
            <textarea
              className="dump"
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder={'"We are stuck between tacos, cooking pasta, or ordering pepperoni pizza."'}
              disabled={isBusy}
              aria-label="Describe what you are deciding between"
            />

            <div className="control-grid">
              <div>
                <p className="control-label">Mode</p>
                <div className="segmented">
                  {(["serious", "funny", "instant"] as DecisionMode[]).map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setMode(option)}
                      disabled={isBusy}
                      className={mode === option ? "active" : ""}
                    >
                      {MODE_LABELS[option]}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="control-label">Model</p>
                <select
                  className="select"
                  value={modelChoice}
                  onChange={(event) => setModelChoice(event.target.value as ModelChoice)}
                  disabled={isBusy}
                  aria-label="Model choice"
                >
                  {(["balanced", "fast", "strong"] as ModelChoice[]).map((option) => (
                    <option key={option} value={option}>
                      {MODEL_LABELS[option]}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <label className="toggle-row">
              <input
                type="checkbox"
                checked={wildcardAllowed}
                onChange={(event) => setWildcardAllowed(event.target.checked)}
                disabled={isBusy}
              />
              <span>Allow wildcard result</span>
            </label>

            <button
              className="decide-btn"
              onClick={mode === "instant" ? instantDecide : analyze}
              disabled={isBusy || rawText.trim().length < 8}
            >
              {mode === "instant" ? "Decide instantly ->" : "Analyze options ->"}
            </button>

            {isBusy && (
              <div className="loading" role="status" style={{ marginTop: 14 }}>
                <div className="bar" />
                <p className="status">
                  {(stage === "analyzing" ? ANALYZE_STATUS : DECIDE_STATUS)[statusIdx]}...
                </p>
              </div>
            )}
            {error && <p className="error">{error}</p>}
          </section>
        )}

        {(stage === "sliders" || (stage === "deciding" && mode !== "instant")) && (
          <section>
            <p className="field-label">Detected options</p>
            <div className="choices">
              {choices.map((choice) => (
                <span key={choice} className="chip">
                  {choice}
                </span>
              ))}
            </div>

            {sliders.map((slider) => {
              const value = values[slider.id] ?? 50;
              return (
                <div key={slider.id} className="slider-block">
                  <div className="slider-head">
                    <span className="slider-name">{slider.label}</span>
                    <span className="slider-value">{value}/100</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={value}
                    style={{ ["--fill" as string]: `${value}%` }}
                    onChange={(event) =>
                      setValues((prev) => ({ ...prev, [slider.id]: Number(event.target.value) }))
                    }
                    disabled={stage === "deciding"}
                    aria-label={slider.label}
                  />
                  <div className="slider-ends">
                    <span>{slider.low}</span>
                    <span>{slider.high}</span>
                  </div>
                </div>
              );
            })}

            <button className="decide-btn" onClick={decide} disabled={stage === "deciding"}>
              Decide for me -&gt;
            </button>
            <div className="actions" style={{ marginTop: 14 }}>
              <button className="btn" onClick={() => reset(false)} disabled={stage === "deciding"}>
                Start over
              </button>
            </div>

            {stage === "deciding" && (
              <div className="loading" role="status">
                <div className="bar" />
                <p className="status">{DECIDE_STATUS[statusIdx]}...</p>
              </div>
            )}
            {error && <p className="error">{error}</p>}
          </section>
        )}

        {stage === "verdict" && verdict && (
          <section className="stage">
            <div className="stage-label">Decision printed in {elapsed}s</div>

            <div className="receipt-wrap">
              <div className="stamp-mark">
                {verdict.outcomeType === "tie"
                  ? "TIE"
                  : verdict.outcomeType === "wildcard"
                    ? "WILDCARD"
                    : "DECIDED"}
              </div>
              <div className="receipt">
                <div className="r-head">
                  <div className="rname">QUICKDECIDE</div>
                  <div className="rsub">{decidedAt}</div>
                </div>
                <hr />
                <div className="r-meta">
                  <span>Mode</span>
                  <span>
                    {MODE_LABELS[verdict.mode]} {verdict.wildcardAllowed ? "+ wildcard" : ""}
                  </span>
                </div>
                <div className="r-meta">
                  <span>Model</span>
                  <span>{MODEL_LABELS[modelChoice]}</span>
                </div>
                <hr />
                <div className="r-input">&quot;{clip(rawText.trim(), 220)}&quot;</div>
                <hr />

                {losers.map((score) => (
                  <div className="rline strike" key={score.choice}>
                    <span>{score.choice}</span>
                    <span className="score">{Math.round(score.score)} pts</span>
                  </div>
                ))}

                {verdict.outcomeType === "tie" &&
                  verdict.tiedChoices.map((choice) => {
                    const score = sortedScores.find((item) => item.choice === choice);
                    return (
                      <div className="rline tie" key={choice}>
                        <span>{choice}</span>
                        <span className="score">{Math.round(score?.score ?? 0)} pts =</span>
                      </div>
                    );
                  })}

                {verdict.outcomeType === "wildcard" && (
                  <div className="rline win">
                    <span>{verdict.winner}</span>
                    <span className="score">wildcard</span>
                  </div>
                )}

                {verdict.outcomeType === "winner" && winnerScore && (
                  <div className="rline win">
                    <span>{winnerScore.choice}</span>
                    <span className="score">{Math.round(winnerScore.score)} pts OK</span>
                  </div>
                )}

                <hr />
                <div className="r-why">{clip(verdict.witty, 180)}</div>
                <hr />

                {sliders.map((slider) => (
                  <div className="r-meta" key={slider.id}>
                    <span>{clip(slider.label, 24)}</span>
                    <span>{values[slider.id] ?? 50}/100</span>
                  </div>
                ))}

                <div className="r-meta">
                  <span>Options weighed</span>
                  <span>{verdict.scores.length}</span>
                </div>
                {verdict.contextUsed.map((context, index) => (
                  <div className="r-meta wrap" key={`context-${index}`}>
                    <span>{index === 0 ? "Context" : ""}</span>
                    <span>{clip(context, 120)}</span>
                  </div>
                ))}
                {verdict.reasoningUsed.map((reason, index) => (
                  <div className="r-meta wrap" key={`reason-${index}`}>
                    <span>{index === 0 ? "Reasoning" : ""}</span>
                    <span>{clip(reason, 120)}</span>
                  </div>
                ))}
                <div className="barcode" />
                <div className="r-foot">NO REFUNDS - NO SECOND-GUESSING</div>
              </div>
            </div>

            <div className="actions">
              <button className="btn" onClick={() => reset(false)}>
                Start over
              </button>
              <button className="btn" onClick={() => reset(true)}>
                Decide again
              </button>
              <button className="btn" onClick={copyResult}>
                {copied ? "Copied!" : "Copy result"}
              </button>
            </div>

            <div className="scoreboard">
              <div className="scoreboard-label">Score breakdown</div>
              {sortedScores.map((score) => (
                <div className="bar-row" key={score.choice}>
                  <div className="name">{score.choice}</div>
                  <div className="bar-track">
                    <div
                      className={`bar-fill ${
                        verdict.outcomeType === "tie" && tied.has(score.choice)
                          ? "tie"
                          : score.choice === verdict.winner
                            ? "win"
                            : "lose"
                      }`}
                      style={{ width: `${(score.score / maxScore) * 100}%` }}
                    />
                  </div>
                  <div className="val">{Math.round(score.score)}</div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
