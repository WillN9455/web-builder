# Open Questions Log: <Project Name>

> Maintained by BA Agent, reviewed by Requirements Reviewer, read by
> Solution Architect and Orchestrator. Single source of truth for every
> question raised during requirements gathering. The PRD §11 list is the
> executive summary; this file is the full log.

**Project:** <Project Name>
**Last updated:** <Date>
**Owner:** BA Agent
**Reviewer:** Requirements Reviewer

---

## Schema (every row in every table below MUST use these columns)

| Column | Type | Required | Notes |
|--------|------|----------|-------|
| `OQ-ID` | string | yes | Stable identifier `OQ-NNN`. Never reused. Gaps allowed (e.g. OQ-001, OQ-003 — OQ-002 was merged into OQ-001). |
| `Question` | string | yes | One sentence. The actual question, not a topic. |
| `Context / why now` | string | yes | Why this matters and what stage raised it. |
| `Raised by` | enum | yes | One of: `BA Agent`, `Requirements Reviewer`, `Solution Architect`, `Design Agent`, `Code Agent`, `QA Agent`, `User`, `Stakeholder`. |
| `Owner` | string | yes | Name or role of who can answer it (e.g. `Carmen (PM)`, `Lee (Eng Lead)`, `BA Agent`). |
| `Date raised` | date | yes | ISO `YYYY-MM-DD`. |
| `Status` | enum | yes | One of: `Open`, `In discussion`, `Resolved`, `Wontfix`, `Blocked`. See *Status legend* below. |
| `Blocker-for` | enum | yes | One of: `PRD-approval`, `tech`, `design`, `code`, `qa`, `integration`, `none`. See *Blocker-for* below. |
| `Resolution` | string | only when `Status = Resolved or Wontfix` | What was decided and why. Empty otherwise. |
| `Resolved by` | string | only when `Status = Resolved or Wontfix` | Name or role that decided it. Empty otherwise. |
| `Date resolved` | date | only when `Status = Resolved or Wontfix` | ISO `YYYY-MM-DD`. Empty otherwise. |
| `Linked items` | string | yes | Comma-separated references to PRD §N, story #M, BR-###, NFR-###, RISK-###, or another OQ-ID. Empty is allowed only when truly orphaned. |

> **The BA Agent owns schema integrity.** A row that drops a required
> column, uses an enum value outside the lists above, or resolves
> without filling the three resolve-only fields is a schema defect and
> must be corrected before the row is treated as resolved.

---

## Status legend

- **Open** — raised, no answer yet. BA Agent may proceed without an
  answer if `Blocker-for = none`; if `Blocker-for` is anything else, this
  row blocks the named stage.
- **In discussion** — being worked through with the user / SME.
  Treated as Open for blocking purposes.
- **Resolved** — answered. `Resolution`, `Resolved by`, and `Date
  resolved` MUST be filled. Resolution recorded here even if it was
  answered inline (audit trail — see the closing rule).
- **Wontfix** — out of scope for this phase; explicitly deferred. Same
  resolve-only fields filled.
- **Blocked** — cannot be answered until another question or external
  dependency resolves. The `Linked items` column MUST point at the
  blocking OQ-ID or dependency.

---

## Blocker-for values (locked enum)

| Value | Meaning | Gates which stage |
|-------|---------|-------------------|
| `PRD-approval` | Cannot sign off the PRD without this. | Requirements Reviewer §13 sign-off. |
| `tech` | Cannot pick the stack / integrations without this. | Solution Architect Part 2 sign-off. |
| `design` | Cannot finalise design tokens or components without this. | Design Agents sign-off. |
| `code` | Cannot start implementation without this. | Code Agent task creation. |
| `qa` | Cannot write the test plan without this. | QA Agent test design. |
| `integration` | Cannot complete an integration plan without this. | Solution Architect Part 2 §2.5 sign-off. |
| `none` | Informative only — sharpens the spec, never gates a stage. The BA Agent proceeds without waiting on these. |

> **The default is `none`.** The BA Agent MUST default every new OQ to
> `blocker-for: none` and only escalate to a blocking value when the BA
> Agent cannot defensibly write the relevant section without the answer.
> "I would prefer to know" is `none`; "I cannot write §9b without this"
> is the matching blocker-for.

---

## Open

| OQ-ID | Question | Context / why now | Raised by | Owner | Date raised | Status | Blocker-for | Linked items |
|-------|----------|-------------------|-----------|-------|-------------|--------|-------------|--------------|
| OQ-001 | <one-sentence question> | <why this matters, what stage raised it> | <role> | <name/role> | <YYYY-MM-DD> | Open | <blocker-for> | <PRD §N, story #M, OQ-###, ...> |
| OQ-002 | ... | ... | ... | ... | ... | ... | ... | ... |

