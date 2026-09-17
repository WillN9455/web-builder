// Build tab — story detail (build-tab.html §BUSD, FR-11..FR-16 of
// build-story-requirements.md):
//   back arrow (aria-label "Back to Build list") returns and scrolls the
//   source row into view (AC-10); story head = status pill + Re-PR ghost
//   (v5.4: renders aria-disabled, PR actions live in GitHub) + the primary
//   CTA per state (Mark Ready for QA from self-review / ready-for-review,
//   Send back to Build from rework → ConfirmDialog);
//   req card (Open in Requirements →), FE/BFF/BE surfaces with inline add +
//   client path validation mirrored by the server, ConfirmDialog remove
//   (design pattern), and the notes thread (FR-16 — the review thread this
//   slice).

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, useOutletContext, useParams } from 'react-router-dom';
import {
  addBuildApi,
  addBuildFile,
  fetchBuildStory,
  postBuildNote,
  removeBuildApi,
  removeBuildFile,
  transitionBuildStory,
  BuildHttpError,
  type BuildApiMethod,
  type BuildStoryDetail,
} from '../../lib/api';
import { ConfirmDialog } from '../ConfirmDialog';
import type { ProjectOutletContext } from '../ProjectDetailScreen';
import { NoteBody, formatTs } from './markdown';

type Notice = { kind: 'success' | 'error'; text: string };

const METHOD_CHIP: Record<BuildApiMethod, string> = {
  GET: 'get',
  POST: 'post',
  PATCH: 'patch',
  PUT: 'put',
  DELETE: 'delete',
};

const METHOD_CHOICES: BuildApiMethod[] = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'];

// Client-side mirror of the server's path validation (never the only line of
// defense — the server rejects on raw bytes too). Reject anything that would
// escape the project folder: a leading /, an absolute drive path, or any `..`
// segment.
function validateRelPath(raw: string): string | null {
  const path = raw.trim();
  if (!path) return 'Enter a path first.';
  if (path.startsWith('/') || /^[A-Za-z]:/.test(path) || path.split(/[\\/]/).includes('..')) {
    return 'Paths must be relative and inside the project folder.';
  }
  return null;
}

function storyOneLine(s: BuildStoryDetail['story']): string {
  const bits: string[] = [];
  if (s.reqs.length) bits.push(`From ${s.reqs.map((r) => r.id).join(', ')}`);
  bits.push(`story ${s.storyId}`);
  return bits.join(' · ');
}

