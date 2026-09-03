// Overview tab — the project status dashboard (design/mockups.html #s3
// "Design active" · #s4 "Blocked" · #s5 "Deployed"; one tab, three states per
// design/sitemap.md § "Overview tab — collapses plan Screens 3, 4, 5").
//
// Data reality (PLANS/PROJECT_OVERVIEW_TAB.md §2): header card, stepper,
// current-stage panel, outstanding questions, activity feed, artifacts, and
// journey timeline render real rows from GET /api/projects/:id. Stage
// checklists, ship-summary numbers, team avatars, and per-stage journey
// summaries have no data source yet — they render honest seams, never
// invented numbers.
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ActivityRow, ArtifactRow, OutstandingQuestion, ProjectDetailProject, StageRow } from '../lib/api';
import {
  agentAvatar,
  artifactTag,
  journey as journeyEntries,
  overviewState,
  stageCallout,
  stepperSteps,
} from '../lib/overviewState';
import { dbTimestampToIso, formatRelative } from '../lib/formatRelative';
import { stageLabel, stagePill } from '../lib/stagePill';
import { OutstandingQuestions } from './new-idea/OutstandingQuestions';

type Props = {
  project: ProjectDetailProject;
  stages: StageRow[];
  activity: ActivityRow[];
  artifacts: ArtifactRow[];
  outstandingQuestions: OutstandingQuestion[];
};

// Stage transitions have no endpoint yet (`on_hold` isn't even in the DB
// status CHECK) — the mockup buttons render disabled with an explanatory
// tooltip until the stage-agents task ships them (plan §6 D1).
const TRANSITION_TOOLTIP =
  'Stage transitions ship with the stage-agents task — display-only for now.';

