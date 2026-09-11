# Requirements Redesign — Feature-Spec-Driven Model

**Status:** Approved for planning (Will, 2026-09-09). Implementation delegated to Code Agents after plan sign-off.
**Owner:** Solution Architect. **Related:** `sprint-requirements.md` (sprint board design), `requirements.html` (current mockup).

## 1. Context

Will requested a redesign of the Requirements tab. Today, Business Requirements (BRs) and Technical Requirements (TRs) are grouped under User Stories (US-NN). The target model groups them under **Features (FE-NN)**, and User Stories become a **BA-agent-derived artifact** consumed by the sprint board.

The broader goal: convert project background documents into requirements and feature specs, which generate user stories that new agents can pick up and split. This is **feature-spec-driven development** — the Feature entity is the feature spec container.

## 2. Decisions (Will, 2026-09-09)

| # | Decision | Detail |
|---|----------|--------|
| 1 | Story generation trigger lives in the **Sprint tab** | Once the sprint board exists, a "Generate user stories" button starts BA-agent generation from requirements, PRD, user journeys, etc. Not in the Requirements tab. |
| 2 | **No native board** | The sprint board connects to existing boards (Jira). No in-app Kanban. |
| 3 | **Existing projects migrate to features** | Each existing user story converts to a feature: title preserved, description kept but re-framed as a feature description (not a user-story description). TRs move under the feature; BRs re-link from `story=US-01` to `feature=FE-01`. |
| 4 | **Sprint board is a separate feature/PR** | The requirements redesign ships first; sprint board + story generation is a distinct workstream. |
| 5 | **Feature-spec alignment confirmed** | The Feature entity IS the feature spec. No conflict with feature-spec-driven development. Two additions close the gap: acceptance criteria and source links to background docs. |
| 6 | **Acceptance criteria at feature level** (Will, 2026-09-09) | Feature blocks carry an AC section (AC-NNN items). Derived user stories reference the ACs they satisfy (`acs=AC-001`). |
| 7 | **Source links on features** (Will, 2026-09-09) | Each feature links back to the background doc(s) it synthesizes (`source: user-journeys.md §3`). BA agent records the mapping during generation. |
| 6r | **Acceptance criteria at story level — REVISION of decision 6** (Will, 2026-09-11) | Features carry **no** AC section. Acceptance criteria are authored on each user story **when the story is generated (Run 2)**, not on the feature. Rationale: stories are the behavioral unit that maps 1:1 to Jira issues, so ACs — which accept a behavior — belong there; "feature done" = aggregate of its stories' ACs. Cross-cutting acceptances stay on BRs/TRs and the BA attaches the relevant AC to each participating story. |

### Revision log

- **2026-09-11 — decision 6 reversed:** original "AC at feature level" (2026-09-09) is superseded by decision **6r** above. Rationale chain preserved: ACs describe behavior acceptance → stories are the behavior unit that maps 1:1 to Jira issues → ACs are generated with the story in Run 2. The rationale that motivated decision 6 is retained here as history; it was overridden by Will on 2026-09-11 after architect recommendation. **Implementation status:** dispatched to Code Agent 4 to change PR #28's slice-1 schema + verify suite + Run-1 prompt before merge.

## 3. Target Model

```
Feature (FE-NN)  ← the feature spec
├── Description (problem statement / overview)
├── Source link (background doc: file + section)
├── Business requirements (BR-NNN)
├── Technical requirements (TR-NNN)
└── (derived) User stories (US-NN) ── reqs=BR-001,TR-002 ──► Sprint board → Jira
    └── Acceptance criteria (AC-NNN)  ← authored at story generation (Run 2), per story
```

> **Revision (2026-09-11):** ACs no longer live at feature level. See decision **6r** in §2. "Feature done" = aggregate of its stories' ACs (each story carries its own AC block).

### Traceability chain (powers new-agent task pickup)

```
User story → requirement → feature spec → background doc (PRD file/section)
```

A new agent picking up a story can trace the full context: the story's derived-from links give the requirements; the requirements' feature link gives the spec; the feature's source link gives the background doc.

## 4. Data Model Changes

### New: Feature entity
- `FeatureRow`: id (FE-NN), title, description, priority, status, owner, origin (`manual`|`generated`|null), source (background doc link), reqs[], block geometry, deleted
- On-disk home: new `features.md` (Feature blocks with BRs + TRs inside)
- `user-journeys.md` becomes the derived user-stories file

