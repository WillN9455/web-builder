# Review stage — export unit

Contract for everything the Reviewer Agent needs at task pickup. Review is
pipeline position 4 — adversarial review **across** BA, Design, Build, and QA —
which is why it is its own stage and not a QA role: its inputs span four
stages, and `qa/` would be a narrower scope than its actual job.

| File | Purpose | Written by |
|---|---|---|
| `skills/README.md` | Why Review owns no skill bodies (it audits via shared rules) | Framework maintainers |
| `config/review-rules.md` | Review bar: what counts as pass/fail per stage | Review · Rules tab |
| `agents/reviewer-agent.md` | Reviewer Agent loadout + user steering | Agents tab editor |

## Inputs (read, not owned)
- Stage outputs from Design, Build, and QA (tokens, PRs, test evidence)
- `shared/skills/security.md` (audit lens — same rule Build enforces)
- `shared/skills/general-best-practices.md`

## Outputs
- Review verdicts and rework round-trips to the critiqued stage

## Legacy mapping
- `config/review-rules.md` ← new; previously the reviewer contract lived only
  in `AGENTS.md` § Solution Architect and the v5.5 agents-tab mockup