export function ProjectOverview({ project, stages, activity, artifacts, outstandingQuestions }: Props) {
  const navigate = useNavigate();
  const state = overviewState(project);
  const pill = stagePill(project.status, project.current_stage);
  const steps = stepperSteps(project, stages);
  const stageName = stageLabel(project.current_stage);
  const callout = stageCallout(project.current_stage);
  // `now` fixed per render so all relative ages agree for one snapshot.
  const now = useMemo(() => Date.now(), []);

  const stageRow = stages.find((r) => r.stage_key === project.current_stage);
  const startedRel =
    stageRow?.started_at
      ? formatRelative(dbTimestampToIso(stageRow.started_at), now)
      : null;

  const journey = state === 'done' ? journeyEntries(stages) : [];

  return (
    <div className="ov-wrap">
      {/* Header card + 7-stage stepper (mockup #s3) */}
      <section className="card" aria-label="Project status">
        <div className="proj-head">
          <div className={`ico-lg tile-${project.tile_color}`} aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2b2547" strokeWidth={1.8}>
              <path d="M3 12l9-9 9 9 M5 10v10h14V10" />
            </svg>
          </div>
          <div>
            <h1>{project.name}</h1>
            <div className="one">{project.one_liner}</div>
            <div className="path">
              {project.folder_path} · Updated {project.updated_relative}
            </div>
          </div>
          <div className="actions">
            {/* TODO(roster): the mockup's team avatars in the header have no
                roster API — omitted rather than invented (plan §2, same
                discipline as PR #13's omitted count chips). */}
            <span className={`pill ${pill.cls}`}><span className="dot" /> {pill.label}</span>
          </div>
        </div>
        <div className="stepper">
          {steps.map((s, i) => (
            <div
              key={s.label}
              className={`step ${s.cls}`.trim()}
              aria-current={s.cls === 'active' || s.cls === 'blocked' ? 'step' : undefined}
              aria-label={`Step ${i + 1}: ${s.label} — ${s.cls || 'upcoming'}`}
            >
              <div className="num"><b>{i + 1}</b></div>
              <div className="lbl">{s.label}</div>
              {i < steps.length - 1 && <div className="bar" />}
            </div>
          ))}
        </div>
      </section>

      <div className="detail-grid">
        {/* Left column */}
        <div className="ov-col">
          {state !== 'done' && (
            <section className="card" aria-label="Current stage">
              <div className="card-head">
                <h3>Current stage — {stageName}</h3>
                <span className={`pill ${pill.cls}`}><span className="dot" /> {pill.label}</span>
              </div>
              <div className="callout">
                <span className="pulse" aria-hidden="true" />
                <div className="lbl"><b>{callout.agents}</b> {callout.text}</div>
                {startedRel && <div className="who">Started {startedRel}</div>}
              </div>

              {/* Stage checklist — TODO(stage-agents): items will live in the
                  stage.meta JSON once the stage agents write them. The panel
                  renders with an honest empty state today (plan §2). */}
              <h3 className="ov-check-head">{stageName} checklist</h3>
              <div className="ov-empty">
                No checklist items yet — the stage agents populate this as work begins.
              </div>

              <div className="ov-actions">
                <button type="button" className="btn btn-primary" disabled title={TRANSITION_TOOLTIP}>
                  Mark {stageName} complete
                </button>
                <button type="button" className="btn btn-ghost" disabled title={TRANSITION_TOOLTIP}>
                  Pause stage
                </button>
              </div>
            </section>
          )}

          {state === 'blocked' && (
            <section className="card" aria-label="Outstanding questions">
              <div className="card-head tight">
                <h3>Outstanding questions</h3>
                <span className="pill inprog"><span className="dot" /> {outstandingQuestions.length} open</span>
              </div>
              <p className="ov-sub">
                The BA Agent is waiting on these before finalising requirements. Open the chat to answer.
              </p>
              {/* Read-only per sitemap decision 5 — `Open chat →` below is the
                  sole way to answer. */}
              <OutstandingQuestions
                questions={outstandingQuestions}
                onPick={() => {}}
                disabled
                readOnly
                withHeading={false}
                scroll
              />
              <div className="ov-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => navigate(`/new?resume=${project.slug}`)}
                >
                  Open chat →
                </button>
              </div>
            </section>
          )}

          {state === 'done' && (
            <section className="card" aria-label="Journey">
              <h3>Journey</h3>
              {journey.length === 0 ? (
                <div className="ov-empty">No completed stage history yet.</div>
              ) : (
                <div className="q-scroll ov-scroll-260">
                  {journey.map((e) => (
                    <div className="check done" key={e.label}>
                      <div className="box">✓</div>
                      <div className="lbl">{e.label}</div>
                      <span className="meta">{e.duration}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>

        {/* Right column — active/blocked: Activity + Artifacts; done: Ship
            summary + Artifacts only (sitemap decision 3: no Activity). */}
        <div className="ov-col">
          {state === 'done' && (
            <section className="card" aria-label="Ship summary">
              <h3>Ship summary</h3>
              {/* TODO(features API): no feature counts or totals exist yet —
                  values stay "—" rather than invented (plan §2). */}
              <div className="ship-grid">
                <div className="ship-tile mint">
                  <div className="k">Total time</div>
                  <div className="v">—</div>
                </div>
                <div className="ship-tile peach">
                  <div className="k">Features deployed</div>
                  <div className="v">—</div>
                </div>
              </div>
            </section>
          )}

          {state !== 'done' && (
            <section className="card" aria-label="Activity">
              <h3>Activity</h3>
              {activity.length === 0 ? (
                <div className="ov-empty">No activity yet.</div>
              ) : (
                <div className="tl q-scroll ov-scroll-260">
                  {/* Index key: the activity query selects display columns
                      only (no row id) and the feed is render-once per load. */}
                  {activity.map((a, i) => {
                    const av = agentAvatar(a.agent);
                    return (
                      <div className="tl-item" key={i}>
                        <div className={`av-lg ${av.cls}`}>{av.initials}</div>
                        <div className="body">
                          <div className="who">
                            {av.name} <span>·</span> <span>{formatRelative(dbTimestampToIso(a.ts), now)}</span>
                          </div>
                          <div className="msg">{a.message}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          <section className="card" aria-label="Artifacts">
            <h3>Artifacts</h3>
            {artifacts.length === 0 ? (
              <div className="ov-empty">No artifacts yet.</div>
            ) : (
              <div className="art q-scroll ov-scroll-220">
                {/* Index key: artifacts are display rows fetched per load with
                    no row identity — same read-only contract as the activity
                    feed (see comment above the activity map). */}
                {artifacts.map((a, i) => (
                  <div className="art-item" key={i}>
                    <span className="ftag">{artifactTag(a.kind)}</span>
                    <span className="lbl">{a.label}</span>
                    <span className="path">{a.path}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}