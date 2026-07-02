import DecisionFlow from "@/components/DecisionFlow";

export default function Home() {
  return (
    <>
      <nav className="landing">
        <div className="land-wrap">
          <div className="logo">
            <span className="logo-mark">Q</span>QuickDecide
          </div>
          <div className="navlinks">
            <a href="#problem">The Problem</a>
            <a href="#how">How It Works</a>
            <a href="#app">Try It</a>
            <a href="#why">Why It Wins</a>
          </div>
          <a className="nav-cta" href="#app">
            Open App →
          </a>
        </div>
      </nav>

      <header className="hero">
        <div className="land-wrap hero-grid">
          <div>
            <div className="eyebrow">Decision engine · Zero setup</div>
            <h1 className="hero-title">
              Stuck between options?
              <br />
              <em>Get a verdict</em> in one line.
            </h1>
            <p className="lede">
              Type your mess of options exactly as you&apos;d say them out loud.
              QuickDecide parses it, weighs it against your real constraints, and
              hands you a decision — not another form to fill out.
            </p>
            <div className="cta-row">
              <a className="btn-hero" href="#app">
                Make a decision →
              </a>
              <a className="btn-ghost-link" href="#how">
                See how it scores things
              </a>
            </div>
          </div>

          <div className="hero-receipt" aria-hidden="true">
            <div className="hstamp">DECIDED</div>
            <div className="receipt-head">
              <div className="rname">QUICKDECIDE</div>
              <div className="rsub">DINNER · TONIGHT · 7:42 PM</div>
            </div>
            <hr />
            <div className="rline strike">
              <span>Cook pasta</span>
              <span>34 pts</span>
            </div>
            <div className="rline strike">
              <span>Order pizza</span>
              <span>58 pts</span>
            </div>
            <div className="rline win">
              <span>
                Tacos, pantry run<span className="wtag">WINNER</span>
              </span>
              <span>91 pts</span>
            </div>
            <hr />
            <div className="rline">
              <span>Budget Pressure</span>
              <span>22/100</span>
            </div>
            <div className="rline">
              <span>Time Commitment</span>
              <span>18/100</span>
            </div>
            <div className="rfoot">— because your fridge already has the salsa —</div>
          </div>
        </div>
      </header>

      <section className="land" id="problem">
        <div className="land-wrap">
          <div className="section-tag">The Problem</div>
          <h2 className="land-h2">Every small choice taxes the same battery.</h2>
          <p className="section-lede">
            By the time a real decision matters, the mental budget for it is
            already spent on the twenty that didn&apos;t.
          </p>
          <div className="problem-grid">
            <div className="clutter" aria-hidden="true">
              <div className="sticky-note s1">tacos???</div>
              <div className="sticky-note s2">or just... pasta again</div>
              <div className="sticky-note s3">no time to cook tbh</div>
              <div className="sticky-note s4">₱500 left this week</div>
            </div>
            <div className="problem-copy">
              <p>
                Conventional tools respond to fatigue with more structure —
                onboarding flows, dropdowns, saved preferences. That&apos;s
                friction dressed up as features.
              </p>
              <p>
                QuickDecide takes the opposite bet: the messier the input, the
                better. One sentence in, one answer out.
              </p>
              <div className="stat-line">
                <div className="big">0</div>
                <div className="cap">
                  forms, logins, or profile fields required to get an answer
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="land" id="how" style={{ background: "var(--paper-dim)" }}>
        <div className="land-wrap">
          <div className="section-tag">How It Works</div>
          <h2 className="land-h2">Four steps, itemized like a receipt.</h2>
          <p className="section-lede">
            Nothing here needs your attention until the total prints.
          </p>
          <div className="itemized">
            <div className="item-row">
              <div className="item-no">01</div>
              <div className="item-title">Messy input</div>
              <div className="item-desc">
                Type the options exactly as they came to you — no fields, no
                format, just the sentence.
              </div>
            </div>
            <div className="item-row">
              <div className="item-no">02</div>
              <div className="item-title">AI extraction</div>
              <div className="item-desc">
                A lightweight model reads the noise, pulls out your actual
                options, and picks the two constraint dials that matter for this
                decision.
              </div>
            </div>
            <div className="item-row">
              <div className="item-no">03</div>
              <div className="item-title">The judge</div>
              <div className="item-desc">
                A larger model weighs every option against your dial settings —
                checking real-world context like weather and time of day before
                scoring.
              </div>
            </div>
            <div className="item-row">
              <div className="item-no">04</div>
              <div className="item-title">Final winner</div>
              <div className="item-desc">
                One option, one plain-language reason why — printed like a
                receipt, not buried in a dashboard.
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="land" id="app">
        <div className="land-wrap">
          <div className="section-tag">Try It</div>
          <h2 className="land-h2">Type the mess. Get the answer.</h2>
          <p className="section-lede">
            Single screen. One input, two constraint dials, one printed verdict.
          </p>
          <DecisionFlow />
        </div>
      </section>

      <section className="land" id="why" style={{ background: "var(--paper-dim)" }}>
        <div className="land-wrap">
          <div className="section-tag">Why It Wins</div>
          <h2 className="land-h2">Built to end the debate, not manage it.</h2>
          <div className="feat-grid">
            <div className="feat">
              <div className="feat-index">01 / Input</div>
              <h3>Zero friction</h3>
              <p>
                One messy sentence in. No dropdowns, no templates, no
                &quot;select all that apply.&quot;
              </p>
            </div>
            <div className="feat">
              <div className="feat-index">02 / Speed</div>
              <h3>Saves time</h3>
              <p>
                Ends domestic and professional decision deadlocks in seconds,
                not another group chat thread.
              </p>
            </div>
            <div className="feat">
              <div className="feat-index">03 / Logic</div>
              <h3>Context aware</h3>
              <p>
                Weighs choices against your actual constraints and real-world
                conditions — not a coin flip dressed up as a feature.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="land">
        <div className="land-wrap">
          <div className="cta-final">
            <h2>Clear your mental bandwidth.</h2>
            <p>
              Built to end debates in seconds. Type the mess. Get the answer.
            </p>
            <a className="btn-hero" href="#app">
              Launch QuickDecide →
            </a>
          </div>
        </div>
      </section>

      <footer className="landing">
        <div className="land-wrap foot-row">
          <div className="foot-copy">© 2026 QuickDecide</div>
          <div className="foot-links">
            <a href="#app">quickdecide.app</a>
            <a href="#app">build@quickdecide.app</a>
          </div>
        </div>
      </footer>
    </>
  );
}
