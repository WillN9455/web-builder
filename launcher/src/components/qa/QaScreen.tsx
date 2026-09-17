// QA tab — Status list (qa-tab build plan §4; qa-tab.html §Q, zones 1–9):
//   Verdict banner (all-pass mint + sign-off) · environment panel (empty
//   state until Build deploys, SA-R-102) · 6 stat tiles + pass-rate footnote ·
//   coverage strip with untested drill-down · per-story test list (7 filter
//   chips, test strips, screenshot thumbs, round-trip lines, escalation hint) ·
//   QA agent panel · tools panel · compact Results-by-dimension lanes.
//
// Gate: QA is a gated tab (ProjectSidebar gated:true) — deep links bounce to
// Overview until context is confirmed (SprintScreen/DesignScreen pattern).
//
// Pass-rate denominator rule (sitemap § QA): Passed / (Passed + Failed +
// Blocked); Flaky is excluded from the numerator and tracked separately. A
// story only blocks sign-off while failed / in_qa / ready_for_qa — flaky and
// blocked_skipped do not block deploy. The all-pass mint variant + sign-off
// button fire POST /qa/signoff (409 → surfaced verbatim).

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useOutletContext, useParams } from 'react-router-dom';
import {
  QaHttpError,
  fetchQaCoverage,
  fetchQaStories,
  qaSignoff,
  triggerQaRuns,
  type QaCoverageResponse,
  type QaStoriesResponse,
  type QaStorySummary,
  type QaStatus,
} from '../../lib/api';
import type { ProjectOutletContext } from '../ProjectDetailScreen';

type Notice = { kind: 'success' | 'error'; text: string };
type Filter = 'all' | QaStatus;

// Pill classes are shared app primitives (partials/projects.scss). The QA
// status → pill mapping mirrors qa-tab.html §Q rows; `flaky` is new (added in
// the QA partial, _qa.scss).
const PILL_CLASS: Record<QaStatus, string> = {
  ready_for_qa: 'todo',
  in_qa: 'inprog',
  passed: 'done',
  failed: 'blocked',
  flaky: 'flaky',
  blocked_skipped: 'draft',
};

const FILTERS: [Filter, string][] = [
  ['all', 'All'],
  ['ready_for_qa', 'Ready for QA'],
  ['in_qa', 'In QA'],
  ['passed', 'Passed'],
  ['failed', 'Failed'],
  ['flaky', 'Flaky'],
  ['blocked_skipped', 'Blocked'],
];

function countBy(rows: QaStorySummary[], st: QaStatus): number {
  return rows.filter((s) => s.qa_status === st).length;
}