export function BuildStoryScreen() {
  const { id, storyId } = useParams();
  const { project } = useOutletContext<ProjectOutletContext>();
  const idOrSlug = id ?? '';
  const sid = storyId ?? '';

  const [detail, setDetail] = useState<BuildStoryDetail | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'ok' | 'error' | 'not-found'>('loading');
  const [notice, setNotice] = useState<Notice | null>(null);
  const noticeTimer = useRef<number | null>(null);

  // Remove flow (ConfirmDialog + triggerRef — design pattern).
  const [removeOpen, setRemoveOpen] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<{ kind: 'file' | 'api'; id: number; label: string } | null>(null);
  const removeTriggerRef = useRef<HTMLElement | null>(null);

  // Add flow (inline row per surface).
  const [addPanel, setAddPanel] = useState<'fe' | 'bff' | 'be' | null>(null);
  const [addPath, setAddPath] = useState('');
  const [addMethod, setAddMethod] = useState<BuildApiMethod>('GET');
  const [addDesc, setAddDesc] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const [addBusy, setAddBusy] = useState(false);

  // Notes thread (FR-16).
  const [noteDraft, setNoteDraft] = useState('');
  const [posting, setPosting] = useState(false);

  // Status transition.
  const [transiting, setTransiting] = useState(false);
  const [reworkOpen, setReworkOpen] = useState(false);
  const [reworkBusy, setReworkBusy] = useState(false);
  const reworkTriggerRef = useRef<HTMLElement | null>(null);

  const showNotice = useCallback((n: Notice) => {
    setNotice(n);
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 4000);
  }, []);

  const load = useCallback(async () => {
    try {
      const d = await fetchBuildStory(idOrSlug, sid);
      setDetail(d);
      setLoadState('ok');
    } catch (err) {
      if (err instanceof BuildHttpError && err.status === 404) {
        setLoadState('not-found');
      } else {
        setLoadState('error');
      }
    }
  }, [idOrSlug, sid]);

  useEffect(() => {
    void load();
  }, [load]);

  // Silent refresh after add / remove / note — keeps the thread from flashing.
  const refresh = useCallback(async () => {
    try {
      const d = await fetchBuildStory(idOrSlug, sid);
      setDetail(d);
    } catch {
      /* keep the current detail; the toast explains why */
    }
  }, [idOrSlug, sid]);

  const onRemove = useCallback(async () => {
    if (!removeTarget) return;
    setRemoving(true);
    try {
      if (removeTarget.kind === 'file') {
        await removeBuildFile(idOrSlug, sid, removeTarget.id);
      } else {
        await removeBuildApi(idOrSlug, sid, removeTarget.id);
      }
      setRemoveOpen(false);
      showNotice({ kind: 'success', text: `${removeTarget.kind === 'file' ? 'File' : 'Route'} removed.` });
      await refresh();
    } catch (err) {
      showNotice({ kind: 'error', text: err instanceof Error ? err.message : 'Could not remove the entry.' });
    } finally {
      setRemoving(false);
    }
  }, [removeTarget, idOrSlug, sid, refresh, showNotice]);

  const onAdd = useCallback(async () => {
    if (!addPanel) return;
    if (addPanel !== 'be') {
      const pathErr = validateRelPath(addPath);
      if (pathErr) {
        setAddError(pathErr);
        return;
      }
    }
    setAddBusy(true);
    setAddError(null);
    try {
      if (addPanel === 'fe') {
        await addBuildFile(idOrSlug, sid, addPath.trim(), 'new');
        showNotice({ kind: 'success', text: 'File added — listed for review.' });
      } else if (addPanel === 'bff') {
        await addBuildApi(idOrSlug, sid, 'bff', addMethod, addPath.trim(), addDesc.trim());
        showNotice({ kind: 'success', text: 'BFF route added.' });
      } else {
        await addBuildApi(idOrSlug, sid, 'be', addMethod, addPath.trim(), addDesc.trim());
        showNotice({ kind: 'success', text: 'BE endpoint added.' });
      }
      setAddPanel(null);
      setAddPath('');
      setAddDesc('');
      await refresh();
    } catch (err) {
      if (err instanceof BuildHttpError && err.status === 409) {
        setAddError('This file is already in the list.');
      } else {
        setAddError(err instanceof Error ? err.message : 'Could not add the entry.');
      }
    } finally {
      setAddBusy(false);
    }
  }, [addPanel, addPath, addMethod, addDesc, idOrSlug, sid, refresh, showNotice]);

  const onPostNote = useCallback(async () => {
    if (!noteDraft.trim() || posting) return;
    setPosting(true);
    try {
      const res = await postBuildNote(idOrSlug, sid, noteDraft.trim());
      setDetail((d) => (d ? { ...d, notes: [...d.notes, res.note] } : d));
      setNoteDraft('');
      showNotice({ kind: 'success', text: 'Note posted.' });
    } catch (err) {
      showNotice({ kind: 'error', text: err instanceof Error ? err.message : 'Could not post the note.' });
    } finally {
      setPosting(false);
    }
  }, [noteDraft, posting, idOrSlug, sid, showNotice]);

  const onTransition = useCallback(
    async (to: 'ready_for_qa' | 'building') => {
      setTransiting(true);
      setReworkBusy(true);
      try {
        await transitionBuildStory(idOrSlug, sid, to);
        setReworkOpen(false);
        if (to === 'ready_for_qa') {
          showNotice({ kind: 'success', text: 'Story moved to Ready for QA.' });
        } else {
          showNotice({ kind: 'success', text: 'Story sent back to Build.' });
        }
        await refresh();
      } catch (err) {
        showNotice({ kind: 'error', text: err instanceof Error ? err.message : 'Could not update the story status.' });
      } finally {
        setTransiting(false);
        setReworkBusy(false);
      }
    },
    [idOrSlug, sid, refresh, showNotice],
  );

  // Gate after hooks (SprintScreen pattern).
  if (project && !project.context_confirmed) {
    return <Navigate to={`/projects/${idOrSlug}/overview`} replace />;
  }

  const st = detail?.story.build_status ?? null;
  const isRework = st === 'rework';
  const canMarkQa = st === 'self_review' || st === 'ready_for_review';
  const stPill: { cls: string; label: string } | null = detail
    ? st
      ? { cls: { picked_up: 'todo', building: 'inprog', self_review: 'inprog', ready_for_review: 'review', ready_for_qa: 'done', deployed_qa: 'done', rework: 'blocked' }[st] ?? 'todo', label: detail.story.status_pill ?? st }
      : { cls: 'todo', label: 'Not started' }
    : null;

  return (
    <div className="build-screen">
      <div className="topbar">
        <Link to={`/projects/${idOrSlug}/build`} state={{ storyId: sid }} className="back-arrow" aria-label="Back to Build list">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          <span>Back to Build list</span>
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

      {loadState === 'loading' && (
        <div className="center-stage" style={{ minHeight: 300 }}>
          <div className="center-card" style={{ textAlign: 'center' }}>
            <h1 style={{ fontSize: 18 }}>Loading story…</h1>
          </div>
        </div>
      )}

      {loadState === 'not-found' && (
        <div className="center-stage" style={{ minHeight: 300 }}>
          <div className="center-card" style={{ textAlign: 'center' }}>
            <h1>Story not found in Build</h1>
            <p className="sub" style={{ textAlign: 'center' }}>
              It may have moved, or the link is stale. Head back to the build list and pick the
              story again.
            </p>
            <div style={{ marginTop: 12 }}>
              <Link className="btn btn-primary btn-pill" to={`/projects/${idOrSlug}/build`}>
                Back to Build list
              </Link>
            </div>
          </div>
        </div>
      )}

      {loadState === 'error' && (
        <div className="center-stage" style={{ minHeight: 300 }}>
          <div className="center-card" style={{ textAlign: 'center' }}>
            <h1>Could not load this story</h1>
            <p className="sub" style={{ textAlign: 'center' }}>
              Something went wrong on the server. Try again in a moment.
            </p>
          </div>
        </div>
      )}

      {loadState === 'ok' && detail && (
        <>
          {/* FR-11 story head — the sole top-of-page control is the back arrow
              (AC-9); no Projects breadcrumb here. */}
          <div className="card">
            <div className="story-head">
              <div className={`ico-lg tile-${project?.tile_color ?? 'peach'}`} aria-hidden="true">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2b2547" strokeWidth={1.8}>
                  <path d="M8 6l-5 6 5 6 M16 6l5 6-5 6" />
                  <path d="M13 4l-2 16" />
                </svg>
              </div>
              <div className="title-stack">
                <h1>{detail.story.title}</h1>
                <div className="one">
                  {detail.story.ticket_key !== detail.story.storyId ? `${detail.story.ticket_key} · ` : ''}
                  {storyOneLine(detail.story)}
                </div>
              </div>
              <div className="actions">
                {stPill && (
                  <span className={`pill ${stPill.cls}`}>
                    <span className="dot" /> {stPill.label}
                  </span>
                )}

                {/* v5.4 Re-PR ghost: renders aria-disabled; PR actions live in
                    GitHub, and this slice carries no PR link. */}
                {(st === 'self_review' || st === 'ready_for_review' || st === 'ready_for_qa' || st === 'rework') && (
                  <span
                    className="btn btn-ghost btn-pill re-pr"
                    role="link"
                    aria-disabled="true"
                    title="PR actions live in GitHub — opens the PR for review"
                  >
                    Re-PR {detail.story.ticket_key}
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                      <circle cx="6" cy="5" r="2" />
                      <circle cx="6" cy="19" r="2" />
                      <circle cx="18" cy="13" r="2" />
                      <path d="M6 7v10 M18 15V7a3 3 0 0 0-3-3h-2" />
                    </svg>
                  </span>
                )}

                {canMarkQa && (
                  <button
                    type="button"
                    className="btn btn-primary btn-pill"
                    disabled={transiting}
                    title="Requires code review & tests to pass — opens the review flow"
                    onClick={() => void onTransition('ready_for_qa')}
                  >
                    {transiting ? 'Moving…' : 'Mark Ready for QA'}
                  </button>
                )}

                {isRework && (
                  <button
                    type="button"
                    className="btn btn-primary btn-pill"
                    disabled={transiting}
                    onClick={(e) => {
                      reworkTriggerRef.current = e.currentTarget;
                      setReworkOpen(true);
                    }}
                  >
                    Send back to Build →
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* FR-12 rework banner — announces why the story came back. */}
          {isRework && (
            <div className="rework-banner" role="status">
              <b>This story is in rework</b> — it failed{' '}
              {detail.story.rework_origin === 'qa' ? 'QA' : 'review'}
              {detail.story.rework_issues > 0
                ? ` with ${detail.story.rework_issues} ${detail.story.rework_issues === 1 ? 'issue' : 'issues'} outstanding`
                : ''}
              . Address the flagged issues, then send it back to Build.
            </div>
          )}

          {/* FR-13 requirements link-back */}
          <div className="req-surface-row">
            <div className="req-card">
              <div className="h">
                <span className="ico" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 4h6v4h-6z" />
                    <path d="M5 8h14v12H5z" />
                  </svg>
                </span>
                <span className="id">{detail.story.reqs.map((r) => r.id).join(', ') || detail.story.storyId}</span>
                <Link
                  className="open"
                  to={`/projects/${idOrSlug}/requirements`}
                  aria-label="Open in Requirements"
                >
                  Open in Requirements →
                </Link>
              </div>
              <div className="desc">
                {detail.story.reqs
                  .map((r) => r.text)
                  .filter(Boolean)
                  .join(' ') || 'No requirement text linked.'}
              </div>
            </div>
          </div>

          {/* FR-14 / FR-15 surfaces — FE files, BFF routes, BE endpoints.
              Add opens an inline row (client path validation mirrors the
              server); each trash opens the shared ConfirmDialog. */}
          <div className="req-surface-row">
            <div className="surface-card fe">
              <div className="h">
                <span className="ico" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 10h16 M4 14h16 M4 6h16" />
                  </svg>
                </span>
                <div>
                  <b>Frontend</b>
                  <span className="sub">{detail.files.length} {detail.files.length === 1 ? 'file' : 'files'}</span>
                </div>
                <button
                  type="button"
                  className="btn btn-soft btn-pill add"
                  onClick={() => setAddPanel(addPanel === 'fe' ? null : 'fe')}
                >
                  ＋ Add file
                </button>
              </div>
              <div className="file-list">
                {detail.files.map((f) => (
                  <div className="file-row" key={f.id}>
                    <span className="path">
                      {f.layer && <span className={`layer layer-${f.layer}`}>{f.layer}</span>}
                      {f.path}
                    </span>
                    <button
                      type="button"
                      className="trash"
                      aria-label={`Remove ${f.path}`}
                      onClick={(e) => {
                        setRemoveTarget({ kind: 'file', id: f.id, label: f.path });
                        removeTriggerRef.current = e.currentTarget;
                        setRemoveOpen(true);
                      }}
                    >
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                        <path d="M4 7h16 M9 7V5h6v2 M6 7l1 13h10l1-13" />
                      </svg>
                    </button>
                  </div>
                ))}
                {addPanel === 'fe' && (
                  <div className="add-row">
                    <input
                      aria-label="Path of the new file"
                      placeholder="components/… / path/relative/to/src"
                      value={addPath}
                      onChange={(e) => setAddPath(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          void onAdd();
                        }
                      }}
                    />
                    <button type="button" className="btn btn-primary btn-pill" disabled={addBusy || !addPath.trim()} onClick={() => void onAdd()}>
                      {addBusy ? 'Adding…' : 'Add'}
                    </button>
                    <button type="button" className="btn btn-soft btn-pill" disabled={addBusy} onClick={() => setAddPanel(null)}>
                      Cancel
                    </button>
                    {addError && <div className="add-error" role="alert">{addError}</div>}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="req-surface-row">
            <div className="surface-card bff">
              <div className="h">
                <span className="ico" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 4h6v4h-6z" />
                    <path d="M5 8h14v12H5z" />
                  </svg>
                </span>
                <div>
                  <b>BFF</b>
                  <span className="sub">{detail.apis.filter((a) => a.tier === 'bff').length} routes</span>
                </div>
                <button
                  type="button"
                  className="btn btn-soft btn-pill add"
                  onClick={() => setAddPanel(addPanel === 'bff' ? null : 'bff')}
                >
                  ＋ Add route
                </button>
              </div>
              <div className="api-list">
                {detail.apis
                  .filter((a) => a.tier === 'bff')
                  .map((a) => (
                    <div className="api-row" key={a.id}>
                      <span className={`method-chip ${METHOD_CHIP[a.method]}`} aria-label={`HTTP method ${a.method}`}>
                        {a.method}
                      </span>
                      <span className="path">{a.route_path}</span>
                      <span className="desc">{a.description}</span>
                      <button
                        type="button"
                        className="trash"
                        aria-label={`Remove BFF route ${a.route_path}`}
                        onClick={(e) => {
                          setRemoveTarget({ kind: 'api', id: a.id, label: a.route_path });
                          removeTriggerRef.current = e.currentTarget;
                          setRemoveOpen(true);
                        }}
                      >
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                          <path d="M4 7h16 M9 7V5h6v2 M6 7l1 13h10l1-13" />
                        </svg>
                      </button>
                    </div>
                  ))}
                {addPanel === 'bff' && (
                  <ApiAddRow
                    addBusy={addBusy}
                    addError={addError}
                    pathValue={addPath}
                    methodValue={addMethod}
                    descValue={addDesc}
                    onPath={setAddPath}
                    onMethod={setAddMethod}
                    onDesc={setAddDesc}
                    onAdd={() => void onAdd()}
                    onCancel={() => setAddPanel(null)}
                  />
                )}
              </div>
            </div>
          </div>

          <div className="req-surface-row">
            <div className="surface-card be">
              <div className="h">
                <span className="ico" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 4l8 4-8 4-8-4Z" />
                    <path d="M4 12v4l8 4 8-4v-4" />
                  </svg>
                </span>
                <div>
                  <b>Backend</b>
                  <span className="sub">{detail.apis.filter((a) => a.tier === 'be').length} endpoints</span>
                </div>
                <button
                  type="button"
                  className="btn btn-soft btn-pill add"
                  onClick={() => setAddPanel(addPanel === 'be' ? null : 'be')}
                >
                  ＋ Add route
                </button>
              </div>
              <div className="api-list">
                {detail.apis
                  .filter((a) => a.tier === 'be')
                  .map((a) => (
                    <div className="api-row" key={a.id}>
                      <span className={`method-chip ${METHOD_CHIP[a.method]}`} aria-label={`HTTP method ${a.method}`}>
                        {a.method}
                      </span>
                      <span className="path">{a.route_path}</span>
                      <span className="desc">{a.description}</span>
                      <button
                        type="button"
                        className="trash"
                        aria-label={`Remove BE endpoint ${a.route_path}`}
                        onClick={(e) => {
                          setRemoveTarget({ kind: 'api', id: a.id, label: a.route_path });
                          removeTriggerRef.current = e.currentTarget;
                          setRemoveOpen(true);
                        }}
                      >
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                          <path d="M4 7h16 M9 7V5h6v2 M6 7l1 13h10l1-13" />
                        </svg>
                      </button>
                    </div>
                  ))}
                {addPanel === 'be' && (
                  <ApiAddRow
                    addBusy={addBusy}
                    addError={addError}
                    pathValue={addPath}
                    methodValue={addMethod}
                    descValue={addDesc}
                    onPath={setAddPath}
                    onMethod={setAddMethod}
                    onDesc={setAddDesc}
                    onAdd={() => void onAdd()}
                    onCancel={() => setAddPanel(null)}
                  />
                )}
              </div>
            </div>
          </div>

          {/* FR-16 notes thread (the review thread this slice) */}
          <div className="card thread-card" style={{ marginTop: 14 }}>
            <div className="thread">
              <div className="thread-head">
                <h3>
                  {detail.notes.length} {detail.notes.length === 1 ? 'note' : 'notes'}
                  {detail.notes.length > 0 && ` · last update ${formatTs(detail.notes[detail.notes.length - 1].created_at)} ago`}
                </h3>
              </div>
              <p className="who">QA / review failures land here — the Code Agent addresses them and re-PRs.</p>
              {detail.notes.length === 0 ? (
                <div className="comment empty">No notes yet this slice.</div>
              ) : (
                detail.notes.map((n) => (
                  <div className="comment" key={n.id}>
                    <div className="who">
                      {n.author} · {formatTs(n.created_at)} ago
                    </div>
                    <div className="body">
                      <NoteBody body={n.body} />
                    </div>
                  </div>
                ))
              )}
              <div className="compose" style={{ marginTop: 12 }}>
                <textarea
                  value={noteDraft}
                  placeholder="Add a note about this story…"
                  aria-label="Add a note about this story"
                  disabled={posting}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                      e.preventDefault();
                      void onPostNote();
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
                  disabled={!noteDraft.trim() || posting}
                  onClick={onPostNote}
                >
                  {posting ? 'Posting…' : 'Post'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      <ConfirmDialog
        open={removeOpen}
        title="Remove entry?"
        description={
          removeTarget
            ? `${removeTarget.kind === 'file' ? 'File' : 'Route'} ${removeTarget.label} will be dropped from the build list for this story.`
            : ''
        }
        confirmLabel="Remove"
        cancelLabel="Cancel"
        busy={removing}
        triggerRef={removeTriggerRef}
        onConfirm={onRemove}
        onClose={() => setRemoveOpen(false)}
      />

      <ConfirmDialog
        open={reworkOpen}
        title="Send back to Build?"
        description={`Puts ${detail?.story.ticket_key ?? 'this story'} back at the top of the build list for a Code Agent to pick up. The notes above should say what failed.`}
        confirmLabel="Send back to Build"
        cancelLabel="Cancel"
        busy={reworkBusy}
        triggerRef={reworkTriggerRef}
        onConfirm={() => void onTransition('building')}
        onClose={() => setReworkOpen(false)}
      />
    </div>
  );
}

// The two API cards render ApiAddRow from the shared add state; props are
// wired inline at each call site.
type ApiAddRowProps = {
  addBusy: boolean;
  addError: string | null;
  pathValue: string;
  methodValue: BuildApiMethod;
  descValue: string;
  onPath: (v: string) => void;
  onMethod: (m: BuildApiMethod) => void;
  onDesc: (v: string) => void;
  onAdd: () => void;
  onCancel: () => void;
};

function ApiAddRow({
  addBusy,
  addError,
  pathValue,
  methodValue,
  descValue,
  onPath,
  onMethod,
  onDesc,
  onAdd,
  onCancel,
}: ApiAddRowProps) {
  return (
    <div className="add-row api">
      <select
        aria-label="HTTP method"
        value={methodValue}
        onChange={(e) => onMethod(e.target.value as BuildApiMethod)}
      >
        {METHOD_CHOICES.map((m) => (
          <option key={m}>{m}</option>
        ))}
      </select>
      <input
        aria-label="Route path"
        placeholder="/api/…"
        value={pathValue}
        onChange={(e) => onPath(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            onAdd();
          }
        }}
      />
      <input
        aria-label="Route description"
        placeholder="What it does…"
        value={descValue}
        onChange={(e) => onDesc(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            onAdd();
          }
        }}
      />
      <button type="button" className="btn btn-primary btn-pill" disabled={addBusy || !pathValue.trim()} onClick={onAdd}>
        {addBusy ? 'Adding…' : 'Add'}
      </button>
      <button type="button" className="btn btn-soft btn-pill" disabled={addBusy} onClick={onCancel}>
        Cancel
      </button>
      {addError && (
        <div className="add-error" role="alert">
          {addError}
        </div>
      )}
    </div>
  );
}
