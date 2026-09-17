// Build tab — Status list + Rules halves (build-tab-build-plan §4, build-tab.html
// §BU + §BUR, FR-1..FR-10 of build-story-requirements.md):
//   Status half — 4 summary tiles (FR-2), per-story rows in the compact
//                 3-column layout with a single status pill and NO .bd-stepper
//                 (FR-1), the rework queue card for failed QA/Review (FR-3),
//                 the display-only 3-Code-Agent strip (FR-4). Empty state when
//                 stories.md is missing (no fallback, SA-R-02 pattern).
//   Rules half — the Status/Rules kit-tab is a UI-only mode switch (FR-5, the
//                /build/rules deep-link just flips the initial half). Four
//                zones: read-only architecture card (FR-7, AC-15 lock icon +
//                caption), editable configurations grid against the closed
//                key set (FR-8), build & deploy rules markdown editor (FR-9),
//                and 4 collapsible per-agent guideline cards (FR-10).
//
// Gate: Build is a gated tab — until project context is confirmed, deep links
// bounce to Overview (ProjectSidebar gated:true, same pattern as Design).

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useOutletContext, useParams } from 'react-router-dom';
import {
  fetchBuildRules,
  fetchBuildStories,
  saveBuildAgentRules,
  saveBuildConfig,
  saveBuildRules,
  type BuildRulesPayload,
  type BuildStatus,
  type BuildStorySummary,
  type BuildStoriesResponse,
} from '../../lib/api';
import type { ProjectOutletContext } from '../ProjectDetailScreen';
import { MarkdownBody } from './markdown';

type Notice = { kind: 'success' | 'error'; text: string };
type Half = 'status' | 'rules';
type Filter = 'all' | 'building' | 'in_review' | 'done';

// The pill classes are shared app primitives (partials/projects.scss) — the
// build-status → pill mapping mirrors build-tab.html §BU rows (todo = Picked
// up, inprog = Building / Self-review, review = Ready for review, done =
// Ready for QA / Deployed, blocked = Rework).
const PILL_CLASS: Record<BuildStatus, string> = {
  picked_up: 'todo',
  building: 'inprog',
  self_review: 'inprog',
  ready_for_review: 'review',
  ready_for_qa: 'done',
  deployed_qa: 'done',
  rework: 'blocked',
};

function buildPill(st: BuildStatus): string {
  return PILL_CLASS[st];
}

// FR-1: rework stories render in their own queue card (FR-3), never in the
// main list — the main list is every story that is still moving forward.
function isRework(s: BuildStorySummary): boolean {
  return s.build_status === 'rework';
}

function inProgress(s: BuildStorySummary): boolean {
  return (
    s.build_status === 'picked_up' || s.build_status === 'building' || s.build_status === 'self_review'
  );
}

function inReview(s: BuildStorySummary): boolean {
  return s.build_status === 'ready_for_review';
}

function doneStatus(s: BuildStorySummary): boolean {
  return s.build_status === 'ready_for_qa' || s.build_status === 'deployed_qa';
}

const FILTERS: [Filter, string][] = [
  ['all', 'All'],
  ['building', 'Building'],
  ['in_review', 'In review'],
  ['done', 'Done'],
];

// FR-7 / AC-15 architecture rows (read-only; keys match DEFAULT_ARCHITECTURE).
const ARCH_ROWS: [string, string][] = [
  ['fe', 'FE'],
  ['bff', 'BFF'],
  ['be', 'BE'],
  ['db', 'DB'],
  ['host', 'Host'],
];

// FR-10 agent order + avatar kit (Code 1..3 + Reviewer), server keys fixed set.
const AGENT_ROWS: [string, string][] = [
  ['code-1', 'C1'],
  ['code-2', 'C2'],
  ['code-3', 'C3'],
  ['reviewer', 'RV'],
];

const AGENT_SUB: Record<string, string> = {
  'code-1': 'Active now · Building the current story · ETA per story',
  'code-2': 'Peer-reviews stories in Ready for review · ETA per story',
  'code-3': 'Idle · picks up the next story as work finishes',
  reviewer: 'Reviews the open PRs · security lens first',
};