export function QaScreen() {
  const { id } = useParams();
  const location = useLocation();
  const { project, onQaCount } = useOutletContext<ProjectOutletContext>();

  const [filter, setFilter] = useState<Filter>('all');
  const [stories, setStories] = useState<QaStoriesResponse | null>(null);
  const [storiesError, setStoriesError] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'ok' | 'error'>('loading');
  const [coverage, setCoverage] = useState<QaCoverageResponse | null>(null);
  const [showUntested, setShowUntested] = useState(false);
  const [running, setRunning] = useState(false);
  const [signing, setSigning] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const noticeTimer = useRef<number | null>(null);
  // Row to scroll into view when returning from a story detail via back-arrow
  // (state.storyId — same round-trip as the design tab, FR-1/AC-12 parity).
  const [selectedStoryId] = useState<string | null>(
    (location.state as { storyId?: string } | null)?.storyId ?? null,
  );

  const showNotice = useCallback((n: Notice) => {
    setNotice(n);
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 4000);
  }, []);

  const idOrSlug = id ?? '';

  const reload = useCallback(async () => {
    try {
      const [s, c] = await Promise.all([fetchQaStories(idOrSlug), fetchQaCoverage(idOrSlug)]);
      setStories(s);
      setCoverage(c);
      setLoadState('ok');
    } catch (err) {
      setStoriesError(err instanceof Error ? err.message : 'Could not load the QA list.');
      setLoadState('error');
    }
  }, [idOrSlug]);

  // Load the story list + coverage once on mount, and whenever the outlet
  // project loads after us (deep-link refresh — the gate resolves on load).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [s, c] = await Promise.all([fetchQaStories(idOrSlug), fetchQaCoverage(idOrSlug)]);
        if (!cancelled) {
          setStories(s);
          setCoverage(c);
          setLoadState('ok');
        }
      } catch (err) {
        if (!cancelled) {
          setStoriesError(err instanceof Error ? err.message : 'Could not load the QA list.');
          setLoadState('error');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [idOrSlug, reload]);

  // Scroll the source row into view when returning from a story detail
  // (back-arrow sets router state, DesignScreen parity).
  const listRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!selectedStoryId || !listRef.current || loadState !== 'ok') return;
    const row = listRef.current.querySelector<HTMLElement>(`.qa-row[data-story="${selectedStoryId}"]`);
    if (row) row.scrollIntoView({ block: 'center' });
  }, [selectedStoryId, loadState]);

  // Sidebar chip — failing + pending count (failed/in_qa/ready_for_qa stories;
  // the states that block sign-off). Nulled on unmount so the chip never
  // outlives this screen as its data source (requirementsCount pattern).
  const pendingCount = stories
    ? countBy(stories.stories, 'failed') + countBy(stories.stories, 'in_qa') + countBy(stories.stories, 'ready_for_qa')
    : null;
  useEffect(() => {
    onQaCount?.(pendingCount && pendingCount > 0 ? pendingCount : null);
    return () => onQaCount?.(null);
  }, [onQaCount, pendingCount]);

  const runAll = useCallback(async () => {
    setRunning(true);
    try {
      await triggerQaRuns(idOrSlug, 'full');
      showNotice({ kind: 'success', text: 'Full suite queued — the QA Agent picks the runs up.' });
      await reload();
    } catch (err) {
      showNotice({ kind: 'error', text: err instanceof Error ? err.message : 'Could not queue the run.' });
    } finally {
      setRunning(false);
    }
  }, [idOrSlug, reload, showNotice]);

  const runStory = useCallback(async (s: QaStorySummary) => {
    setRunning(true);
    try {
      await triggerQaRuns(idOrSlug, s.ticket_key ? `story ${s.ticket_key}` : 'smoke');
      showNotice({ kind: 'success', text: `QA run queued for ${s.ticket_key ?? s.storyId}.` });
      await reload();
    } catch (err) {
      showNotice({ kind: 'error', text: err instanceof Error ? err.message : 'Could not queue the run.' });
    } finally {
      setRunning(false);
    }
  }, [idOrSlug, reload, showNotice]);

  const signOff = useCallback(async () => {
    setSigning(true);
    try {
      await qaSignoff(idOrSlug);
      showNotice({ kind: 'success', text: 'Signed off — QA passed, project advanced to Deployed.' });
      await reload();
    } catch (err) {
      if (err instanceof QaHttpError && err.status === 409) {
        showNotice({ kind: 'error', text: `Sign-off blocked: ${err.message}` });
      } else {
        showNotice({ kind: 'error', text: err instanceof Error ? err.message : 'Sign-off failed.' });
      }
    } finally {
      setSigning(false);
    }
  }, [idOrSlug, reload, showNotice]);

  // Gate: QA is gated on project-context confirmation. All hooks run above so
  // React's rules hold (SprintScreen/DesignScreen pattern).
  if (project && !project.context_confirmed) {
    return <Navigate to={`/projects/${idOrSlug}/overview`} replace />;
  }

  const rows = stories?.stories ?? [];
  const total = rows.length;
  const ready = countBy(rows, 'ready_for_qa');
  const inQa = countBy(rows, 'in_qa');
  const passed = countBy(rows, 'passed');
  const failed = countBy(rows, 'failed');
  const flaky = countBy(rows, 'flaky');
  const blocked = countBy(rows, 'blocked_skipped');
  // Denominator rule: Passed / (Passed + Failed + Blocked) — Flaky excluded.
  const denominator = passed + failed + blocked;
  const passRate = denominator > 0 ? Math.round((passed / denominator) * 100) : 0;
  const allPass = total > 0 && failed === 0 && inQa === 0 && ready === 0;

  const filtered = rows.filter((s) => (filter === 'all' ? true : s.qa_status === filter));

  const verdict = allPass
    ? {
        cls: 'all-pass',
        headline: `${passed}/${total} stories Passed — ready to deploy to QA env`,
        sub: 'All stories passed · flaky/blocked excluded from the pass rate · deploy to finish QA.',
      }
    : {
        cls: '',
        headline:
          `${passed}/${total} stories Passed` +
          (failed ? ` · ${failed} Failed (in rework)` : '') +
          (inQa ? ` · ${inQa} In QA` : '') +
          (ready ? ` · ${ready} Ready for QA` : '') +
          ' — not ready for deploy',
        sub: failed
          ? 'Resolve the failed stories in Build, then re-run QA to deploy to QA env.'
          : 'Stories still in flight — sign-off unlocks when every story passes.',
      };

  const coveredPct =
    coverage && coverage.total > 0 ? Math.round((coverage.covered_count / coverage.total) * 100) : 0;

  return (
    <div className="qa-screen">
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

      {/* Project header — the cog opens the QA Rules screen (qa-tab.html §Q
          header; parity with build-tab .hdr-cog chrome). */}
      <div className="card">
        <div className="proj-head">
          <div className={`ico-lg tile-${project?.tile_color ?? 'peach'}`} aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2b2547" strokeWidth={1.8}>
              <path d="M9 12l2 2 4-4 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
            </svg>
          </div>
          <div>
            <h1>{project?.name ?? idOrSlug}</h1>
            <div className="one">{project?.one_liner}</div>
            <div className="path">
              {project?.folder_path} · {project?.current_stage ?? ''} stage
              {stories ? ` · ${total} stories on the QA board` : ''}
            </div>
          </div>
          <div className="actions">
            <span className="pill inprog">
              <span className="dot" /> QA
            </span>
            <Link to={`/projects/${idOrSlug}/qa/rules`} className="hdr-cog" aria-label="Open QA rules">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
              </svg>
              <span>Rules</span>
            </Link>
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
            <h1>Could not load the QA list</h1>
            <p className="sub" style={{ textAlign: 'center' }}>
              {storiesError}
            </p>
          </div>
        </div>
      )}

      {loadState === 'ok' && stories && (
        <>
          {rows.length === 0 ? (
            <div className="card" style={{ marginTop: 14 }}>
              <div className="story-empty">
                {stories.missing_stories
                  ? 'No stories yet — run story generation on the Sprint tab first.'
                  : 'No stories on the QA board yet.'}
              </div>
            </div>
          ) : (
            <>
              {/* Verdict banner (B.14) — mint when all pass; button fires sign-off. */}
              <div className="card" style={{ marginTop: 14 }}>
                <div className={`qa-verdict ${verdict.cls}`}>
                  <div className="ico">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                      <circle cx="12" cy="12" r="9" />
                      <path d="M8 12l3 3 5-6" />
                    </svg>
                  </div>
                  <div className="body">
                    <div className="headline">{verdict.headline}</div>
                    <div className="sub">{verdict.sub}</div>
                  </div>
                  <div className="actions">
                    <button
                      type="button"
                      className="btn btn-ghost btn-pill"
                      disabled={!allPass || signing}
                      onClick={() => void signOff()}
                    >
                      {signing ? 'Signing off…' : 'Sign off & deploy →'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Environment panel (B.7) — read-only empty state until Build
                  ships a deploy record (SA-R-102). */}
              <div className="card" style={{ marginTop: 14 }}>
                <div className="qa-env">
                  <div className="h">
                    <svg className="ico" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} style={{ color: 'var(--blue)' }}>
                      <circle cx="12" cy="12" r="3" />
                      <path d="M3 12h6 M15 12h6 M12 3v6 M12 15v6" />
                    </svg>
                    <h4>QA environment</h4>
                    <span className="badge">not deployed yet</span>
                  </div>
                  <div className="row">
                    <div className="k">QA env URL</div>
                    <div className="v">Not deployed yet</div>
                  </div>
                  <div className="row">
                    <div className="k">Build / commit</div>
                    <div className="v">—</div>
                  </div>
                  <div className="row">
                    <div className="k">Deployed at</div>
                    <div className="v">—</div>
                  </div>
                  <div className="caption">
                    Build ships the deploy record here after its first deploy (qa-tab build plan SA-R-102).
                  </div>
                </div>
              </div>

              {/* QA summary stats — 6 tiles + pass-rate footnote. */}
              <div className="card" style={{ marginTop: 14 }}>
                <div className="qa-stats">
                  <div className="qa-stat">
                    <div className="n">{ready}</div>
                    <div className="lbl">Ready for QA</div>
                    <div className="sub">From Build&rsquo;s &ldquo;Ready for QA&rdquo; queue</div>
                    <span className="rate">{ready} stories</span>
                  </div>
                  <div className="qa-stat">
                    <div className="n">{inQa}</div>
                    <div className="lbl">In QA</div>
                    <div className="sub">Run queued / Playwright running</div>
                    <span className="rate">{inQa} stories</span>
                  </div>
                  <div className="qa-stat">
                    <div className="n">{passed}</div>
                    <div className="lbl">Passed</div>
                    <div className="sub ok">Every acceptance criterion green</div>
                    <span className="rate">{denominator > 0 ? `${passRate}%` : '—'}</span>
                  </div>
                  <div className="qa-stat">
                    <div className="n">{failed}</div>
                    <div className="lbl">Failed</div>
                    <div className="sub warn">→ Build rework queue · evidence linked</div>
                    <span className="rate">{denominator > 0 ? `${Math.round((failed / denominator) * 100)}%` : '—'}</span>
                  </div>
                  <div className="qa-stat">
                    <div className="n">{flaky}</div>
                    <div className="lbl">Flaky</div>
                    <div className="sub warn">excluded from pass rate · review for quarantine</div>
                    <span className="rate">{total > 0 ? `${flaky} stories` : '—'}</span>
                  </div>
                  <div className="qa-stat">
                    <div className="n">{blocked}</div>
                    <div className="lbl">Blocked / Skipped</div>
                    <div className="sub">not blocking deploy</div>
                    <span className="rate">{blocked} stories</span>
                  </div>
                </div>
                <div className="qa-footnote">
                  Pass rate = Passed / (Passed + Failed + Blocked). Flaky runs are excluded from
                  the numerator; tracked separately for quarantine.
                </div>
              </div>

              {/* Coverage strip (B.8) — AC coverage + untested drill-down. */}
              <div className="card" style={{ marginTop: 14 }}>
                <div className="qa-coverage">
                  <div>
                    <div className="n">
                      {coverage?.covered_count ?? 0} / {coverage?.total ?? 0}
                    </div>
                    <div className="lbl">
                      acceptance criteria covered{' '}
                      <span className="muted">· {(coverage?.untested_count ?? 0) === 0 ? 'all tested' : `${coverage?.untested_count ?? 0} untested`}</span>
                    </div>
                  </div>
                  <div className="bar" aria-hidden="true">
                    <div className="fill" style={{ width: `${coveredPct}%` }} />
                  </div>
                  <div className="actions">
                    <button
                      type="button"
                      className="btn btn-soft btn-pill"
                      aria-expanded={showUntested}
                      onClick={() => setShowUntested((v) => !v)}
                    >
                      {showUntested ? 'Hide untested' : `View untested (${coverage?.untested_count ?? 0})`}
                    </button>
                  </div>
                </div>
                {showUntested && coverage && coverage.untested.length > 0 && (
                  <div className="qa-untested" style={{ padding: '0 18px 14px' }}>
                    {coverage.untested.map((u) => (
                      <span className="pill draft" key={`${u.storyId}-${u.ac}`}>
                        <span className="dot" /> {u.ac} · {u.storyId}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Per-story QA test list */}
              <div className="card" style={{ marginTop: 14 }}>
                <div className="stories-head">
                  <h3>Story test results</h3>
                  <span className="pill todo">
                    <span className="dot" /> {total} tested · {failed} failed · {flaky} flaky
                  </span>
                  <span className="qa-scope">Full suite</span>
                  <button
                    type="button"
                    className="btn btn-primary btn-pill"
                    disabled={running}
                    onClick={() => void runAll()}
                  >
                    {running ? 'Queuing…' : 'Re-run all tests'}
                  </button>
                  <div className="filter" role="group" aria-label="Filter stories by QA status">
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
                  {/* Live region for run/queue state (C.18 running state). */}
                  <div aria-live="polite" className="sr-only">
                    {running ? 'A QA run is queued.' : ''}
                  </div>
                </div>

                {filtered.length === 0 ? (
                  <div className="story-empty">No stories match this filter.</div>
                ) : (
                  <div ref={listRef}>
                    {filtered.map((s) => (
                      <QaRow
                        key={s.storyId}
                        story={s}
                        idOrSlug={idOrSlug}
                        running={running}
                        selected={selectedStoryId === s.storyId}
                        onRunStory={() => void runStory(s)}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* QA agent panel (B.13) — display-only (plan §2: no agent runtime). */}
              <div className="card" style={{ marginTop: 14 }}>
                <div style={{ padding: '18px 22px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                    <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>QA agent panel</h3>
                    <span className="pill inprog" style={{ fontSize: 10.5 }}>
                      <span className="dot" /> 1 active · 1 idle
                    </span>
                  </div>
                  <div className="agent-strip">
                    <div className="qa-agent-card">
                      <div className="avatar qa">QA</div>
                      <div>
                        <div className="name">QA Agent</div>
                        <div className="activity">
                          {inQa > 0 ? `${inQa} story(ies) queued · run state recorded here` : 'Idle · waiting for the next run trigger'}
                        </div>
                        <div className="queue">
                          Queue: {ready > 0 ? `${ready} ready` : 'empty'} · re-runs picked up on demand
                        </div>
                      </div>
                      <div className="right">
                        <span className="pass-chip">
                          <span className="dot" /> {inQa > 0 ? 'live' : 'idle'}
                        </span>
                      </div>
                    </div>
                    <div className="qa-agent-card">
                      <div className="avatar rev">R</div>
                      <div>
                        <div className="name">Reviewer Agent</div>
                        <div className="activity">Confirms failures, triages environmental blocks</div>
                        <div className="queue">Awaiting: next failed run</div>
                      </div>
                      <div className="right">
                        <span className="pass-chip skip">
                          <span className="dot" /> idle
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* QA tools panel — Playwright config + test rules (read from testing/). */}
              <div className="card" style={{ marginTop: 14 }}>
                <div style={{ padding: '18px 22px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                    <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>QA tools</h3>
                    <span className="pill inprog" style={{ fontSize: 10.5 }}>
                      <span className="dot" /> Playwright only
                    </span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 12 }}>
                    <div className="tools-card">
                      <div className="h">
                        <h4>Playwright config</h4>
                        <span className="badge">testing/playwright.config.ts</span>
                      </div>
                      <div className="tools-row">
                        <div className="k">Browser</div>
                        <div className="v">
                          <code>chromium</code> <code>firefox</code> <code>webkit</code>
                        </div>
                      </div>
                      <div className="tools-row">
                        <div className="k">Headed</div>
                        <div className="v">
                          <code>--headed=false</code> · headless in CI, headed on demand
                        </div>
                      </div>
                      <div className="tools-row">
                        <div className="k">Trace</div>
                        <div className="v">
                          <code>trace=on-first-retry</code> · full trace on flake
                        </div>
                      </div>
                      <div className="tools-row">
                        <div className="k">Retries</div>
                        <div className="v">2 in CI · 0 locally</div>
                      </div>
                      <div className="tools-row">
                        <div className="k">Base URL</div>
                        <div className="v">QA env (after Build deploy)</div>
                      </div>
                    </div>
                    <div className="tools-card">
                      <div className="h">
                        <h4>Test rules in force</h4>
                        <span className="badge">testing/</span>
                      </div>
                      <div className="tools-row">
                        <div className="k">A11y</div>
                        <div className="v">WCAG 2.1 AA · axe-core on every page</div>
                      </div>
                      <div className="tools-row">
                        <div className="k">Fidelity</div>
                        <div className="v">Pixel-snap critical screens · feature-fidelity.md</div>
                      </div>
                      <div className="tools-row">
                        <div className="k">Coverage</div>
                        <div className="v">Every story → ≥1 happy + 1 error test</div>
                      </div>
                      <div className="tools-row">
                        <div className="k">Screens</div>
                        <div className="v">Per-step · retention deferred (plan §2)</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Results by dimension (B.15) — compact 3-lane summary. */}
              <div className="card" style={{ marginTop: 14 }}>
                <div style={{ padding: '18px 22px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                    <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Results by dimension</h3>
                    <span style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--ink-2)' }}>
                      a11y uses axe-core · WCAG 2.1 AA
                    </span>
                  </div>
                  <div className="qa-dim-summary">
                    {(stories.dimension_summary ?? []).map((d) => (
                      <div className="lane" key={d.dimension}>
                        <div className="h">
                          <span className={`qa-dim ${d.dimension}`}>
                            <span className="dot" /> {d.dimension}
                          </span>
                          <span className="tag">{d.total} tests</span>
                        </div>
                        <div className={`row ${d.pass > 0 ? 'pass' : ''}`}>
                          <span className="n">{d.pass}</span>
                          <span className="lbl">passed</span>
                        </div>
                        <div className={`row ${d.fail > 0 ? 'fail' : ''}`}>
                          <span className="n">{d.fail}</span>
                          <span className="lbl">failed</span>
                        </div>
                        {d.flaky > 0 && (
                          <div className="row">
                            <span className="n">{d.flaky}</span>
                            <span className="lbl">flaky</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function QaRow({
  story,
  idOrSlug,
  running,
  selected,
  onRunStory,
}: {
  story: QaStorySummary;
  idOrSlug: string;
  running: boolean;
  selected: boolean;
  onRunStory: () => void;
}) {
  const strip = story.tests_strip;
  // One box per test in the latest run: pass boxes first, then fail, flaky,
  // then skipped (count-only wire; mockup §Q rows render the same strip).
  const stripBoxes: { kind: 'pass' | 'fail' | 'flaky' | 'skip'; label: string }[] = [];
  for (let i = 0; i < strip.pass; i += 1) stripBoxes.push({ kind: 'pass', label: '' });
  for (let i = 0; i < strip.fail; i += 1) stripBoxes.push({ kind: 'fail', label: '' });
  for (let i = 0; i < strip.flaky; i += 1) stripBoxes.push({ kind: 'flaky', label: '' });
  for (let i = 0; i < strip.skip; i += 1) stripBoxes.push({ kind: 'skip', label: '—' });

  const shotTotal = story.screenshots.pass + story.screenshots.issue;
  const okThumbs = Math.min(3, story.screenshots.pass);
  const failThumbs = Math.min(Math.max(0, 3 - okThumbs), story.screenshots.issue);
  const shownShots = okThumbs + failThumbs;

  const run = story.latest_run;
  const subBits: string[] = [];
  if (story.ticket_key) subBits.push(`${story.ticket_key} · ${story.qa_status}`);
  if (run) {
    subBits.push(`run #${run.run_no} · ${run.trigger} · ${run.result ?? 'queued'}`);
  } else {
    subBits.push('no runs yet');
  }

  return (
    <div className={`qa-row${selected ? ' selected' : ''}`} data-story={story.storyId}>
      <div>
        <div className="id">{story.ticket_key ?? story.storyId}</div>
        <span className={`pill ${PILL_CLASS[story.qa_status]}`}>
          <span className="dot" /> {story.status_pill}
        </span>
      </div>
      <div>
        <div className="title">
          {story.title}
          <span className="sub">{subBits.join(' · ')}</span>
          {story.rework_rounds > 0 && (
            <span className="roundtrip">
              Failed round {story.rework_rounds} → in Build rework → fixed → Ready for QA (round{' '}
              {story.rework_rounds + 1})
            </span>
          )}
          {story.escalation && (
            <span className="escalation">3+ failed rounds — escalate for Build stability review</span>
          )}
        </div>
      </div>
      <div className="tests-strip" aria-label={`${strip.total} tests in the latest run`}>
        {stripBoxes.slice(0, 6).map((b, i) => (
          <span className={`t ${b.kind}`} key={`${story.storyId}-${i}`} aria-hidden="true">
            <span className="dot">{b.label}</span>
          </span>
        ))}
        <span className="count">{strip.pass}/{strip.total}</span>
      </div>
      <div className="shots" aria-label={`${shotTotal} screenshots`}>
        {[...Array(okThumbs)].map((_, i) => (
          <span className="thumb ok" key={`ok-${i}`} aria-hidden="true" />
        ))}
        {[...Array(failThumbs)].map((_, i) => (
          <span className="thumb fail" key={`fail-${i}`} aria-hidden="true" />
        ))}
        {shotTotal > shownShots && <span className="more">+{shotTotal - shownShots}</span>}
        {shotTotal === 0 && <span className="more">queued / none yet</span>}
      </div>
      <div className="row-actions">
        {story.qa_status === 'ready_for_qa' ? (
          <button
            type="button"
            className="btn btn-primary btn-pill"
            disabled={running}
            onClick={onRunStory}
          >
            Run tests
          </button>
        ) : (
          <Link
            className="btn btn-soft btn-pill"
            to={`/projects/${idOrSlug}/qa/${story.storyId}`}
          >
            Open →
          </Link>
        )}
      </div>
    </div>
  );
}
