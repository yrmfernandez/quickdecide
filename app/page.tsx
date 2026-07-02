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
            <a href="#how">Modes</a>
            <a href="#app">Try It</a>
            <a href="#why">Why It Wins</a>
          </div>
          <a className="nav-cta" href="#app">
            Open App -&gt;
          </a>
        </div>
      </nav>

      <header className="hero">
        <div className="land-wrap hero-grid">
          <div>
            <div className="eyebrow">Decision engine - zero setup</div>
            <h1 className="hero-title">
              Stuck between options?
              <br />
              <em>Pick a mode</em> and get a verdict.
            </h1>
            <p className="lede">
              Type your mess of options exactly as you would say them out loud.
              QuickDecide can stay serious, get funny, or decide instantly when
              the debate has already stolen enough oxygen.
            </p>
            <div className="cta-row">
              <a className="btn-hero" href="#app">
                Make a decision -&gt;
              </a>
              <a className="btn-ghost-link" href="#how">
                See the modes
              </a>
            </div>
          </div>

          <div className="hero-receipt" aria-hidden="true">
            <div className="hstamp">DECIDED</div>
            <div className="receipt-head">
              <div className="rname">QUICKDECIDE</div>
              <div className="rsub">FUNNY MODE - TONIGHT - 7:42 PM</div>
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
              <span>Mode</span>
              <span>Funny</span>
            </div>
            <div className="rline">
              <span>Wildcard</span>
              <span>Off</span>
            </div>
            <div className="rfoot">because your fridge already has the salsa</div>
          </div>
        </div>
      </header>

      <section className="land" id="problem">
        <div className="land-wrap">
          <div className="section-tag">The Problem</div>
          <h2 className="land-h2">Every small choice taxes the same battery.</h2>
          <p className="section-lede">
            By the time a real decision matters, the mental budget for it is
            already spent on the twenty that did not.
          </p>
          <div className="problem-grid">
            <div className="clutter" aria-hidden="true">
              <div className="sticky-note s1">tacos???</div>
              <div className="sticky-note s2">or just... pasta again</div>
              <div className="sticky-note s3">no time to cook tbh</div>
              <div className="sticky-note s4">P500 left this week</div>
            </div>
            <div className="problem-copy">
              <p>
                Conventional tools respond to fatigue with more structure:
                onboarding flows, dropdowns, saved preferences. That is
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
          <div className="section-tag">Modes</div>
          <h2 className="land-h2">Three moods, one receipt.</h2>
          <p className="section-lede">
            Pick the flavor of judgment first. The app handles the rest.
          </p>
          <div className="itemized">
            <div className="item-row">
              <div className="item-no">01</div>
              <div className="item-title">Serious mode</div>
              <div className="item-desc">
                Default mode. It extracts options, adds relevant sliders, uses
                tools when useful, and keeps the tone grounded.
              </div>
            </div>
            <div className="item-row">
              <div className="item-no">02</div>
              <div className="item-title">Funny mode</div>
              <div className="item-desc">
                Same careful scoring, but the receipt can talk back a little
                when the decision is low-stakes enough for jokes.
              </div>
            </div>
            <div className="item-row">
              <div className="item-no">03</div>
              <div className="item-title">Instant mode</div>
              <div className="item-desc">
                Skips sliders and runs the whole call in one pass for the
                moments where speed matters more than tuning.
              </div>
            </div>
            <div className="item-row">
              <div className="item-no">04</div>
              <div className="item-title">Wildcard option</div>
              <div className="item-desc">
                Optional chaos switch. If the listed choices are all bad, the
                app may print a better outside answer instead.
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="land" id="app">
        <div className="land-wrap">
          <div className="section-tag">Try It</div>
          <h2 className="land-h2">Type the mess. Choose the brain.</h2>
          <p className="section-lede">
            Serious is the default. Funny adds flavor. Instant goes straight to
            the receipt.
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
                "select all that apply."
              </p>
            </div>
            <div className="feat">
              <div className="feat-index">02 / Modes</div>
              <h3>Matches the moment</h3>
              <p>
                Serious for real tradeoffs, funny for low-stakes chaos, instant
                when you just need the answer now.
              </p>
            </div>
            <div className="feat">
              <div className="feat-index">03 / Logic</div>
              <h3>Guardrailed</h3>
              <p>
                Handles ties, caps long reasoning, and separates verified
                context from plain judgment.
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
              Launch QuickDecide -&gt;
            </a>
          </div>
        </div>
      </section>

      <footer className="landing">
        <div className="land-wrap foot-row">
          <div className="foot-copy">(c) 2026 QuickDecide</div>
          <div className="foot-links">
            <a href="#app">quickdecide.app</a>
            <a href="#app">build@quickdecide.app</a>
          </div>
        </div>
      </footer>
    </>
  );
}
