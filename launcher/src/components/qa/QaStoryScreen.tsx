// QA tab — Story detail (qa-tab build plan §4; qa-tab.html §QSD, zone 10):
//   Story header (ticket · pill · Re-run · Open in Sprint) · linked
//   requirement + test-dimensions cards · rework round-trip banner · run
//   history table · annotated screenshot viewer (by test id + step — never by
//   path, SA-R-106) with no-screenshots empty state (C.20) · per-test rows
//   (expected vs actual, trace, ACs) · full per-dimension results · notes
//   thread (QA Agent/Reviewer/user) with escape-then-markdown rendering.
//
// Back-arrow returns to the QA list and scrolls the source row into view via
// router state (design-tab parity, FR-1/AC-12). Notes POST carries the same
// server-side contract as design notes ('<' rejected, 10 KB cap).
//
// Visual diff (B.16) is explicitly deferred by the plan (§2, SA decision) —
// the gated card renders with a deferral note.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useOutletContext, useParams } from 'react-router-dom';
import {
  QaHttpError,
  fetchQaStory,
  postQaNote,
  triggerQaRuns,
  type QaStoryDetail,
  type QaTest,
} from '../../lib/api';
import type { ProjectOutletContext } from '../ProjectDetailScreen';

type Notice = { kind: 'success' | 'error'; text: string };

const PILL_CLASS: Record<QaStoryDetail['story']['qa_status'], string> = {
  ready_for_qa: 'todo',
  in_qa: 'inprog',
  passed: 'done',
  failed: 'blocked',
  flaky: 'flaky',
  blocked_skipped: 'draft',
};

const DIM_LABEL: Record<string, string> = {
  functional: 'Functional',
  a11y: 'A11y',
  fidelity: 'Feature-fidelity',
};

// Escape-then-markdown, never innerHTML on raw bodies (design notes parity —
// the tiny renderer is duplicated from DesignStoryScreen rather than hoisted
// because design-owned files are zero-edit on this branch).
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function markdownLite(raw: string): string {
  return esc(raw)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br/>');
}

function NoteBody({ body }: { body: string }) {
  const html = useMemo(() => markdownLite(body), [body]);
  return <p dangerouslySetInnerHTML={{ __html: html }} />;
}

