// Design tab — list screen (plan §4, design-tab.html §D + §G):
//   Status half — summary stats, in-body filter pills, story rows (id · pill ·
//                 title · assignee · Open story →), display-only design-agent
//                 strip, and the story count. Empty state when stories.md is
//                 missing (no fallback to features/journeys — SA-R-02).
//   Rules half — the Status/Rules switch toggles an editable design-rules
//                 editor that writes back to the project's design-system/
//                 folder (AC-13: padding-top ≥ 16px callout, no
//                 "View design-system/" button).
//
// Gate: Design is a gated tab (ProjectSidebar gated:true) — until context is
// confirmed, deep links bounce to Overview like Sprint/other gated tabs.
// Story rows carry data-story + Open story → links to /projects/:id/design/:storyId.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useOutletContext, useParams } from 'react-router-dom';
import {
  fetchDesignRules,
  fetchDesignStories,
  saveDesignRules,
  type DesignStoriesResponse,
  type DesignStorySummary,
} from '../../lib/api';
import type { ProjectOutletContext } from '../ProjectDetailScreen';

type Notice = { kind: 'success' | 'error'; text: string };
type Filter = 'all' | 'in_design' | 'peer_review' | 'done';

// The pill classes are shared app primitives (partials/projects.scss) — the
// design-status → pill mapping mirrors design-tab.html §D rows.
const PILL_CLASS: Record<DesignStorySummary['design_status'], string> = {
  not_started: 'todo',
  in_design: 'inprog',
  peer_review: 'review',
  design_complete: 'done',
  ready_for_dev: 'done',
};

function designPill(design_status: DesignStorySummary['design_status']): string {
  return PILL_CLASS[design_status];
}