function agentCardClass(key: string): string {
  return key === 'reviewer' ? 'rv' : key.replace('code-', 'c');
}

export function BuildScreen() {
  const { id } = useParams();
  const location = useLocation();
  const { project } = useOutletContext<ProjectOutletContext>();

  const storyListRef = useRef<HTMLDivElement | null>(null);
  const scrollTarget = (location.state as { storyId?: string } | null)?.storyId;

  // FR-5: the /build/rules URL deep-links into the Rules half; the kit-tab
  // switch is UI-only and never navigates.
  const isRulesRoute = /\/rules$/.test(location.pathname);
  const [half, setHalf] = useState<Half>(isRulesRoute ? 'rules' : 'status');
  const [filter, setFilter] = useState<Filter>('all');
  const [stories, setStories] = useState<BuildStoriesResponse | null>(null);
  const [storiesError, setStoriesError] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'ok' | 'error'>('loading');

  const [rules, setRules] = useState<BuildRulesPayload | null>(null);
  const [rulesLoaded, setRulesLoaded] = useState(false);
  const [rulesError, setRulesError] = useState<string | null>(null);

  // Rules-half editing state.
  const [configEditing, setConfigEditing] = useState<string | null>(null);
  const [configDraft, setConfigDraft] = useState('');
  const [configSaving, setConfigSaving] = useState(false);
  const [rulesEditing, setRulesEditing] = useState(false);
  const [rulesDraft, setRulesDraft] = useState('');
  const [rulesSaving, setRulesSaving] = useState(false);
  const [expandedAgents, setExpandedAgents] = useState<Set<string>>(new Set());
  const [agentEditing, setAgentEditing] = useState<string | null>(null);
  const [agentDraft, setAgentDraft] = useState('');
  const [agentSaving, setAgentSaving] = useState(false);

  const [notice, setNotice] = useState<Notice | null>(null);
  const noticeTimer = useRef<number | null>(null);

  const showNotice = useCallback((n: Notice) => {
    setNotice(n);
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 4000);
  }, []);

  const idOrSlug = id ?? '';

  // AC-10: returning from a story scrolls its source row into view.
  useEffect(() => {
    if (loadState === 'ok' && scrollTarget && storyListRef.current) {
      const row = storyListRef.current.querySelector<HTMLElement>(`[data-story-id="${scrollTarget}"]`);
      row?.scrollIntoView({ block: 'center' });
    }
  }, [loadState, scrollTarget]);

  // Load the story list once on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchBuildStories(idOrSlug);
        if (!cancelled) {
          setStories(data);
          setLoadState('ok');
        }
      } catch (err) {
        if (!cancelled) {
          setStoriesError(err instanceof Error ? err.message : 'Could not load the build list.');
          setLoadState('error');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [idOrSlug]);

  // Load the rules payload once, when the Rules half first opens.
  useEffect(() => {
    if (half !== 'rules' || rulesLoaded) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchBuildRules(idOrSlug);
        if (!cancelled) {
          setRules(data);
          setRulesLoaded(true);
          setRulesError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setRulesError(err instanceof Error ? err.message : 'Could not load the build rules.');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [half, rulesLoaded, idOrSlug]);

  // Cmd/Ctrl+Enter submits / Esc cancels inside the rules editors (FR-9/FR-10
  // keyboard contract).
  const rulesEditorKey = useCallback(
    (e: React.KeyboardEvent, submit: () => void, cancel: () => void) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        submit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancel();
      }
    },
    [],
  );

  const beginConfigEdit = (key: string, value: string) => {
    setConfigEditing(key);
    setConfigDraft(value);
  };

  const saveConfig = useCallback(
    async (key: string) => {
      const value = configDraft.trim();
      if (!value) return;
      setConfigSaving(true);
      try {
        await saveBuildConfig(idOrSlug, key, value);
        setRules((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            config: prev.config.map((row) => (row.key === key ? { key, value } : row)),
          };
        });
        setConfigEditing(null);
        showNotice({ kind: 'success', text: `Saved ${key} to code-builder/config-rules.md.` });
      } catch (err) {
        showNotice({ kind: 'error', text: err instanceof Error ? err.message : 'Could not save the config.' });
      } finally {
        setConfigSaving(false);
      }
    },
    [idOrSlug, configDraft, showNotice],
  );

  const saveRules = useCallback(async () => {
    setRulesSaving(true);
    setRulesError(null);
    try {
      await saveBuildRules(idOrSlug, rulesDraft);
      setRules((prev) => (prev ? { ...prev, rules: rulesDraft } : prev));
      setRulesEditing(false);
      showNotice({ kind: 'success', text: 'Build rules saved to code-builder/build-rules.md.' });
    } catch (err) {
      setRulesError(err instanceof Error ? err.message : 'Could not save the rules.');
      showNotice({ kind: 'error', text: err instanceof Error ? err.message : 'Could not save the rules.' });
    } finally {
      setRulesSaving(false);
    }
  }, [idOrSlug, rulesDraft, showNotice]);

  const saveAgent = useCallback(
    async (agent: string) => {
      setAgentSaving(true);
      setRulesError(null);
      try {
        await saveBuildAgentRules(idOrSlug, agent, agentDraft);
        setRules((prev) =>
          prev
            ? { ...prev, agents: { ...prev.agents, [agent]: { ...prev.agents[agent], content: agentDraft } } }
            : prev,
        );
        setAgentEditing(null);
        showNotice({ kind: 'success', text: `Saved to code-builder/agents/${agent}.md.` });
      } catch (err) {
        setRulesError(err instanceof Error ? err.message : 'Could not save the guidelines.');
        showNotice({ kind: 'error', text: err instanceof Error ? err.message : 'Could not save the guidelines.' });
      } finally {
        setAgentSaving(false);
      }
    },
    [idOrSlug, agentDraft, showNotice],
  );

  // Gate: Build is gated on project context confirmation. All hooks run above
  // so React's rules hold (DesignScreen pattern).
  if (project && !project.context_confirmed) {
    return <Navigate to={`/projects/${idOrSlug}/overview`} replace />;
  }

  const rows = stories?.stories.filter((s) => !isRework(s)) ?? [];
  const reworkRows = stories?.stories.filter(isRework) ?? [];

  const filtered = rows.filter((s) => {
    if (filter === 'building') return inProgress(s);
    if (filter === 'in_review') return inReview(s);
    if (filter === 'done') return doneStatus(s);
    return true;
  });

  const countBy = (fn: (s: BuildStorySummary) => boolean) => rows.filter(fn).length;
  const storySub = (s: BuildStorySummary): string => {
    const bits: string[] = [];
    if (s.reqs.length) bits.push(`From ${s.reqs.map((r) => r.id).join(', ')}`);
    if (s.points) bits.push(`${s.points} pts`);
    if (s.priority) bits.push(`${s.priority} priority`);
    return bits.join(' · ');
  };
  const reworkSub = (s: BuildStorySummary): string => {
    const bits: string[] = [`From ${s.reqs.map((r) => r.id).join(', ') || '—'}`];
    if (s.points) bits.push(`${s.points} pts`);
    bits.push(`failed at ${s.rework_origin === 'qa' ? 'QA' : 'Review'}`);
    if (s.rework_issues > 0) bits.push(`${s.rework_issues} ${s.rework_issues === 1 ? 'issue' : 'issues'}`);
    return bits.join(' · ');
  };

  const arch = rules?.architecture ?? {};
  const agentDisplay = (key: string): string => rules?.agents[key]?.display ?? key;

  return (
    <div className="build-screen">
      <div className="topbar">
        <Link to="/projects" style={{ fontSize: 13, color: 'var(--ink-2)', textDecoration: 'none' }}>
          ← Projects
        </Link>
      </div>

      {notice && (
        <div
          className="toast"
          role={notice.kind === 'error' ? 'alert' : 'status'}
          aria-live="polite"
          style={notice.kind === 'error' ? { background: 'var(--blush)' } : undefined}
        >
          <span className="toast-dot" aria-hidden="true" />
          {notice.text}
        </div>
      )}

      {/* Project header — no search / filter / export / + New build rule buttons
          anywhere on this tab (AC-9). The kit-tab switch is the only header
          action. */}
      <div className="card">
        <div className="proj-head">
          <div className={`ico-lg tile-${project?.tile_color ?? 'peach'}`} aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2b2547" strokeWidth={1.8}>
              <path d="M8 6l-5 6 5 6 M16 6l5 6-5 6" />
              <path d="M13 4l-2 16" />
            </svg>
          </div>
          <div>
            <h1>{project?.name ?? idOrSlug}</h1>
            <div className="one">{project?.one_liner}</div>
            <div className="path">
              {project?.folder_path} · {project?.current_stage ?? ''} stage
              {stories ? ` · ${stories.stories.length} stories` : ''}
            </div>
          </div>
          <div className="actions">
            <div className="split-switch" role="tablist" aria-label="Build status / rules">
              <button
                type="button"
                role="tab"
                aria-selected={half === 'status'}
                className={half === 'status' ? 'on' : undefined}
                onClick={() => setHalf('status')}
              >
                Status
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={half === 'rules'}
                className={half === 'rules' ? 'on' : undefined}
                onClick={() => setHalf('rules')}
              >
                Rules
              </button>
            </div>
          </div>
        </div>
      </div>

      {loadState === 'loading' && (
        <div className="card" style={{ marginTop: 14 }}>
          <div className="story-list" aria-hidden="true">
            {[0, 1, 2, 3, 4].map((i) => (
              <div className="story-row skeleton-row" key={i}>
                <div>
                  <div className="id skeleton" />
                  <span className="pill skeleton" />
                </div>
                <div>
                  <div className="title skeleton" />
                  <div className="sub skeleton" style={{ width: '55%' }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {loadState === 'error' && (
        <div className="center-stage" style={{ minHeight: 280 }}>
          <div className="center-card" style={{ textAlign: 'center' }}>
            <h1>Could not load the build list</h1>
            <p className="sub" style={{ textAlign: 'center' }}>
              {storiesError}
            </p>
          </div>
        </div>
      )}

      {loadState === 'ok' && half === 'status' && stories && (
        <>
          {/* FR-2 summary tiles */}
          <div className="card" style={{ marginTop: 14 }}>
            <div className="bd-stats">
              <div className="bd-stat">
                <div className="n">{countBy(inProgress)}</div>
                <div className="lbl">Being built</div>
                <div className="sub">Code Agents currently working</div>
              </div>
              <div className="bd-stat">
                <div className="n">{countBy(inReview)}</div>
                <div className="lbl">Ready for review</div>
                <div className="sub">PR open · Reviewer pending</div>
              </div>
              <div className="bd-stat">
                <div className="n">{countBy((s) => s.build_status === 'ready_for_qa')}</div>
                <div className="lbl">Ready for QA</div>
                <div className="sub">Reflected on QA tab as TM-*</div>
              </div>
              <div className="bd-stat">
                <div className="n">{countBy((s) => s.build_status === 'deployed_qa')}</div>
                <div className="lbl">Deployed to QA env</div>
                <div className="sub">
                  Build · {countBy((s) => s.build_status === 'deployed_qa')} passed · 0 failed ·{' '}
                  {reworkRows.length} in rework
                </div>
              </div>
            </div>
          </div>

          {/* Per-story build list — no .bd-stepper, single status pill (FR-1) */}
          <div className="card" style={{ marginTop: 14 }}>
            <div className="stories-head">
              <h3>Story build status</h3>
              <span className="pill todo">
                <span className="dot" /> {stories.stories.length} total
              </span>
              <div className="filter" role="group" aria-label="Filter stories by build status">
                {FILTERS.map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    className={filter === key ? 'on' : undefined}
                    aria-pressed={filter === key}
                    onClick={() => setFilter(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {rows.length === 0 ? (
              <div className="story-empty">
                {stories.missing_stories
                  ? 'No stories in Build yet — run story generation on the Sprint tab first.'
                  : 'No stories in Build yet.'}
                {stories.missing_stories && (
                  <div style={{ marginTop: 10 }}>
                    <Link className="btn btn-primary btn-pill" to={`/projects/${idOrSlug}/sprint`}>
                      Open Sprint board →
                    </Link>
                  </div>
                )}
              </div>
            ) : filtered.length === 0 ? (
              <div className="story-empty">No stories match this filter.</div>
            ) : (
              <div className="story-list" ref={storyListRef}>
                {filtered.map((s) => (
                  <div className="story-row" data-story={s.ticket_key} data-story-id={s.storyId} key={s.storyId}>
                    <div>
                      <div className="id">{s.ticket_key}</div>
                      {s.build_status && (
                        <span className={`pill ${buildPill(s.build_status)}`}>
                          <span className="dot" /> {s.status_pill}
                        </span>
                      )}
                    </div>
                    <div>
                      <div className="title">
                        {s.title}
                        <span className="sub">{storySub(s)}</span>
                      </div>
                    </div>
                    <Link
                      className="row-open"
                      to={`/projects/${idOrSlug}/build/${encodeURIComponent(s.storyId)}`}
                      data-story={s.ticket_key}
                      aria-label={`Open story ${s.ticket_key} in Build`}
                    >
                      Open story
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                        <path d="M9 6l6 6-6 6" />
                      </svg>
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* FR-3 rework queue (failed QA / review) */}
          {reworkRows.length > 0 && (
            <div className="card" style={{ marginTop: 14 }}>
              <div className="rework" style={{ paddingTop: 18 }}>
                <div className="rework-head">
                  <h3>Rework queue</h3>
                  <span className="pill blocked">
                    <span className="dot" /> {reworkRows.length}{' '}
                    {reworkRows.length === 1 ? 'story' : 'stories'} back from QA / Review
                  </span>
                  <span className="rework-note">QA fail / review fail → Build. Fix, re-PR, re-QA.</span>
                </div>
                {reworkRows.map((s) => (
                  <div className="rework-row" key={s.storyId}>
                    <div className="id">{s.ticket_key}</div>
                    <div className="why">
                      <b>{s.title}</b>
                      <span className="sub">{reworkSub(s)}</span>
                    </div>
                    <div>
                      <span className={`pill ${s.rework_origin === 'qa' ? 'blocked' : 'review'}`}>
                        <span className="dot" /> {s.rework_origin === 'qa' ? 'QA' : 'Review'} · failed
                      </span>
                    </div>
                    <div className="ev">
                      {s.rework_origin === 'qa' ? 'QA evidence →' : 'Review evidence →'}
                      <span className="sub">fix and re-PR</span>
                    </div>
                    <Link
                      className="btn btn-soft btn-pill"
                      to={`/projects/${idOrSlug}/build/${encodeURIComponent(s.storyId)}`}
                      aria-label={`Open ${s.ticket_key} in build`}
                    >
                      Open →
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* FR-4 code agent strip — display-only in this slice (no live agent
              state; ETA / pass rates are illustrative). */}
          <div className="card" style={{ marginTop: 14 }}>
            <div className="stories-head" style={{ paddingBottom: 8 }}>
              <h3>Code agents</h3>
              <span className="pill inprog">
                <span className="dot" /> 3 active
              </span>
            </div>
            <div className="agent-strip">
              <div className="agent-card c1">
                <div className="av">C1</div>
                <div className="meta">
                  <b>Code Agent 1</b>
                  <span className="sub">Building the current story · runs the gates before pushing</span>
                </div>
                <div className="right">
                  <span className="pill inprog">
                    <span className="dot" /> Building
                  </span>
                  <span className="pass-chip">
                    <span className="dot" /> 4/5 reviews
                  </span>
                </div>
              </div>
              <div className="agent-card c2">
                <div className="av">C2</div>
                <div className="meta">
                  <b>Code Agent 2</b>
                  <span className="sub">Peer-reviews stories in Ready for review · security lens first</span>
                </div>
                <div className="right">
                  <span className="pill review">
                    <span className="dot" /> Reviewing
                  </span>
                  <span className="pass-chip">
                    <span className="dot" /> 5/5 reviews
                  </span>
                </div>
              </div>
              <div className="agent-card c3">
                <div className="av">C3</div>
                <div className="meta">
                  <b>Code Agent 3</b>
                  <span className="sub">Idle · picks up the next story as work finishes</span>
                </div>
                <div className="right">
                  <span className="pill todo">
                    <span className="dot" /> Idle
                  </span>
                  <span className="pass-chip warn">
                    <span className="dot" /> 3/5 reviews
                  </span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {loadState === 'ok' && half === 'rules' && (
        <div className="rules-half">
          {/* v5.4 callout (AC-12): padded top so the heading clears the card
              edge; no View code-builder/ button. */}
          <div className="rules-preview" style={{ paddingTop: 16 }}>
            <b>Build rules.</b> Edits to build/deploy rules, configurations, and
            coding guidelines write back to <code>code-builder/</code> and{' '}
            <code>../skills/coding-guidelines.md</code>. Code agents pick them up
            on their next run.
          </div>

          <div className="rules-section">
            {/* FR-7 / AC-15 — read-only architecture card */}
            <div className="arch-card">
              <div className="arch-h">
                <h4>Build architecture</h4>
                <span className="edit-tag">Read only</span>
              </div>
              {ARCH_ROWS.map(([key, label]) => (
                <div className="arch-row" key={key}>
                  <span className="k">{label}</span>
                  <div className="v">
                    {arch[key] ?? ''}
                    {key === 'host' && (
                      <button
                        type="button"
                        className="lock"
                        aria-label="Architecture is read only"
                        title="To change stack or hosting, edit the rules below"
                      >
                        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                          <rect x="5" y="11" width="14" height="9" rx="2" />
                          <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              ))}
              <div className="arch-cap">
                Architecture is inferred by agents. To change stack or hosting, edit the rules
                below — your steering surface is one place, not two.
              </div>
            </div>

            {/* FR-8 — editable configurations (closed server key set) */}
            <div className="arch-card">
              <div className="arch-h">
                <h4>Configurations</h4>
                <span className="edit-tag">writes to code-builder/config-rules.md</span>
              </div>
              <div className="config-grid">
                {rules?.config.map((row) => (
                  <div className="config-row" key={row.key}>
                    <span className="k">{row.key}</span>
                    {configEditing === row.key ? (
                      <div className="v">
                        <input
                          aria-label={`Value for ${row.key}`}
                          value={configDraft}
                          maxLength={200}
                          onChange={(e) => setConfigDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              void saveConfig(row.key);
                            } else if (e.key === 'Escape') {
                              e.preventDefault();
                              setConfigEditing(null);
                            }
                          }}
                        />
                        <button
                          type="button"
                          className="mini"
                          disabled={configSaving || !configDraft.trim()}
                          onClick={() => void saveConfig(row.key)}
                        >
                          {configSaving ? 'Saving…' : 'Save'}
                        </button>
                        <button type="button" className="mini cancel" disabled={configSaving} onClick={() => setConfigEditing(null)}>
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="v">
                        {row.value || '—'}
                        <button
                          type="button"
                          className="pencil"
                          aria-label={`Edit ${row.key}`}
                          onClick={() => beginConfigEdit(row.key, row.value)}
                        >
                          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                            <path d="M12 20h9" />
                            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                          </svg>
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* FR-9 — build & deploy rules markdown editor */}
            <div className="md-card">
              <div className="md-h">
                <h4>Build &amp; deploy rules</h4>
                <span className="who">
                  writes to <code>code-builder/build-rules.md</code>
                </span>
                <div className="actions">
                  {rulesEditing ? (
                    <>
                      <button
                        type="button"
                        className="btn btn-soft btn-pill"
                        disabled={rulesSaving}
                        onClick={() => setRulesEditing(false)}
                      >
                        Cancel
                      </button>
                      <button type="button" className="btn btn-primary btn-pill" disabled={rulesSaving} onClick={() => void saveRules()}>
                        {rulesSaving ? 'Saving…' : 'Save'}
                      </button>
                    </>
                  ) : (
                    <button type="button" className="btn btn-soft btn-pill" onClick={() => setRulesEditing(true)}>
                      Edit
                    </button>
                  )}
                </div>
              </div>
              {rulesError && (
                <div style={{ fontSize: 11.5, color: 'var(--rose)', marginBottom: 8 }} role="alert">
                  {rulesError}
                </div>
              )}
              {rulesEditing ? (
                <textarea
                  className="md-editor"
                  aria-label="Edit build rules (markdown)"
                  value={rulesDraft}
                  onChange={(e) => setRulesDraft(e.target.value)}
                  onKeyDown={(e) => rulesEditorKey(e, () => void saveRules(), () => setRulesEditing(false))}
                  spellCheck={false}
                />
              ) : (
                <div className="md-body">
                  <MarkdownBody text={rules?.rules ?? ''} />
                </div>
              )}
            </div>

            {/* FR-10 — per-agent coding guidelines (collapsible) */}
            <div className="md-card">
              <div className="md-h">
                <h4>Per-agent coding guidelines</h4>
                <span className="who">
                  one per Code Agent + Reviewer · writes to <code>code-builder/agents/</code>
                </span>
              </div>
              <div className="agent-list">
                {AGENT_ROWS.map(([key, av]) => {
                  const expanded = expandedAgents.has(key);
                  const editing = agentEditing === key;
                  return (
                    <div className={`agent-md-card ${agentCardClass(key)}`} key={key}>
                      <div className="h">
                        <div className="av">{av}</div>
                        <div className="meta">
                          <b>{agentDisplay(key)}</b>
                          <span className="sub">{AGENT_SUB[key]}</span>
                        </div>
                        <div className="right">
                          {expanded ? (
                            <>
                              <button
                                type="button"
                                className="btn btn-soft btn-pill"
                                disabled={agentSaving}
                                onClick={() => {
                                  setAgentEditing(key);
                                  setAgentDraft(rules?.agents[key]?.content ?? '');
                                }}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="btn btn-soft btn-pill"
                                onClick={() => {
                                  setExpandedAgents((prev) => {
                                    const next = new Set(prev);
                                    next.delete(key);
                                    return next;
                                  });
                                  setAgentEditing(null);
                                }}
                              >
                                Collapse
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              className="btn btn-soft btn-pill"
                              onClick={() =>
                                setExpandedAgents((prev) => {
                                  const next = new Set(prev);
                                  next.add(key);
                                  return next;
                                })
                              }
                            >
                              Read guidelines
                            </button>
                          )}
                        </div>
                      </div>
                      {expanded &&
                        (editing ? (
                          <div className="body">
                            <textarea
                              className="md-editor"
                              aria-label={`Edit ${agentDisplay(key)} guidelines (markdown)`}
                              value={agentDraft}
                              onChange={(e) => setAgentDraft(e.target.value)}
                              onKeyDown={(e) =>
                                rulesEditorKey(e, () => void saveAgent(key), () => setAgentEditing(null))
                              }
                              spellCheck={false}
                            />
                            <div className="editor-actions">
                              <button type="button" className="btn btn-soft btn-pill" disabled={agentSaving} onClick={() => setAgentEditing(null)}>
                                Cancel
                              </button>
                              <button type="button" className="btn btn-primary btn-pill" disabled={agentSaving} onClick={() => void saveAgent(key)}>
                                {agentSaving ? 'Saving…' : 'Save'}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="body md-body">
                            <MarkdownBody text={rules?.agents[key]?.content ?? ''} />
                          </div>
                        ))}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