### New: Acceptance criteria (story-level, authored at story generation)
- AC-NNN items live inside **generated user-story blocks**, under an `## Acceptance Criteria` section — created by the BA agent during **Run 2** (story generation), not on the feature
- `AcRow`: id (AC-NNN), text, status (met/unmet), origin (`manual`|`generated`|null), lineIndex, raw
- Story blocks carry their own generated ACs; no `acs=` reference on the feature (**decision 6r, 2026-09-11**)

### Changed: ReqRow
- `storyUsId` → `featureId` for BRs (`<!-- BR-001: feature=FE-01 -->`)
- TRs move from inside story blocks to inside feature blocks

### Changed: StoryRow
- Stories become derived artifacts: carry `reqs=BR-001,TR-002` derived-from links
- Each story carries its own generated **Acceptance Criteria** section (`## Acceptance Criteria`, AC-NNN items authored in Run 2)
- No longer a grouping container in the Requirements tab

### Migration (existing projects)
- Each existing US-NN → FE-NN (title preserved)
- Description kept but re-framed: strip "As a… I want to… so that…" framing, keep substance
- TRs move under the feature; BRs re-link to the feature
- BA agent regenerates user stories from requirements (in the sprint board feature)

## 5. Generation Flow (two-phase)

- **Run 1 (Requirements tab):** BA agent generates Features + BRs + TRs (**no ACs — decision 6r**), and records each feature's `source` link to the background doc section it synthesizes. The "user stories" section of the current generation run is removed.
- **Run 2 (Sprint tab, separate feature):** BA agent generates user stories from approved requirements/PRD/user journeys, each carrying `reqs=` derived-from links **and its own `## Acceptance Criteria` section** (AC-NNN items authored here, per story — decision 6r). Gated on requirements being fleshed out.

## 6. UI Changes (Requirements tab)

- Group by Feature instead of by user story
- Feature blocks: ID pill (FE-NN), title, description, source link, priority/status/owner, BRs + TRs inside (no AC section — decision 6r)
- "Add feature" primary CTA (replaces "Add user story")
- "Unassigned requirements" group (replaces "Unassigned business requirements")
- Generation progress banner: features + BRs + TRs sections
- ACs render on generated user-story blocks (sprint board / story view), not on feature blocks

## 7. Feature-Spec Alignment (decision 5 detail)

The plan does not conflict with feature-spec-driven development — it is the foundation. The Feature entity is the feature spec container. Two additions close the gap (both approved by Will, 2026-09-09):

1. **Acceptance criteria (revised 2026-09-11, decision 6r):** ACs are authored on each generated user story in Run 2 (story block carries an `## Acceptance Criteria` section), not on the feature. Behavior-grounded: ACs accept the story's behavior, and stories map 1:1 to Jira issues (see sprint board). "Feature done" = all of its stories' ACs met. Cross-cutting acceptances that apply to multiple stories live on the shared BRs/TRs and the BA attaches the relevant AC to each participating story.
2. **Source links (decided):** each feature links back to the background doc(s) it synthesizes (e.g., `source: user-journeys.md §3`). This completes the traceability chain and makes the "convert background docs to features" pipeline explicit.

The current BA generation already synthesizes from the PRD files (coreFirst = prd.md, user-journeys.md, personas.md). The reorganization makes features the top-level synthesis unit instead of stories.

## 8. Implementation Slices

| Slice | Scope | Notes |
|-------|-------|-------|
| 1 | Data model + migration | Feature entity, features.md, story→feature conversion, ReqRow re-link |
| 2 | Two-phase generation | Run 1 = features+BRs+TRs; story generation deferred to sprint board |
| 3 | Requirements tab UI regroup | Feature-first grouping, add-feature CTA, unassigned group |
| 4 (separate feature) | Sprint board + story generation | Board, "Generate user stories" button, Jira connection, derived stories |

## 9. Open Questions

- ~~Acceptance criteria placement~~ — **resolved (Will, 2026-09-09): feature-level section, stories reference** — **then revised (Will, 2026-09-11): ACs move to story level, authored at story generation (Run 2). See decision 6r.**
- ~~Feature source links~~ — **resolved (Will, 2026-09-09): required on every feature; BA agent records the doc-section mapping during generation.**
- PRD gate impact: moving BRs out of prd.md §8 touches the 17-file gate. Keep gate green.