export function DesignScreen() {
  const { id } = useParams();
  const location = useLocation();
  const { project } = useOutletContext<ProjectOutletContext>();

  const [half, setHalf] = useState<'status' | 'rules'>('status');
  const [filter, setFilter] = useState<Filter>('all');
  const [stories, setStories] = useState<DesignStoriesResponse | null>(null);
  const [storiesError, setStoriesError] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'ok' | 'error'>('loading');

  const [rulesText, setRulesText] = useState('');
  const [rulesLoaded, setRulesLoaded] = useState(false);
  const [rulesSaved, setRulesSaved] = useState(true);
  const [rulesSaving, setRulesSaving] = useState(false);
  const [rulesError, setRulesError] = useState<string | null>(null);

  const [notice, setNotice] = useState<Notice | null>(null);
  const noticeTimer = useRef<number | null>(null);
  // Set when returning from a story detail via back-arrow (state.storyId) —
  // the source row keeps the purple .selected tint from FR-1/AC-12. Read once
  // from router state; the only setter is the router itself on next mount.
  const [selectedStoryId] = useState<string | null>(
    (location.state as { storyId?: string } | null)?.storyId ?? null,
  );

  const showNotice = useCallback((n: Notice) => {
    setNotice(n);
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 4000);
  }, []);

  const idOrSlug = id ?? '';

  // Load the story list once on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchDesignStories(idOrSlug);
        if (!cancelled) {
          setStories(data);
          setLoadState('ok');
        }
      } catch (err) {
        if (!cancelled) {
          setStoriesError(err instanceof Error ? err.message : 'Could not load the design list.');
          setLoadState('error');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [idOrSlug]);

  // Load the rules once, when the rules half first opens.
  useEffect(() => {
    if (half !== 'rules' || rulesLoaded) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchDesignRules(idOrSlug);
        if (!cancelled) {
          setRulesText(data.content);
          setRulesLoaded(true);
          setRulesSaved(true);
        }
      } catch (err) {
        if (!cancelled) {
          setRulesError(err instanceof Error ? err.message : 'Could not load the design rules.');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [half, rulesLoaded, idOrSlug]);

  // Scroll the source row into view when returning from a story detail with
  // state.storyId set (back-arrow returns + row highlight, FR-1/AC-12).
  const storyListRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!selectedStoryId || !storyListRef.current || loadState !== 'ok') return;
    const row = storyListRef.current.querySelector<HTMLElement>(`.story-row[data-story="${selectedStoryId}"]`);
    if (row) row.scrollIntoView({ block: 'center' });
  }, [selectedStoryId, loadState]);

  const saveRules = useCallback(async () => {
    setRulesSaving(true);
    setRulesError(null);
    try {
      await saveDesignRules(idOrSlug, rulesText);
      setRulesSaved(true);
      showNotice({ kind: 'success', text: 'Design rules saved to design-system/design-rules.md.' });
    } catch (err) {
      setRulesError(err instanceof Error ? err.message : 'Could not save the rules.');
      showNotice({ kind: 'error', text: err instanceof Error ? err.message : 'Could not save the rules.' });
    } finally {
      setRulesSaving(false);
    }
  }, [idOrSlug, rulesText, showNotice]);

  // Gate: Design is gated on project context confirmation. All hooks run
  // above so React's rules hold (SprintScreen pattern).
  if (project && !project.context_confirmed) {
    return <Navigate to={`/projects/${idOrSlug}/overview`} replace />;
  }

  const filtered = (stories?.stories ?? []).filter((s) => {
    if (filter === 'in_design') return s.design_status === 'in_design';
    if (filter === 'peer_review') return s.design_status === 'peer_review';
    if (filter === 'done') return s.design_status === 'design_complete' || s.design_status === 'ready_for_dev';
    return true;
  });

  const countBy = (st: DesignStorySummary['design_status']) =>
    (stories?.stories ?? []).filter((s) => s.design_status === st).length;

  const storySub = (s: DesignStorySummary): string => {
    const bits: string[] = [];
    if (s.reqs.length) bits.push(`From ${s.reqs.map((r) => r.id).join(', ')}`);
    if (s.ticket_key) bits.push(`${s.ticket_key} · ${s.card_column ?? ''}`.replace(/ · $/, ''));
    return bits.join(' · ');
  };

  return (
    <div className="design-screen">
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

      {/* Project header — no search / filter / export / + New design rule
          buttons anywhere on this screen (v5.5 AC-11). The switch is the only
          header action. */}
      <div className="card">
        <div className="proj-head">
          <div className={`ico-lg tile-${project?.tile_color ?? 'peach'}`} aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2b2547" strokeWidth={1.8}>
              <path d="M4 4h16v16H4z M4 9h16 M9 4v16" />
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
            <div className="split-switch" role="tablist" aria-label="Design list / rules">
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
        <div className="center-stage" style={{ minHeight: 320 }}>
          <div className="center-card" style={{ textAlign: 'center' }}>
            <h1>Loading…</h1>
          </div>
        </div>
      )}

      {loadState === 'error' && (
        <div className="center-stage" style={{ minHeight: 320 }}>
          <div className="center-card" style={{ textAlign: 'center' }}>
            <h1>Could not load the design list</h1>
            <p className="sub" style={{ textAlign: 'center' }}>
              {storiesError}
            </p>
          </div>
        </div>
      )}

      {loadState === 'ok' && half === 'status' && stories && (
        <>
          {/* Summary stats */}
          <div className="card" style={{ marginTop: 14 }}>
            <div className="ds-stats">
              <div className="ds-stat">
                <div className="n">{countBy('in_design')}</div>
                <div className="lbl">Being designed</div>
                <div className="sub">Design Agent A &amp; B currently working</div>
              </div>
              <div className="ds-stat">
                <div className="n">{countBy('peer_review')}</div>
                <div className="lbl">In peer review</div>
                <div className="sub">Review thread open on each story</div>
              </div>
              <div className="ds-stat">
                <div className="n">{countBy('design_complete')}</div>
                <div className="lbl">Design complete</div>
                <div className="sub">Ready to flip to “Ready for development”</div>
              </div>
              <div className="ds-stat">
                <div className="n">{countBy('ready_for_dev')}</div>
                <div className="lbl">Ready for development</div>
                <div className="sub">Reflected on Sprint board as {stories.stories.find((s) => s.ticket_key)?.ticket_key ?? 'tickets'}</div>
              </div>
            </div>
          </div>

          {/* Per-story design list */}
          <div className="card" style={{ marginTop: 14 }}>
            <div className="stories-head">
              <h3>Story design status</h3>
              <span className="pill todo">
                <span className="dot" /> {stories.stories.length} total
              </span>
              <div className="filter" role="group" aria-label="Filter stories by design status">
                {(
                  [
                    ['all', 'All'],
                    ['in_design', 'In design'],
                    ['peer_review', 'Peer review'],
                    ['done', 'Done'],
                  ] as [Filter, string][]
                ).map(([key, label]) => (
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

            {filtered.length === 0 ? (
              <div className="story-empty">
                {stories.missing_stories
                  ? 'No stories yet — run story generation on the Sprint tab first.'
                  : 'No stories match this filter.'}
              </div>
            ) : (
              <div className="story-list" ref={storyListRef}>
                {filtered.map((s) => (
                  <div
                    className={`story-row${selectedStoryId === s.storyId ? ' selected' : ''}`}
                    data-story={s.storyId}
                    key={s.storyId}
                  >
                    <div>
                      <div className="id">{s.storyId}</div>
                      <span className={`pill ${designPill(s.design_status)}`}>
                        <span className="dot" /> {s.status_pill}
                      </span>
                    </div>
                    <div>
                      <div className="title">
                        {s.title}
                        <span className="sub">{storySub(s)}</span>
                      </div>
                    </div>
                    <Link
                      className="row-open"
                      to={`/projects/${idOrSlug}/design/${s.storyId}`}
                      data-story={s.storyId}
                      aria-label={`Open story ${s.storyId}`}
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

          {/* Design agent strip — display-only in v5.5 (no live agent state). */}
          <div className="card" style={{ marginTop: 14 }}>
            <div className="stories-head" style={{ paddingBottom: 8 }}>
              <h3>Design agents</h3>
              <span className="pill inprog">
                <span className="dot" /> 2 active
              </span>
            </div>
            <div className="agent-strip">
              <div className="agent-card a">
                <div className="av">DA</div>
                <div className="meta">
                  <b>Design Agent A</b>
                  <span className="sub">Works a story from the status list · ETA is per story</span>
                </div>
                <div className="right">
                  <span className="pill inprog">
                    <span className="dot" /> Active
                  </span>
                  <span className="a11y-chip">
                    <span className="dot" /> 4/5 a11y
                  </span>
                </div>
              </div>
              <div className="agent-card b">
                <div className="av">DB</div>
                <div className="meta">
                  <b>Design Agent B</b>
                  <span className="sub">Peer-reviews stories in review · ETA is per story</span>
                </div>
                <div className="right">
                  <span className="pill review">
                    <span className="dot" /> Reviewing
                  </span>
                  <span className="a11y-chip warn">
                    <span className="dot" /> 3/5 a11y
                  </span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {loadState === 'ok' && half === 'rules' && (
        <div className="rules-half">
          <div className="rules-editor">
            <div className="md-h">
              <h4>Design rules</h4>
              <span className="who">
                writes to <code>design-system/design-rules.md</code>
              </span>
              <div className="actions">
                <button
                  type="button"
                  className="btn btn-soft btn-pill"
                  disabled={rulesSaving}
                  onClick={() => setHalf('status')}
                >
                  ← Status
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-pill"
                  disabled={rulesSaving}
                  onClick={saveRules}
                >
                  {rulesSaving ? 'Saving…' : rulesSaved ? 'Saved' : 'Save changes'}
                </button>
              </div>
            </div>
            {rulesError && (
              <div style={{ fontSize: 11.5, color: 'var(--rose)', marginBottom: 8 }} role="alert">
                {rulesError}
              </div>
            )}
            <textarea
              className="rules-textarea"
              aria-label="Design rules (Markdown)"
              value={rulesText}
              onChange={(e) => {
                setRulesText(e.target.value);
                setRulesSaved(false);
              }}
              spellCheck={false}
            />
            <div className="rules-preview">
              <b>Rules preview.</b> Edits write back to the project&rsquo;s
              design-system folder when you save. Design agents pick the rules
              up on their next run.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
