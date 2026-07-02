"use client";

import { useRef, useState, useTransition } from "react";
import { analyzeAction, decideAction } from "@/app/actions";
import type { Verdict } from "@/lib/schemas";
import { SLIDER_META, type SliderId } from "@/lib/sliders";

type Stage = "dump" | "analyzing" | "sliders" | "deciding" | "verdict";

const ANALYZE_STATUS = ["Reading your chaos", "Extracting the options", "Picking your dials"];
const DECIDE_STATUS = ["Checking the real world", "Weighing the options", "Printing the receipt"];

export default function DecisionFlow() {
  const [stage, setStage] = useState<Stage>("dump");
  const [rawText, setRawText] = useState("");
  const [choices, setChoices] = useState<string[]>([]);
  const [sliderIds, setSliderIds] = useState<SliderId[]>([]);
  const [values, setValues] = useState<Record<string, number>>({});
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [decidedAt, setDecidedAt] = useState<string>("");
  const [elapsed, setElapsed] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusIdx, setStatusIdx] = useState(0);
  const [, startTransition] = useTransition();
  const statusTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  function cycleStatus(len: number) {
    setStatusIdx(0);
    if (statusTimer.current) clearInterval(statusTimer.current);
    statusTimer.current = setInterval(() => setStatusIdx((i) => (i + 1) % len), 1400);
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
    const t0 = performance.now();
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
      setElapsed(((performance.now() - t0) / 1000).toFixed(1));
      setDecidedAt(
        new Date()
          .toLocaleString("en-US", {
            weekday: "short",
            hour: "numeric",
            minute: "2-digit",
          })
          .toUpperCase()
      );
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
    setCopied(false);
    setError(null);
  }

  async function copyResult() {
    if (!verdict) return;
    const lines = [
      `QUICKDECIDE VERDICT: ${verdict.winner}`,
      verdict.witty,
      "",
      ...verdict.scores.map((s) => `${s.choice}: ${Math.round(s.score)} pts`),
    ];
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable — ignore */
    }
  }

  const sortedScores = verdict
    ? [...verdict.scores].sort((a, b) => b.score - a.score)
    : [];
  const maxScore = Math.max(...sortedScores.map((s) => s.score), 1);
  const losers = sortedScores.filter((s) => s.choice !== verdict?.winner);
  const winScore = sortedScores.find((s) => s.choice === verdict?.winner);

  return (
    <main className="wrap">
      <header className="topbar">
        <div className="logo">
          <span className="logo-mark">Q</span>QuickDecide
        </div>
        <span className="tag">Decision engine · Zero setup</span>
      </header>

      <div className="app-shell">
        <div className="app-bar">
          <div className="dot" />
          <div className="dot" />
          <div className="dot" />
          <div className="url">quickdecide.app</div>
          {stage === "verdict" && <div className="hint">Enter to redecide</div>}
        </div>

        <div className="app-body">
          {(stage === "dump" || stage === "analyzing") && (
            <section>
              <p className="field-label">What are you deciding between?</p>
              <textarea
                className="dump"
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder={'"We\'re stuck between getting tacos, cooking some dry pasta, or ordering a quick pepperoni pizza."'}
                disabled={stage === "analyzing"}
                aria-label="Describe what you are deciding between"
              />
              <button
                className="decide-btn"
                onClick={analyze}
                disabled={stage === "analyzing" || rawText.trim().length < 8}
              >
                Analyze →
              </button>
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
              <p className="field-label">Detected options</p>
              <div className="choices">
                {choices.map((c) => (
                  <span key={c} className="chip">
                    {c}
                  </span>
                ))}
              </div>

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

              <button className="decide-btn" onClick={decide} disabled={stage === "deciding"}>
                Decide for me →
              </button>
              <div className="actions" style={{ marginTop: 14 }}>
                <button className="btn" onClick={reset} disabled={stage === "deciding"}>
                  ↺ Start over
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
            <section className="stage">
              <div className="stage-label">Decision printed in {elapsed}s</div>

              <div className="receipt-wrap">
                <div className="stamp-mark">DECIDED</div>
                <div className="receipt">
                  <div className="r-head">
                    <div className="rname">QUICKDECIDE</div>
                    <div className="rsub">{decidedAt}</div>
                  </div>
                  <hr />
                  <div className="r-input">&quot;{rawText.trim()}&quot;</div>
                  <hr />
                  {losers.map((s) => (
                    <div className="rline strike" key={s.choice}>
                      <span>{s.choice}</span>
                      <span className="score">{Math.round(s.score)} pts</span>
                    </div>
                  ))}
                  {winScore && (
                    <div className="rline win">
                      <span>{winScore.choice}</span>
                      <span className="score">{Math.round(winScore.score)} pts ✓</span>
                    </div>
                  )}
                  <hr />
                  <div className="r-why">{verdict.witty}</div>
                  <hr />
                  {sliderIds.map((id) => (
                    <div className="r-meta" key={id}>
                      <span>{SLIDER_META[id].label}</span>
                      <span>{values[id] ?? 50}/100</span>
                    </div>
                  ))}
                  <div className="r-meta">
                    <span>Options weighed</span>
                    <span>{verdict.scores.length}</span>
                  </div>
                  {verdict.contextUsed.length > 0 && (
                    <div className="r-meta">
                      <span>Context</span>
                      <span style={{ textAlign: "right", maxWidth: "60%" }}>
                        {verdict.contextUsed.join(" · ")}
                      </span>
                    </div>
                  )}
                  <div className="barcode" />
                  <div className="r-foot">NO REFUNDS · NO SECOND-GUESSING</div>
                </div>
              </div>

              <div className="actions">
                <button className="btn" onClick={reset}>
                  ↻ Decide again
                </button>
                <button className="btn" onClick={copyResult}>
                  ⧉ {copied ? "Copied!" : "Copy result"}
                </button>
              </div>

              <div className="scoreboard">
                <div className="scoreboard-label">Score breakdown</div>
                {sortedScores.map((s) => (
                  <div className="bar-row" key={s.choice}>
                    <div className="name">{s.choice}</div>
                    <div className="bar-track">
                      <div
                        className={`bar-fill ${s.choice === verdict.winner ? "win" : "lose"}`}
                        style={{ width: `${(s.score / maxScore) * 100}%` }}
                      />
                    </div>
                    <div className="val">{Math.round(s.score)}</div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
