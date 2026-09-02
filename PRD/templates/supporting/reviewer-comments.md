# Reviewer Comments: <Project Name>

> Adversarial review log for the PRD. One file per review pass; the
> current pass is the active file. The Requirements Reviewer writes
> comments here; the BA Agent replies inline. PRD §13 is the one-line
> summary; this file is the full thread.

**Project:** <Project Name>
**Review pass:** <N> of <M>
**Started:** <Date>
**Reviewer:** Requirements Reviewer
**Author:** BA Agent
**Status:** in-review / agreed / blocked

---

## How to use this file

- The Reviewer adds comments inline, prefixed with `[REVIEWER]` and the date.
- The BA replies inline, prefixed with `[BA]` and the date, and marks the
  comment `RESOLVED` or `DEFERRED` (with reason).
- The Reviewer marks a thread `AGREED` when the BA's response is acceptable.
- The file ends with a **Reviewer Sign-off** block that the Orchestrator
  uses to promote the PRD to the next stage.
- All comments in PRD §13 should resolve to `AGREED` or `DEFERRED (with
  reason and owner)` before the PRD is approved.

---

## Cross-cutting concerns

> Comments that span multiple sections of the PRD. Section-specific
> comments are interleaved below.

### C-001 — <e.g., "MVP scope is too large">
- [REVIEWER] <date> — <comment>
- [BA] <date> — <response>
- Status: <OPEN / RESOLVED / DEFERRED / AGREED>

---

## Section-by-section review

### §1 Main Feature

#### 1.1 — <topic>
- [REVIEWER] <date> — <comment>
- [BA] <date> — <response>
- Status: <...>

### §2 Problem Alignment

#### 2.1 — <topic>
- [REVIEWER] <date> — <comment>
- [BA] <date> — <response>
- Status: <...>

### §3 Timing & Priority

#### 3.1 — <topic>
- ...

### §3a Constraints & NFRs

#### 3a.1 — <topic>
- ...

### §3b Tech Constraints

#### 3b.1 — <topic>
- ...

### §5 Target Users

#### 5.1 — <topic>
- ...

### §5a Stakeholder Map

#### 5a.1 — <topic>
- ...

### §6 UX Design Principles

#### 6.1 — <topic>
- ...

### §6a Success Metrics

#### 6a.1 — <topic>
- ...

### §7 Scope

#### 7.1 — <topic>
- ...

### §8 User Stories

#### 8.1 — <topic>
- ...

### §8a Phasing & Release Plan

#### 8a.1 — <topic>
- ...

### §9a Data Model

#### 9a.1 — <topic>
- ...

### §9b Integrations

#### 9b.1 — <topic>
- ...

### §11 User Clarifications

#### 11.1 — <topic>
- ...

### §11a Glossary

#### 11a.1 — <topic>
- ...

### §12 Assumptions

#### 12.1 — <topic>
- ...

### §12a Risks

#### 12a.1 — <topic>
- ...

### §13 Review Log

#### 13.1 — <topic>
- ...

---

## Reviewer Sign-off

> When every comment above is marked AGREED or DEFERRED, the Reviewer
> fills out this block. The Orchestrator reads this block to decide
> whether to promote the PRD to the next stage.

**Reviewer:** <name>
**Date:** <date>
**Pass:** <N> of <M>

**Outcome:**
- [ ] APPROVED — all comments resolved; PRD ready for next stage
- [ ] APPROVED WITH FOLLOW-UPS — PRD can proceed; follow-up items filed in `open-questions.md`
- [ ] NEEDS REVISION — significant issues remain; another review pass required

**Comments resolved in this pass:** <count>
**Comments deferred (with owner):** <count>
**Open questions added to `open-questions.md`:** <count>

**Reviewer signature:** <name + date>

---

*Each review pass overwrites this file. Older passes are preserved by renaming the file `reviewer-comments-pass-N.md` before the new pass begins. The Orchestrator reads only the active file.*
