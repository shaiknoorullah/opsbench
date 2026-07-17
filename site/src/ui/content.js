// All landing copy — grounded in the opsbench PRD, README, and market research.
// Tone: precise, forensic, no hype, no emojis (per the project constitution).

export const NAV_SECTIONS = [
  { id: 'top', label: 'Top' },
  { id: 'gap', label: 'The Gap' },
  { id: 'gatekeeper', label: 'Gatekeeper' },
  { id: 'ledger', label: 'Ledger' },
  { id: 'autonomy', label: 'Autonomy' },
  { id: 'reach', label: 'Escalation' },
  { id: 'teams', label: 'Teams' },
  { id: 'install', label: 'Install' },
]

export const content = /* html */ `
  <!-- ================= HERO ================= -->
  <section class="section section--hero" id="top" data-scene="hero" data-nav="top">
    <div class="hero__grid">
      <span class="kicker" data-reveal>The governance plane for AI operations agents</span>
      <h1 class="display" data-reveal>
        Grant your agents<br />production access.<br /><em>Prove it was safe.</em>
      </h1>
      <p class="lead lead--wide" data-reveal>
        opsbench is the control plane that makes any operations agent — ours or a third
        party's — auditable, evaluable, and safe to trust with write access to production.
      </p>
      <div class="hero__actions" data-reveal>
        <a class="btn btn--primary" href="#install">Install the toolkit <span aria-hidden="true">→</span></a>
        <a class="btn btn--ghost" href="#gatekeeper">See how it works</a>
      </div>
      <div class="hero__meta" data-reveal>
        <div class="hero__stat"><b>0</b><span>mutations bypass the gate</span></div>
        <div class="hero__stat"><b>100%</b><span>actions on a signed ledger</span></div>
        <div class="hero__stat"><b>&le; 5s</b><span>approval ack, every surface</span></div>
        <div class="hero__stat"><b>0</b><span>long-lived agent credentials</span></div>
      </div>
    </div>
    <div class="scroll-hint">Scroll to descend</div>
  </section>

  <!-- ================= THE GAP ================= -->
  <section class="section" id="gap" data-scene="gap" data-nav="gap">
    <div class="split split--right">
      <div class="split__text">
        <span class="kicker" data-tone="amber" data-reveal>The trust gap</span>
        <h2 class="headline" data-reveal>Adoption raced ahead of trust. Nobody governs the fleet.</h2>
        <p class="body" data-reveal>
          Enterprises are wiring AI agents into production faster than they can control them.
          Agents end up locked to read-only — capability wasted — or granted write access on
          faith — risk unbounded. No shipping product makes agent write-access
          <em>provably</em> safe.
        </p>
        <div class="gap-figures">
          <div class="figure" style="--fig-accent: var(--indigo)" data-reveal>
            <b>90<span class="unit">%</span></b>
            <p>of teams have adopted AI in development.</p>
            <cite>DORA, 2025</cite>
          </div>
          <div class="figure" style="--fig-accent: var(--amber)" data-reveal>
            <b>24<span class="unit">%</span></b>
            <p>actually trust what those agents produce.</p>
            <cite>DORA, 2025</cite>
          </div>
          <div class="figure" style="--fig-accent: var(--teal)" data-reveal>
            <b>11<span class="unit">%</span></b>
            <p>of realistic SRE scenarios resolved by SOTA agents.</p>
            <cite>Open benchmark, 2025</cite>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- ================= THESIS ================= -->
  <section class="section" id="thesis" data-scene="thesis" data-nav="gap">
    <div class="thesis-wrap" style="position:relative">
      <p class="thesis" data-reveal>
        The model proposes.<br />
        A deterministic gate <em>decides</em>.<br />
        The ledger <em>remembers</em>.
      </p>
      <p class="body" data-reveal style="margin-top:2rem">
        Four disciplines make an agent safe to grant production write-access. opsbench ships all
        four as one plane — and governs first-party and third-party agents identically.
      </p>
    </div>
  </section>

  <!-- ================= GATEKEEPER ================= -->
  <section class="section section--tall" id="gatekeeper" data-scene="gatekeeper" data-nav="gatekeeper">
    <div class="split">
      <div class="split__text">
        <span class="kicker" data-tone="violet" data-reveal>01 — Authorization outside the model</span>
        <h2 class="headline" data-reveal>Every mutation passes a gate the agent cannot bypass.</h2>
        <p class="body" data-reveal>
          Writes are authorized by a deterministic, default-deny policy point evaluated outside
          the model's reasoning loop. The gatekeeper forces a dry-run, computes a risk tier, and
          pins the payload by hash. Prompt content can never alter a policy outcome.
        </p>
        <div class="feature-list">
          <div class="feature" data-reveal>
            <span class="feature__idx">DP-1</span>
            <div>
              <h3>Read-only by structural default</h3>
              <p>New agents, connectors, and tools start with no write capability. Writes are earned per scope through staged, evidenced promotion — never a config flag.</p>
            </div>
          </div>
          <div class="feature" data-reveal>
            <span class="feature__idx">JIT</span>
            <div>
              <h3>No long-lived credentials</h3>
              <p>On approval the gatekeeper re-validates the payload hash, then executes with a just-in-time credential distinct from any read credential.</p>
            </div>
          </div>
          <div class="feature" data-reveal>
            <span class="feature__idx">FAIL</span>
            <div>
              <h3>Fail closed, always</h3>
              <p>If the policy engine is unavailable, the mutation is denied and surfaced. Uncertainty never resolves to action.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- ================= LEDGER ================= -->
  <section class="section section--tall" id="ledger" data-scene="ledger" data-nav="ledger">
    <div class="split split--right">
      <div class="split__text">
        <span class="kicker" data-reveal>02 — Evidence, or it didn't happen</span>
        <h2 class="headline" data-reveal>A tamper-evident spine of every action and decision.</h2>
        <p class="body" data-reveal>
          Every action, approval, and denial lands on a signed, hash-chained ledger with enough
          fields to reconstruct who did what, and why, independently. Merkle inclusion proofs make
          integrity verifiable without platform access — auditor-ready by construction.
        </p>
        <div class="ledger-readout" data-reveal>
          <div class="ledger-readout__head"><span class="dot"></span> audit-ledger · append-only · sha-256</div>
          <div class="ledger-row"><span class="seq">#4821</span><span class="hash">a3f9…01b7 ← 7c2e…d904</span><span class="verdict">SEALED</span></div>
          <div class="ledger-row"><span class="seq">#4822</span><span class="hash">b8c1…44af ← a3f9…01b7</span><span class="verdict">SEALED</span></div>
          <div class="ledger-row"><span class="seq">#4823</span><span class="hash">deny · scale-out prod-eu</span><span class="verdict" data-v="DENY">DENIED</span></div>
          <div class="ledger-row"><span class="seq">#4824</span><span class="hash">e1d0…9c3a ← b8c1…44af</span><span class="verdict">SEALED</span></div>
        </div>
      </div>
    </div>
  </section>

  <!-- ================= AUTONOMY ================= -->
  <section class="section section--tall" id="autonomy" data-scene="autonomy" data-nav="autonomy">
    <div class="split">
      <div class="split__text">
        <span class="kicker" data-tone="indigo" data-reveal>03 — Autonomy is earned, never assumed</span>
        <h2 class="headline" data-reveal>Every level of trust is backed by replay evidence.</h2>
        <p class="body" data-reveal>
          Autonomy is granted per agent, per scenario, per environment — from eval evidence replayed
          against the customer's own historical incidents. Certificates are queryable and revocable in
          minutes; risk signals auto-downgrade the level. No standing autonomy without an artifact.
        </p>
        <div class="ladder">
          <div class="rung" data-reveal>
            <span class="rung__lvl">L0</span>
            <span class="rung__name">Observe<small>Read-only investigation, cited hypotheses</small></span>
            <span class="rung__bar"><span style="width:22%"></span></span>
          </div>
          <div class="rung" data-reveal>
            <span class="rung__lvl">L1</span>
            <span class="rung__name">Recommend<small>Proposes remediation, human executes</small></span>
            <span class="rung__bar"><span style="width:46%"></span></span>
          </div>
          <div class="rung" data-reveal>
            <span class="rung__lvl">L2</span>
            <span class="rung__name">Act with approval<small>Executes on a risk-tiered human sign-off</small></span>
            <span class="rung__bar"><span style="width:72%"></span></span>
          </div>
          <div class="rung" data-reveal>
            <span class="rung__lvl">L3</span>
            <span class="rung__name">Bounded autonomy<small>Certified scope, decays under risk signals</small></span>
            <span class="rung__bar"><span style="width:100%"></span></span>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- ================= ESCALATION ================= -->
  <section class="section section--tall" id="reach" data-scene="reach" data-nav="reach">
    <div class="split split--right">
      <div class="split__text">
        <span class="kicker" data-reveal>04 — A human is always reachable</span>
        <h2 class="headline" data-reveal>The escalation ladder ends at a named human — or a phone call.</h2>
        <p class="body" data-reveal>
          Every uncertain, blocked, or high-risk state has a defined path that ends at a person.
          The platform owns the ladder as single source of truth. Any acknowledgment on any channel
          cancels every pending rung — within five seconds, everywhere.
        </p>
        <div class="escalation">
          <div class="esc-step" data-reveal><span class="esc-step__node">1</span><div class="esc-step__body"><strong>Chat</strong><span>Approval object renders in Slack / Teams</span></div></div>
          <div class="esc-step" data-reveal><span class="esc-step__node">2</span><div class="esc-step__body"><strong>Mobile push</strong><span>Critical alert, single-tap acknowledgment</span></div></div>
          <div class="esc-step" data-reveal><span class="esc-step__node">3</span><div class="esc-step__body"><strong>SMS</strong><span>Falls through on acknowledgment timeout</span></div></div>
          <div class="esc-step" data-reveal><span class="esc-step__node">4</span><div class="esc-step__body"><strong>Voice call</strong><span>TTS summary, keypad ack with per-incident PIN</span></div></div>
        </div>
      </div>
    </div>
  </section>

  <!-- ================= TEAMS ================= -->
  <section class="section" id="teams" data-scene="teams" data-nav="teams">
    <span class="kicker" data-reveal>Shipped as a monorepo of teams</span>
    <h2 class="headline" data-reveal>Disciplined agent teams, one governed spine.</h2>
    <p class="body" data-reveal>
      Each team is a self-contained package of chained skills, least-privilege subagents, JSON
      schemas, Cedar policies, hooks, and MCP recipes — for Claude Code and Codex CLI.
    </p>
    <div class="teams">
      <div class="team-card" data-reveal>
        <span class="team-card__status stable"><span class="d"></span> Stable</span>
        <h3>Incident Response</h3>
        <p>Forensic K8s / SRE response grounded in NIST SP 800-86 and 800-61r2.</p>
        <div class="team-card__meta"><span>11 skills</span><span>33 subagents</span></div>
      </div>
      <div class="team-card" data-reveal>
        <span class="team-card__status"><span class="d"></span> Planned</span>
        <h3>Platform Engineering</h3>
        <p>Terraform, Pulumi, Crossplane, ArgoCD — plan / approve / apply with drift reconciliation.</p>
        <div class="team-card__meta"><span>IaC</span><span>GitOps</span></div>
      </div>
      <div class="team-card" data-reveal>
        <span class="team-card__status"><span class="d"></span> Planned</span>
        <h3>Security Response</h3>
        <p>Detection and triage with Falco, OpenCTI, TheHive, Velociraptor.</p>
        <div class="team-card__meta"><span>DFIR</span><span>Triage</span></div>
      </div>
      <div class="team-card" data-reveal>
        <span class="team-card__status"><span class="d"></span> Planned</span>
        <h3>Network Operations</h3>
        <p>BGP and route troubleshooting, mesh VPN ops, edge configuration.</p>
        <div class="team-card__meta"><span>BGP</span><span>Mesh</span></div>
      </div>
    </div>
  </section>

  <!-- ================= INSTALL / CTA ================= -->
  <section class="section section--hero" id="install" data-scene="install" data-nav="install">
    <span class="kicker" data-reveal>Open source · MIT</span>
    <h2 class="display" data-reveal style="font-size: clamp(2.4rem, 6vw, 5rem)">
      Ship the <em>spine</em>.
    </h2>
    <p class="lead" data-reveal>
      One curl. It wires skills, subagents, schemas, Cedar policies, and hooks into your existing
      Claude Code install.
    </p>
    <div class="install-block" data-reveal>
      <div class="install-block__head">
        <div class="tl"><i></i><i></i><i></i></div>
        <span>bash</span>
      </div>
      <div class="install-block__body">
        <div><span class="comment"># preview without writing anything</span></div>
        <div><span class="prompt">$ </span><span class="cmd" id="install-cmd">curl -fsSL https://raw.githubusercontent.com/shaiknoorullah/opsbench/main/scripts/install.sh | bash -s -- --dry-run</span></div>
      </div>
    </div>
    <div style="margin-top:1rem" data-reveal>
      <button class="copy-btn" id="copy-install"><span aria-hidden="true">⧉</span> Copy install command</button>
    </div>
    <div class="hero__actions" data-reveal style="margin-top:2rem">
      <a class="btn btn--primary" href="https://github.com/shaiknoorullah/opsbench" target="_blank" rel="noopener">View on GitHub <span aria-hidden="true">→</span></a>
      <a class="btn btn--ghost" href="https://github.com/shaiknoorullah/opsbench#readme" target="_blank" rel="noopener">Read the docs</a>
    </div>
  </section>

  <!-- ================= FOOTER ================= -->
  <footer class="footer" data-nav="install">
    <div class="footer__top">
      <div>
        <div class="footer__brand">opsbench</div>
        <p>The governance and orchestration plane for AI operations agents. Authorization outside the model. Evidence, not claims.</p>
      </div>
      <div class="footer__cols">
        <div class="footer__col">
          <h4>Platform</h4>
          <a href="#gatekeeper">Gatekeeper</a>
          <a href="#ledger">Audit ledger</a>
          <a href="#autonomy">Earned autonomy</a>
          <a href="#reach">Escalation</a>
        </div>
        <div class="footer__col">
          <h4>Project</h4>
          <a href="https://github.com/shaiknoorullah/opsbench" target="_blank" rel="noopener">GitHub</a>
          <a href="https://github.com/shaiknoorullah/opsbench#readme" target="_blank" rel="noopener">Documentation</a>
          <a href="https://github.com/shaiknoorullah/opsbench/blob/main/ROADMAP.md" target="_blank" rel="noopener">Roadmap</a>
          <a href="https://github.com/shaiknoorullah/opsbench/blob/main/CONTRIBUTING.md" target="_blank" rel="noopener">Contributing</a>
        </div>
        <div class="footer__col">
          <h4>Standards</h4>
          <a href="#">NIST SP 800-86</a>
          <a href="#">NIST SP 800-61r2</a>
          <a href="#">ISO/IEC 27037</a>
          <a href="#">MITRE ATT&amp;CK</a>
        </div>
      </div>
    </div>
    <div class="footer__bottom">
      <span>© 2026 opsbench · MIT License</span>
      <span>Built for Claude Code &amp; Codex CLI</span>
    </div>
  </footer>
`