function formatTs(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const diff = Math.max(0, Date.now() - then);
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

function resultChip(result: string | null): { cls: string; label: string } {
  if (!result) return { cls: 'warn', label: 'Queued' };
  if (result === 'passed') return { cls: '', label: 'Passed' };
  if (result === 'flaky') return { cls: 'warn', label: 'Flaky' };
  if (result === 'blocked') return { cls: 'skip', label: 'Blocked' };
  if (result === 'partial') return { cls: 'warn', label: 'Partial' };
  return { cls: 'warn', label: 'Failed' };
}

export function QaStoryScreen() {
  const { id, storyId } = useParams();
  const { project } = useOutletContext<ProjectOutletContext>();

  const [data, setData] = useState<QaStoryDetail | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'ok' | 'error'>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [running, setRunning] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [posting, setPosting] = useState(false);

  const idOrSlug = id ?? '';
  const sid = storyId ?? '';

  const reload = useCallback(async () => {
    try {
      const d = await fetchQaStory(idOrSlug, sid);
      setData(d);
      setLoadState('ok');
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load the story QA detail.');
      setLoadState('error');
    }
  }, [idOrSlug, sid]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const d = await fetchQaStory(idOrSlug, sid);
        if (!cancelled) {
          setData(d);
          setLoadState('ok');
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Could not load the story QA detail.');
          setLoadState('error');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [idOrSlug, sid]);

  const reRun = useCallback(async () => {
    setRunning(true);
    try {
      const scope: 'full' | 'smoke' | `story ${string}` = data?.story.ticket_key
        ? `story ${data.story.ticket_key}`
        : 'full';
      await triggerQaRuns(idOrSlug, scope);
      setNotice({ kind: 'success', text: `Run queued for ${data?.story.ticket_key ?? data?.story.storyId ?? sid}.` });
      await reload();
    } catch (err) {
      setNotice({ kind: 'error', text: err instanceof Error ? err.message : 'Could not queue the run.' });
    } finally {
      setRunning(false);
    }
  }, [data, idOrSlug, reload, sid]);

  const postNote = useCallback(async () => {
    const body = noteDraft.trim();
    if (!body) return;
    setPosting(true);
    try {
      const res = await postQaNote(idOrSlug, sid, body);
      setData((d) => (d ? { ...d, notes: [...d.notes, res.note] } : d));
      setNoteDraft('');
      setNotice({ kind: 'success', text: 'Note posted to the story thread.' });
    } catch (err) {
      if (err instanceof QaHttpError) {
        setNotice({ kind: 'error', text: err.message });
      } else {
        setNotice({ kind: 'error', text: err instanceof Error ? err.message : 'Could not post the note.' });
      }
    } finally {
      setPosting(false);
    }
  }, [idOrSlug, noteDraft, sid]);

  // Pick the test whose screenshots the viewer stages: the latest failing
  // issue evidence first (expected vs actual), else the first test with any
  // shots, else none → empty state (C.20).
  const viewerTest: QaTest | null =
    data?.tests.find((t) => t.screenshots.issue.length > 0) ??
    data?.tests.find((t) => t.screenshots.pass.length > 0 || t.screenshots.issue.length > 0) ??
    null;
  const [shotIdx, setShotIdx] = useState(0);
  useEffect(() => {
    setShotIdx(0);
  }, [viewerTest?.id]);

  const allShots = viewerTest
    ? [...viewerTest.screenshots.pass, ...viewerTest.screenshots.issue]
    : [];
  const currentShot = shotIdx < allShots.length ? allShots[shotIdx] : null;
  const currentStep = viewerTest ? Math.min(shotIdx, Math.max(0, viewerTest.steps.length - 1)) : 0;
  const currentStepLabel = viewerTest?.steps[currentStep]?.label ?? null;

  // Gate on project context (QA is gated). All hooks above so rules hold.
  if (project && !project.context_confirmed) {
    return <Navigate to={`/projects/${idOrSlug}/overview`} replace />;
  }

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
            <h1>Could not load the story QA detail</h1>
            <p className="sub" style={{ textAlign: 'center' }}>
              {loadError}
            </p>
            <Link to={`/projects/${idOrSlug}/qa`} className="btn btn-soft btn-pill">
              ← Back to QA list
            </Link>
          </div>
        </div>
      )}

      {loadState === 'ok' && data && (
        <>
          <div className="topbar">
            <Link
              to={`/projects/${idOrSlug}/qa`}
              state={{ storyId: sid }}
              className="back-arrow"
              aria-label="Back to QA list"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M15 18l-6-6 6-6" />
              </svg>
              <span>Back to QA list</span>
            </Link>
          </div>

          {/* Story header */}
          <div className="card">
            <div className="story-head">
              <div className="ico-lg" aria-hidden="true">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2b2547" strokeWidth={1.8}>
                  <path d="M9 12l2 2 4-4 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
                </svg>
              </div>
              <div className="title-stack">
                <h1>{data.story.title}</h1>
                <div className="one">
                  {data.story.ticket_key ? `${data.story.ticket_key} · ` : ''}
                  {data.story.storyId} · {data.story.status_pill}
                </div>
              </div>
              <div className="actions">
                <span className={`pill ${PILL_CLASS[data.story.qa_status]}`}>
                  <span className="dot" /> {data.story.status_pill}
                </span>
                <button
                  type="button"
                  className="btn btn-soft btn-pill"
                  disabled={running}
                  onClick={() => void reRun()}
                >
                  {running ? 'Queuing…' : 'Re-run'}
                </button>
                <Link to={`/projects/${idOrSlug}/sprint`} className="btn btn-ghost btn-pill">
                  Open in Sprint →
                </Link>
              </div>
            </div>
          </div>

          {/* Linked requirement + test-dimension card */}
          <div className="req-surface-row">
            <div className="req-card">
              <div className="h">
                <svg className="ico" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} style={{ color: 'var(--purple)' }}>
                  <path d="M5 4h11l3 3v13H5z M16 4v3h3 M8 11h8 M8 14h8 M8 17h5" />
                </svg>
                <h4>Linked story</h4>
                <span className="id">{data.story.storyId}</span>
              </div>
              <p className="desc">
                {data.story.title}. The full requirement text lives in Requirements; the
                test list below covers its acceptance criteria (AC IDs on each test row).
              </p>
              <div className="users-row">
                <span className="lbl">QA status</span>
                <span className={`pill ${PILL_CLASS[data.story.qa_status]}`}>
                  <span className="dot" /> {data.story.status_pill}
                </span>
              </div>
            </div>

            <div className="req-card">
              <div className="h">
                <svg className="ico" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} style={{ color: 'var(--blue)' }}>
                  <path d="M21 16V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                </svg>
                <h4>Test dimensions</h4>
                <span className="id" style={{ fontFamily: 'var(--font-sans)', fontSize: 11, color: 'var(--ink-2)' }}>
                  per-dimension outcome below
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                {data.dimensions.map((d) => {
                  const passChip = d.fail > 0 ? 'warn' : d.total > 0 ? '' : 'skip';
                  return (
                    <div key={d.dimension} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className={`qa-dim ${d.dimension}`}>
                        <span className="dot" /> {DIM_LABEL[d.dimension] ?? d.dimension}
                      </span>
                      <span style={{ fontSize: 11.5, color: 'var(--ink-2)' }}>
                        {d.pass}/{d.total}
                      </span>
                      <span className={`pass-chip ${passChip === '' ? '' : passChip}`} style={{ marginLeft: 'auto' }}>
                        <span className="dot" /> {d.fail > 0 ? `${d.fail} fail` : d.total === 0 ? 'n/a' : 'ok'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Rework round-trip banner (B.11) */}
          {data.story.roundtrip_line && (
            <div className="card" style={{ marginTop: 14 }}>
              <div className="rework-banner" style={{ margin: '14px 16px' }}>
                <div className="ico">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                    <path d="M3 12a9 9 0 0 1 15-6.7L21 8 M21 3v5h-5 M21 12a9 9 0 0 1-15 6.7L3 16 M3 21v-5h5" />
                  </svg>
                </div>
                <div className="body">
                  <div className="round">
                    {data.story.rework_rounds > 0
                      ? `Round ${data.story.rework_rounds} · ${data.story.qa_status === 'in_qa' ? 're-running' : 'in progress'}`
                      : 'Rework round-trip'}
                  </div>
                  <div className="story">{data.story.roundtrip_line}</div>
                  <div className="detail">
                    Failed in a prior round → routed to Build rework → fixed → returned for
                    re-QA. Each round is tracked in the run history below.
                  </div>
                  {data.story.rework_rounds >= 3 && (
                    <div className="escalation">3+ failed rounds — escalate for Build stability review</div>
                  )}
                </div>
                <Link to={`/projects/${idOrSlug}/build`} className="btn btn-soft btn-pill">
                  View Build →
                </Link>
              </div>
            </div>
          )}

          {/* Run history (B.9) */}
          <div className="card" style={{ marginTop: 14 }}>
            <div className="qa-history">
              <div className="h">
                <h4>Run history · {data.story.ticket_key ?? data.story.storyId}</h4>
                <span className="right">
                  {data.runs.length} run{data.runs.length === 1 ? '' : 's'}
                  {data.runs[0] ? ` · last ${formatTs(data.runs[0].started_at)}` : ''}
                </span>
              </div>
              {data.runs.length === 0 ? (
                <div className="story-empty">No runs yet — Re-run to queue the first one.</div>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Run</th>
                      <th>Trigger</th>
                      <th>Started</th>
                      <th>Duration</th>
                      <th>Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.runs.map((r) => {
                      const chip = resultChip(r.result);
                      return (
                        <tr key={r.id}>
                          <td className="mono">#{r.run_no}</td>
                          <td>{r.trigger === 'manual' ? 'Manual · Re-run tests' : r.trigger === 'auto' ? 'QA agent · autonomous' : 'QA agent'}</td>
                          <td className="mono">{formatTs(r.started_at)}</td>
                          <td className="mono">
                            {r.duration_ms == null ? '—' : r.duration_ms >= 1000 ? `${(r.duration_ms / 1000).toFixed(1)}s` : `${r.duration_ms}ms`}
                          </td>
                          <td>
                            <span className={`pass-chip ${chip.cls === '' ? '' : chip.cls}`}>
                              <span className="dot" /> {chip.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Annotated screenshot viewer (B.12) — serves by id + step; empty
              state when no run has captured shots yet (C.20). */}
          <div className="card" style={{ marginTop: 14 }}>
            <div style={{ padding: '18px 22px' }}>
              {viewerTest ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>
                    {viewerTest.name}
                  </h3>
                  <span className={`pill ${viewerTest.status === 'pass' ? 'done' : 'blocked'}`} style={{ fontSize: 10.5 }}>
                    <span className="dot" /> {viewerTest.status}
                  </span>
                  <span className={`qa-dim ${viewerTest.dimension}`} style={{ marginLeft: 'auto' }}>
                    <span className="dot" /> {DIM_LABEL[viewerTest.dimension] ?? viewerTest.dimension}
                  </span>
                  <span style={{ fontSize: 11.5, color: 'var(--ink-2)', fontFamily: 'var(--font-mono)' }}>
                    step {shotIdx + 1} / {allShots.length}
                  </span>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Screenshot evidence</h3>
                  <span className="pill todo" style={{ fontSize: 10.5 }}>
                    <span className="dot" /> no screenshots yet
                  </span>
                </div>
              )}

              {viewerTest && currentShot ? (
                <>
                  <div className="shot-stage">
                    <div className="stage-img">
                      <img
                        src={currentShot}
                        alt={`Screenshot for test step ${shotIdx + 1} of ${allShots.length}`}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', inset: 0 }}
                      />
                      {currentStepLabel && (
                        <div className="annot" style={{ position: 'absolute', bottom: 10, left: 10, right: 10 }}>
                          {currentStepLabel}
                        </div>
                      )}
                    </div>
                    <div className="shot-toolbar">
                      <button
                        type="button"
                        className="nav-btn"
                        disabled={shotIdx === 0}
                        onClick={() => setShotIdx((i) => Math.max(0, i - 1))}
                      >
                        ← Prev
                      </button>
                      <span className="meta">qa-evidence · step {shotIdx + 1}</span>
                      <button
                        type="button"
                        className="nav-btn"
                        style={{ marginLeft: 'auto' }}
                        disabled={shotIdx >= allShots.length - 1}
                        onClick={() => setShotIdx((i) => Math.min(allShots.length - 1, i + 1))}
                      >
                        Next →
                      </button>
                    </div>
                  </div>

                  {/* Visual diff (B.16) — gated card with deferral note (plan §2). */}
                  <div className="qa-diff deferred" aria-label="Visual diff (deferred)">
                    <div className="pane expected">
                      <h5>Expected</h5>
                      <div className="img">deferred</div>
                    </div>
                    <div className="pane actual">
                      <h5>Actual</h5>
                      <div className="img">deferred</div>
                    </div>
                    <div className="pane diff">
                      <h5>Diff</h5>
                      <div className="img">deferred</div>
                    </div>
                  </div>
                  <p className="sub" style={{ fontSize: 11.5, marginTop: 8 }}>
                    Visual diff implementation is deferred by the build plan (qa-tab §2) — the
                    mockup keeps this card gated with this note.
                  </p>
                </>
              ) : (
                <div className="shot-stage">
                  <div className="stage-img empty">Screenshots appear after the first run.</div>
                </div>
              )}
            </div>
          </div>

          {/* Per-test rows (B.6) — expected vs actual, trace, ACs. */}
          <div className="card" style={{ marginTop: 14 }}>
            <div className="test-list" style={{ padding: '18px 22px' }}>
              {data.tests.length === 0 && (
                <div className="story-empty">No recorded tests yet — the first run records them.</div>
              )}
              {data.tests.map((t) => {
                const expected = t.expected ? `expected: ${t.expected}` : null;
                const actual = t.actual ? `actual: ${t.actual}` : null;
                const passChip =
                  t.status === 'pass' ? '' : t.status === 'fail' ? 'warn' : 'skip';
                return (
                  <div className="t-row" key={t.id}>
                    <div className={`ico ${t.status === 'pass' ? 'pass' : t.status === 'fail' ? 'fail' : 'skip'}`}>
                      {t.status === 'pass' ? '✓' : t.status === 'fail' ? '✕' : '—'}
                    </div>
                    <div className="name">
                      {t.name}
                      <span className="expected">
                        {[expected, actual].filter(Boolean).join(' · ') || 'no expected/actual recorded'}
                      </span>
                    </div>
                    <div className="dur">{t.duration_ms == null ? '—' : `${t.duration_ms}ms`}</div>
                    <span className={`pass-chip ${passChip === '' ? '' : passChip}`}>
                      <span className="dot" /> {t.status}
                    </span>
                  </div>
                );
              })}
              {data.tests.some((t) => t.trace_path || t.acs.length > 0) && (
                <div
                  style={{
                    marginTop: 8,
                    padding: '10px 12px',
                    background: 'rgba(50,42,92,0.02)',
                    borderRadius: 8,
                    fontSize: 11.5,
                    color: 'var(--ink-2)',
                    display: 'flex',
                    gap: 14,
                    flexWrap: 'wrap',
                  }}
                >
                  {data.tests
                    .filter((t) => t.trace_path)
                    .map((t) => (
                      <span key={t.id}>
                        <b style={{ color: 'var(--ink)' }}>Playwright trace:</b>{' '}
                        <code>{t.trace_path}</code>
                      </span>
                    ))}
                  {data.tests
                    .filter((t) => t.acs.length > 0)
                    .map((t) => (
                      <span key={t.id}>
                        <b style={{ color: 'var(--ink)' }}>AC verified:</b>{' '}
                        {t.acs.join(' · ')}
                      </span>
                    ))}
                </div>
              )}
            </div>
          </div>

          {/* Full per-dimension results (B.15) */}
          <div className="card" style={{ marginTop: 14 }}>
            <div style={{ padding: '18px 22px' }}>
              <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700 }}>
                Results by dimension
              </h3>
              <div className="qa-dim-summary">
                {data.dimensions.map((d) => (
                  <div className="lane" key={d.dimension}>
                    <div className="h">
                      <span className={`qa-dim ${d.dimension}`}>
                        <span className="dot" /> {DIM_LABEL[d.dimension] ?? d.dimension}
                      </span>
                      <span className="tag">{d.pass}/{d.total}</span>
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

          {/* Notes thread (QA Agent + Reviewer + user, escape-then-markdown). */}
          <div className="card" style={{ marginTop: 14 }}>
            <div className="thread" style={{ padding: '18px 22px 22px' }}>
              <div className="thread-head">
                Notes · {data.story.ticket_key ?? data.story.storyId}
                <span className="who">{data.notes.length} comments</span>
              </div>
              {data.notes.length === 0 && (
                <div className="story-empty">No notes yet — the QA Agent posts per-failure evidence here.</div>
              )}
              {data.notes.map((n) => (
                <div className={`comment ${n.author.toLowerCase().includes('qa') && !n.author.toLowerCase().includes('review') ? 'qa' : 'rev'}`} key={n.id}>
                  <div className="body">
                    <div className="who">
                      {n.author} <span>· {formatTs(n.created_at)}</span>
                    </div>
                    <NoteBody body={n.body} />
                  </div>
                </div>
              ))}
              <div className="compose" style={{ marginTop: 12 }}>
                <textarea
                  value={noteDraft}
                  placeholder="Add a note — evidence, blocking context, or a question for QA / Reviewer…"
                  aria-label="Add a note to the story thread"
                  disabled={posting}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                      e.preventDefault();
                      void postNote();
                    }
                  }}
                  rows={Math.min(6, Math.max(2, noteDraft.split('\n').length + 1))}
                />
                <span className="who">
                  Posting as <b>Will</b>
                </span>
                <button
                  type="button"
                  className="btn btn-primary btn-pill"
                  disabled={posting || !noteDraft.trim()}
                  onClick={() => void postNote()}
                >
                  {posting ? 'Posting…' : 'Post'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