## In discussion

| OQ-ID | Question | Context / why now | Raised by | Owner | Date raised | Status | Blocker-for | Linked items |
|-------|----------|-------------------|-----------|-------|-------------|--------|-------------|--------------|
| OQ-003 | ... | ... | ... | ... | ... | In discussion | <blocker-for> | ... |

## Resolved

| OQ-ID | Question | Resolution | Resolved by | Date resolved | Blocker-for (at time of resolve) | Linked items |
|-------|----------|------------|-------------|---------------|----------------------------------|--------------|
| OQ-004 | <question> | <what we decided + why> | <name/role> | <YYYY-MM-DD> | <value at the time> | <PRD §N, ...> |

> **Note:** the Resolved table drops the live-status columns and adds
> `Resolved by` + `Date resolved` + `Blocker-for (at time of resolve)`
> so the audit trail records the severity at decision time, not the
> current (possibly downgraded) severity.

## Wontfix / Deferred

| OQ-ID | Question | Why deferred | Revisit when | Raised by | Owner | Date raised | Date resolved | Blocker-for | Linked items |
|-------|----------|--------------|--------------|-----------|-------|-------------|---------------|-------------|--------------|
| OQ-005 | ... | ... | <phase or trigger> | ... | ... | ... | ... | <original blocker-for> | ... |

## Blocked

| OQ-ID | Question | Blocked by | Notes | Raised by | Owner | Date raised | Blocker-for | Linked items |
|-------|----------|------------|-------|-----------|-------|-------------|-------------|--------------|
| OQ-006 | ... | OQ-### | ... | ... | ... | ... | ... | ... |

---

## Filter views (used by agents — regenerated by tooling)

> These views are not maintained by hand. They are regenerated from the
> tables above using the locked `Status` and `Blocker-for` enums.
> Hand-maintained copies drift; if you need to copy a view into a
> commit message or PR body, regenerate first.

**Blocks PRD approval (must resolve before §13 sign-off):**
- Filter: `Status ∈ {Open, In discussion, Blocked} AND Blocker-for = PRD-approval`
- Render: `<OQ-ID> — <Question> — Owner: <Owner>`

**Blocks tech-decision-brief (SA cannot start Part 2):**
- Filter: `Status ∈ {Open, In discussion, Blocked} AND Blocker-for = tech`

**Blocks design work:**
- Filter: `Status ∈ {Open, In discussion, Blocked} AND Blocker-for = design`

**Blocks integration plan:**
- Filter: `Status ∈ {Open, In discussion, Blocked} AND Blocker-for = integration`

**Blocks code start:**
- Filter: `Status ∈ {Open, In discussion, Blocked} AND Blocker-for = code`

**Blocks QA test design:**
- Filter: `Status ∈ {Open, In discussion, Blocked} AND Blocker-for = qa`

**Non-blocking (informs, does not gate):**
- Filter: `Status ∈ {Open, In discussion} AND Blocker-for = none`
- Sorted by `Date raised DESC` so the user sees the newest sharpening
  questions first.

---

## Lifecycle rules (the BA Agent enforces these)

1. **Every question gets a row.** PRD review pass, BA intake interview,
   Design/Code/QA review — every question raised anywhere goes here.
2. **Every answer gets a row.** If a question is resolved inline (in
   chat, in a review comment), the resolution is **also** recorded in
   the Resolved table. No resolution without an audit row.
3. **Default `Blocker-for` is `none`.** Escalate only when the BA Agent
   cannot defensibly write a section without the answer.
4. **`PRD §11` is a mirror.** §11 lists the Open entries sorted by
   `Blocker-for` severity. Never edit §11 without updating the log; the
   Orchestrator's sign-off reads the log, not §11.
5. **Schema integrity.** A row missing a required field or using an
   out-of-enum value is a schema defect. The Requirements Reviewer
   rejects the PRD until every defect is fixed.
6. **Two question surfaces.** (a) Stage 0 intake (`idea-intake/`) — the
   chat answer or skip lands in `idea.md`'s Assumptions section; the
   resulting gap, if still open after the BA Agent's Stage 1 read of
   `idea.md`, gets a row here with `Blocker-for: PRD-approval` (genuinely
   blocking) or `none` (informative). (b) Stage 1 PRD review — every
   question asked here gets a row in this file directly.
7. **Post-PRD non-blocking list.** After producing the PRD draft, the
   BA Agent adds a fresh batch of `Status = Open`, `Blocker-for = none`
   rows — sharpening questions that inform but do not gate. The BA
   Agent does **not** wait for these before handing off.

---

*Every question raised in a PRD review pass, BA interview, or design/code review MUST be added here. If a question is resolved inline, the resolution must still be recorded in the Resolved table so the audit trail is complete.*
