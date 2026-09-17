// Design tab — Story detail screen (plan §4, design-tab.html §E + §F, v5.5).
//
// Always reached from a story row via `Open story →` or a deep link
// (/projects/:id/design/:storyId). Features:
//  - Back arrow (top-left, sole top-of-page control — AC-11) returns to the
//    Design list with the source row scrolled + highlighted (.selected).
//  - Story header card: id · status pill · `Mark design complete →` (disabled
//    before Peer review, aria-disabled + tooltip) · `Request changes`
//    (Peer review only).
//  - Linked requirement card + Add design source card (always visible).
//  - 4-state interaction toggle (Default · Loading · Error · Success) with
//    roving keyboard focus (Left/Right/Home/End), aria-live preview body, and
//    a F-2-sandboxed iframe — sandbox denies BOTH allow-same-origin AND
//    allow-scripts.
//  - Linked source card (Replace / Remove → ConfirmDialog → empty state).
//  - Notes thread — human-post-only (FR-8), no A↔B, no disagreement callout.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useOutletContext, useParams } from 'react-router-dom';
import {
  attachFigmaSource,
  attachHtmlSource,
  fetchDesignStory,
  postDesignNote,
  removeDesignSource,
  transitionDesignStory,
  type DesignStoryDetail,
} from '../../lib/api';
import type { ProjectOutletContext } from '../ProjectDetailScreen';
import { ConfirmDialog } from '../ConfirmDialog';

type Notice = { kind: 'success' | 'error'; text: string };
type PreviewState = 'default' | 'loading' | 'error' | 'success';
type AttachMode = 'none' | 'figma' | 'html';

const PREVIEW_STATES: PreviewState[] = ['default', 'loading', 'error', 'success'];
const PREVIEW_LABEL: Record<PreviewState, string> = {
  default: 'Default',
  loading: 'Loading',
  error: 'Error',
  success: 'Success',
};

// Static preview content. For an attached HTML source the default frame renders
// the uploaded file itself; loading/error/success overlay a state banner on a
// copy of it so the interaction state is legible without a custom preview
// designer (out of scope in v5.5). Every frame is sandboxed (F-2).
const SKELETON_BANNER = `<!doctype html><html><body style="font-family: Inter, sans-serif; background:#fafafe; margin:0; padding:8px; color:#2b2547;"><div style="max-width:420px; margin:0 auto; border:1px solid rgba(50,42,92,.1); border-radius:12px; padding:14px;"><div style="font-size:11px; color:#8b87a5;">Preview is loading…</div><div style="height:14px; border-radius:6px; margin-top:10px; background:linear-gradient(90deg,#e6e1f7,#c3cde8,#e6e1f7); background-size:200% 100%; animation:shim 1.4s linear infinite;"></div><div style="height:12px; width:60%; border-radius:6px; margin-top:8px; background:linear-gradient(90deg,#e6e1f7,#c3cde8,#e6e1f7); background-size:200% 100%; animation:shim 1.4s linear infinite;"></div><style>@keyframes shim { 0% { background-position:200% 0; } 100% { background-position:-200% 0; } }</style></div></body></html>`;

const ERROR_BANNER = `<!doctype html><html><body style="font-family: Inter, sans-serif; background:#fafafe; margin:0; padding:8px; color:#2b2547;"><div style="max-width:420px; margin:0 auto; background:#fff; border:1px solid #fadcd9; border-radius:14px; padding:18px; text-align:center;"><div style="width:40px; height:40px; border-radius:50%; background:#fadcd9; color:#d97a8e; display:grid; place-items:center; margin:0 auto 10px; font-weight:700;">!</div><h3 style="margin:0 0 6px; font-size:14px;">Couldn't load the request</h3><p style="font-size:12.5px; color:#8b87a5; margin:0; line-height:1.5;">We hit a snag pulling this interaction state. Try again in a moment.</p></div></body></html>`;

const SUCCESS_BANNER = `<!doctype html><html><body style="font-family: Inter, sans-serif; background:#fafafe; margin:0; padding:8px; color:#2b2547;"><div style="max-width:420px; margin:0 auto; background:#fff; border:1px solid #d7efe4; border-radius:14px; padding:18px; text-align:center;"><div style="width:40px; height:40px; border-radius:50%; background:#d7efe4; color:#5fbf95; display:grid; place-items:center; margin:0 auto 10px;">✓</div><h3 style="margin:0 0 6px; font-size:14px;">Status updated</h3><p style="font-size:12.5px; color:#8b87a5; margin:0; line-height:1.5;">This interaction state is live and ready to preview.</p></div></body></html>`;

// F-2: the preview iframe must deny BOTH allow-same-origin AND allow-scripts
// (and allow-forms / allow-top-navigation). An empty sandbox grants no tokens —
// scripts in the srcdoc cannot execute and the frame stays origin-null, so a
// captured page can neither run payloads nor phone home on a same-origin
// context (the plan's stored-XSS hardening).
const IFRAME_SANDBOX = '';

// Escape HTML entities before markdown-lite so note bodies can never inject
// markup (server already rejected any '<', this is defense in depth — F-3).
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Markdown-lite: **bold**, *italic*, `code`. No links, no headings — the
// notes surface is lightweight by design (FR-8).
function markdownLite(raw: string): string {
  return esc(raw)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

function NoteBody({ body }: { body: string }) {
  const html = useMemo(() => markdownLite(body), [body]);
  // eslint-disable-next-line react/no-danger
  return <p dangerouslySetInnerHTML={{ __html: html }} />;
}

type LoadState = 'loading' | 'ok' | 'error' | 'not-found';

export function DesignStoryScreen() {
  const { id, storyId } = useParams();
  const { project } = useOutletContext<ProjectOutletContext>();

  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [detail, setDetail] = useState<DesignStoryDetail | null>(null);
  const [activeState, setActiveState] = useState<PreviewState>('default');
  const [attachMode, setAttachMode] = useState<AttachMode>('none');
  const [figmaUrl, setFigmaUrl] = useState('');
  const [attachError, setAttachError] = useState<string | null>(null);
  const [attaching, setAttaching] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [posting, setPosting] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const noticeTimer = useRef<number | null>(null);
  const removeTriggerRef = useRef<HTMLButtonElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const showNotice = useCallback((n: Notice) => {
    setNotice(n);
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 4000);
  }, []);

  const idOrSlug = id ?? '';
  const sid = storyId ?? '';

  const reload = useCallback(async () => {
    try {
      const data = await fetchDesignStory(idOrSlug, sid);
      setDetail(data);
      setLoadState('ok');
      setAttachMode('none');
      setAttachError(null);
      setFigmaUrl('');
    } catch (err) {
      setLoadState('error');
      setLoadError(err instanceof Error ? err.message : 'Could not load this story.');
      setNotice({ kind: 'error', text: err instanceof Error ? err.message : 'Could not load this story.' });
    }
  }, [idOrSlug, sid, showNotice]);

  useEffect(() => {
    let cancelled = false;
    setLoadState('loading');
    (async () => {
      try {
        const data = await fetchDesignStory(idOrSlug, sid);
        if (!cancelled) {
          setDetail(data);
          setLoadState('ok');
        }
      } catch (err) {
        if (!cancelled) {
          const status = (err as { status?: number }).status;
          if (status === 404) {
            setLoadState('not-found');
          } else {
            setLoadState('error');
            setLoadError(err instanceof Error ? err.message : 'Could not load this story.');
          }
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [idOrSlug, sid]);

  const gate = project && !project.context_confirmed;

  const source = detail?.source ?? null;
  const hasSource = source?.type !== null && source?.type !== undefined;

  const markComplete = useCallback(async () => {
    try {
      await transitionDesignStory(idOrSlug, sid, 'design_complete');
      showNotice({ kind: 'success', text: `Story ${sid} moved to Design complete.` });
      await reload();
    } catch (err) {
      showNotice({ kind: 'error', text: err instanceof Error ? err.message : 'Could not update the story.' });
    }
  }, [idOrSlug, sid, reload, showNotice]);

  const requestChanges = useCallback(async () => {
    try {
      await transitionDesignStory(idOrSlug, sid, 'in_design');
      showNotice({ kind: 'success', text: `Story ${sid} returned to In design.` });
      await reload();
    } catch (err) {
      showNotice({ kind: 'error', text: err instanceof Error ? err.message : 'Could not update the story.' });
    }
  }, [idOrSlug, sid, reload, showNotice]);

  // 4-state toggle keyboard nav (FR-6): Left/Up prev, Right/Down next, Home/End.
  const onToggleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>) => {
      let next: number | null = null;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (PREVIEW_STATES.indexOf(activeState) + 1) % 4;
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (PREVIEW_STATES.indexOf(activeState) + 3) % 4;
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = 3;
      if (next === null) return;
      e.preventDefault();
      setActiveState(PREVIEW_STATES[next]);
    },
    [activeState],
  );

  const onSaveFigma = useCallback(async () => {
    if (!figmaUrl.trim()) {
      setAttachError('Enter a Figma file URL first.');
      return;
    }
    setAttaching(true);
    setAttachError(null);
    try {
      await attachFigmaSource(idOrSlug, sid, figmaUrl.trim());
      showNotice({ kind: 'success', text: 'Figma link saved.' });
      setFigmaUrl('');
      await reload();
    } catch (err) {
      setAttachError(err instanceof Error ? err.message : 'Could not save that link.');
      showNotice({ kind: 'error', text: err instanceof Error ? err.message : 'Could not save that link.' });
    } finally {
      setAttaching(false);
    }
  }, [figmaUrl, idOrSlug, sid, reload, showNotice]);

  const onFilePick = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      if (!/\.(html?|htm)$/i.test(file.name)) {
        setAttachError('Only .html or .htm files are supported.');
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        setAttachError(
          `Files must be 5 MB or smaller. The current file is ${(file.size / 1024 / 1024).toFixed(1)} MB.`,
        );
        return;
      }
      setAttaching(true);
      setAttachError(null);
      try {
        const content = await file.text();
        await attachHtmlSource(idOrSlug, sid, file.name, content);
        showNotice({ kind: 'success', text: `${file.name} uploaded as the source.` });
        await reload();
      } catch (err) {
        setAttachError(err instanceof Error ? err.message : 'Could not upload that file.');
        showNotice({ kind: 'error', text: err instanceof Error ? err.message : 'Could not upload that file.' });
      } finally {
        setAttaching(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    },
    [idOrSlug, sid, reload, showNotice],
  );

  const onRemove = useCallback(async () => {
    setRemoving(true);
    try {
      await removeDesignSource(idOrSlug, sid);
      setRemoveOpen(false);
      showNotice({ kind: 'success', text: 'Source removed.' });
      await reload();
    } catch (err) {
      showNotice({ kind: 'error', text: err instanceof Error ? err.message : 'Could not remove the source.' });
    } finally {
      setRemoving(false);
    }
  }, [idOrSlug, sid, reload, showNotice]);

  const onPostNote = useCallback(async () => {
    if (!noteDraft.trim()) return;
    setPosting(true);
    try {
      const res = await postDesignNote(idOrSlug, sid, noteDraft.trim());
      setDetail((d) => (d ? { ...d, notes: [...d.notes, res.note] } : d));
      setNoteDraft('');
      showNotice({ kind: 'success', text: 'Note posted.' });
    } catch (err) {
      showNotice({ kind: 'error', text: err instanceof Error ? err.message : 'Could not post the note.' });
    } finally {
      setPosting(false);
    }
  }, [noteDraft, idOrSlug, sid, showNotice]);

  // ── Gate after hooks (SprintScreen pattern).
  if (gate) {
    return <Navigate to={`/projects/${idOrSlug}/overview`} replace />;
  }

  const previewDocFor = (state: PreviewState): string => {
    if (source?.type === 'html') {
      // Read-only echo of the stored source inside a F-2 sandbox. The base
      // document is the uploaded file; non-default states overlay a banner.
      const base = (source.preview_html ?? '') as string;
      if (state === 'default') return base || '<!doctype html><html><body style="font-family:Inter;background:#fafafe;margin:0;padding:8px;color:#8b87a5;">(stored HTML)</body></html>';
      if (state === 'loading') return SKELETON_BANNER;
      if (state === 'error') return ERROR_BANNER;
      return SUCCESS_BANNER;
    }
    // Figma source — real embed is out of scope (v5.6); the frame shows the
    // linked URL so the user has their reference in place.
    const figmaCard = `<div style="max-width:460px;margin:0 auto;background:#fff;border:1px solid rgba(50,42,92,.1);border-radius:14px;padding:18px;text-align:center;"><div style="width:40px;height:40px;border-radius:10px;background:#f24e1e;color:#fff;display:grid;place-items:center;margin:0 auto 10px;font-weight:700;font-size:12px;">F</div><h3 style="margin:0 0 6px;font-size:14px;">Figma source linked</h3><p style="font-size:12.5px;color:#8b87a5;margin:0 0 10px;line-height:1.5;word-break:break-all;">${esc(source?.value ?? '')}</p><p style="font-size:11.5px;color:#8b87a5;margin:0;">Real-time Figma embedding ships in a later version. Open the frame in Figma for the live design.</p></div>`;
    if (state === 'default') return `<!doctype html><html><body style="font-family:Inter;background:#fafafe;margin:0;padding:8px;color:#2b2547;">${figmaCard}</body></html>`;
    if (state === 'loading') return SKELETON_BANNER;
    if (state === 'error') return ERROR_BANNER;
    return SUCCESS_BANNER;
  };

  const primaryReq = detail?.story.reqs.find((r) => r.text !== null && r.id.startsWith('BR-')) ?? detail?.story.reqs[0] ?? null;
  const otherReqs = (detail?.story.reqs ?? []).filter((r) => r !== primaryReq);

  const sourceLabel = (): string => {
    if (source?.type === 'html') {
      const meta = source.meta as { filename?: string; size?: number };
      const size = typeof meta.size === 'number' ? `${(meta.size / 1024).toFixed(0)} KB` : '';
      return `${meta.filename ?? source.value ?? 'preview.html'}${size ? ` · ${size}` : ''}`;
    }
    return source?.value ?? 'Figma source';
  };

  return (
    <div className="design-screen">
      <div className="topbar">
        <Link
          to={`/projects/${idOrSlug}/design`}
          state={{ storyId: sid }}
          className="back-arrow"
          aria-label="Back to Design list"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          <span>Back to Design list</span>
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
        <div className="center-stage" style={{ minHeight: 320 }}>
          <div className="center-card" style={{ textAlign: 'center' }}>
            <h1>Loading…</h1>
          </div>
        </div>
      )}

      {loadState === 'not-found' && (
        <div className="center-stage" style={{ minHeight: 320 }}>
          <div className="center-card" style={{ textAlign: 'center' }}>
            <h1>Unknown story</h1>
            <p className="sub" style={{ textAlign: 'center' }}>
              This story doesn&rsquo;t exist in this project.
            </p>
            <div className="actions-row" style={{ justifyContent: 'center' }}>
              <Link to={`/projects/${idOrSlug}/design`} className="btn btn-primary">
                Back to Design list
              </Link>
            </div>
          </div>
        </div>
      )}

      {loadState === 'error' && (
        <div className="center-stage" style={{ minHeight: 320 }}>
          <div className="center-card" style={{ textAlign: 'center' }}>
            <h1>Could not load this story</h1>
            <p className="sub" style={{ textAlign: 'center' }}>
              {loadError}
            </p>
          </div>
        </div>
      )}

      {loadState === 'ok' && detail && (
        <>
          {/* Story header card */}
          <div className="card">
            <div className="story-head">
              <div className="ico-lg" aria-hidden="true">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2b2547" strokeWidth={1.8}>
                  <path d="M4 4h16v16H4z M4 9h16 M9 4v16" />
                </svg>
              </div>
              <div className="title-stack">
                <h1>{detail.story.title}</h1>
                <div className="one">
                  {detail.story.storyId}
                  {primaryReq ? ` · From ${primaryReq.id}` : ''}
                  {detail.story.ticket_key ? ` · ${detail.story.ticket_key}` : ''}
                </div>
              </div>
              <div className="actions">
                <span className={`pill ${detail.story.design_status === 'in_design' ? 'inprog' : detail.story.design_status === 'peer_review' ? 'review' : detail.story.design_status === 'design_complete' || detail.story.design_status === 'ready_for_dev' ? 'done' : 'todo'}`}>
                  <span className="dot" /> {detail.story.status_pill}
                </span>
                {detail.story.design_status === 'peer_review' && (
                  <button type="button" className="btn btn-soft btn-pill" onClick={requestChanges}>
                    Request changes
                  </button>
                )}
                {detail.story.design_status !== 'design_complete' && detail.story.design_status !== 'ready_for_dev' && (
                  <button
                    type="button"
                    className="btn btn-primary btn-pill"
                    aria-disabled={detail.story.design_status !== 'peer_review'}
                    disabled={detail.story.design_status !== 'peer_review'}
                    title={
                      detail.story.design_status !== 'peer_review'
                        ? 'Move the story to Peer review first.'
                        : undefined
                    }
                    onClick={markComplete}
                    style={
                      detail.story.design_status !== 'peer_review'
                        ? { opacity: 0.5, cursor: 'not-allowed' }
                        : undefined
                    }
                  >
                    Mark design complete →
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Linked requirement + Add source (2-col row) */}
          <div className="req-add-row">
            <div className="req-card">
              <div className="h">
                <svg className="ico" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true" style={{ color: 'var(--purple)' }}>
                  <path d="M5 4h11l3 3v13H5z M16 4v3h3 M8 11h8 M8 14h8 M8 17h5" />
                </svg>
                <h4>Linked requirement</h4>
                <span className="id">{primaryReq?.id ?? '—'}</span>
                <Link className="open" to={`/projects/${idOrSlug}/requirements`}>
                  Open in Requirements →
                </Link>
              </div>
              <p className="desc">
                {primaryReq?.text ?? 'No description — open in Requirements to write one.'}
              </p>
              {otherReqs.length > 0 && (
                <div className="users-row">
                  <span className="lbl">Also derived from</span>
                  {otherReqs.map((r) => (
                    <span className="user-chip u-tenant" key={r.id}>
                      <span className="dot" /> {r.id}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Add design source — always visible (FR-4), primary CTA in the
                empty state (§F). */}
            <div className="add-source-card">
              <div className="h">
                <h4>Add design source</h4>
                <a className="help" href="/#/design" aria-label="How to add a design source" title="How to add a design source">
                  ?
                </a>
              </div>
              <div className="controls">
                {attachMode === 'none' && (
                  <>
                    <button
                      type="button"
                      className="btn btn-soft btn-pill"
                      onClick={() => {
                        setAttachMode('figma');
                        setAttachError(null);
                      }}
                    >
                      + Add Figma link
                    </button>
                    <button
                      type="button"
                      className="btn btn-soft btn-pill"
                      onClick={() => {
                        setAttachMode('html');
                        setAttachError(null);
                        fileInputRef.current?.click();
                      }}
                    >
                      + Upload HTML
                    </button>
                  </>
                )}
                {attachMode === 'figma' && (
                  <>
                    <div className="src-input-row">
                      <input
                        type="url"
                        value={figmaUrl}
                        placeholder="https://www.figma.com/file/…"
                        aria-label="Figma file URL"
                        onChange={(e) => setFigmaUrl(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            void onSaveFigma();
                          }
                        }}
                      />
                      <button type="button" className="btn btn-primary btn-pill" disabled={attaching} onClick={onSaveFigma}>
                        {attaching ? 'Saving…' : 'Save'}
                      </button>
                      <button type="button" className="btn btn-soft btn-pill" disabled={attaching} onClick={() => setAttachMode('none')}>
                        Cancel
                      </button>
                    </div>
                    {attachError && (
                      <div className="field-error" role="alert">
                        {attachError}
                      </div>
                    )}
                  </>
                )}
                {attachMode === 'html' && (
                  <>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".html,.htm"
                      aria-label="Upload an HTML preview"
                      style={{ display: 'none' }}
                      onChange={(e) => void onFilePick(e.target.files?.[0])}
                    />
                    {attachError && (
                      <div className="field-error" role="alert">
                        {attachError}
                      </div>
                    )}
                    <button type="button" className="btn btn-soft btn-pill" disabled={attaching} onClick={() => setAttachMode('none')}>
                      Cancel
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Design preview card */}
          <div className="preview-card">
            <div className="pv-card">
              <div className="pv-h">
                <h4>Design preview</h4>
                {hasSource ? (
                  <span className="src-pill">
                    {source?.type === 'html' ? 'HTML' : 'Figma'} · {sourceLabel()}
                  </span>
                ) : (
                  <span className="src-pill" style={{ opacity: 0.6 }}>
                    No source linked
                  </span>
                )}
                <span className="a11y-chip">
                  <span className="dot" /> a11y —
                </span>
                <div
                  className="state-toggle-group"
                  role="tablist"
                  aria-label="Interaction state"
                  aria-disabled={hasSource ? undefined : 'true'}
                  style={{ marginLeft: 'auto' }}
                >
                  {PREVIEW_STATES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      role="tab"
                      aria-selected={activeState === s}
                      tabIndex={hasSource ? (activeState === s ? 0 : -1) : -1}
                      className={activeState === s ? 'on' : undefined}
                      disabled={!hasSource}
                      onClick={() => setActiveState(s)}
                      onKeyDown={hasSource ? onToggleKeyDown : undefined}
                      style={!hasSource ? { cursor: 'not-allowed' } : undefined}
                    >
                      {PREVIEW_LABEL[s]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pv-body" aria-live="polite" aria-atomic="true">
                {hasSource ? (
                  <>
                    {PREVIEW_STATES.map((s) => (
                      <iframe
                        key={s}
                        className="pv-frame"
                        title={`${detail.story.title} — ${PREVIEW_LABEL[s].toLowerCase()} state`}
                        sandbox={IFRAME_SANDBOX}
                        srcDoc={previewDocFor(s)}
                        hidden={activeState !== s}
                      />
                    ))}
                  </>
                ) : (
                  <div className="preview-empty">
                    <div className="ic" aria-hidden="true">
                      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                        <rect x="3" y="3" width="18" height="18" rx="3" />
                        <path d="M3 16l5-5 4 4 3-3 6 6 M21 16v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3" />
                      </svg>
                    </div>
                    <h4>No design attached yet</h4>
                    <p>
                      Attach a Figma frame or HTML preview so the team can validate the design.
                      The preview and state toggles light up as soon as one is attached.
                    </p>
                    <button
                      type="button"
                      className="btn btn-primary btn-pill"
                      onClick={() => {
                        setAttachMode('figma');
                        setAttachError(null);
                      }}
                    >
                      + Add design source
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Linked source card (FR-7) — only when a source exists */}
          {hasSource && (
            <div className="src-card">
              <div className={`ic ${source?.type === 'figma' ? 'figma' : 'html'}`} aria-hidden="true">
                {source?.type === 'figma' ? 'F' : 'H'}
              </div>
              <div className="meta">
                <div className="h-label">Linked source</div>
                <div className="path">{sourceLabel()}</div>
                {source?.type === 'html' ? (
                  <span className="sub">Uploaded HTML preview · shown in the frame above</span>
                ) : (
                  <span className="sub">Figma frame URL · open in Figma for the live design</span>
                )}
              </div>
              <div className="actions">
                <button
                  type="button"
                  className="btn btn-soft btn-pill"
                  onClick={() => {
                    setAttachMode(source?.type === 'figma' ? 'figma' : 'html');
                    setAttachError(null);
                    if (source?.type === 'html') fileInputRef.current?.click();
                  }}
                >
                  Replace
                </button>
                <button
                  type="button"
                  ref={removeTriggerRef}
                  className="btn btn-soft btn-pill"
                  onClick={() => setRemoveOpen(true)}
                >
                  Remove
                </button>
              </div>
            </div>
          )}

          {/* Notes thread (FR-8) — human-post-only */}
          <div className="story-thread-wrap">
            <div className="card">
              <div className="thread" style={{ padding: '18px 22px 22px' }}>
                <div className="thread-head">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                  Notes
                  <span className="who">
                    {detail.notes.length === 0
                      ? 'No notes yet'
                      : `${detail.notes.length} ${detail.notes.length === 1 ? 'note' : 'notes'}`}
                  </span>
                </div>

                <article className="thread-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {detail.notes.map((n) => (
                    <div className="comment" key={n.id}>
                      <div className="byline">
                        <span className="av" aria-hidden="true">
                          {n.author.slice(0, 1).toUpperCase()}
                        </span>
                        <span className="who">
                          {n.author} <span>· {formatTs(n.created_at)}</span>
                        </span>
                      </div>
                      <div className="body">
                        <NoteBody body={n.body} />
                      </div>
                    </div>
                  ))}
                </article>

                <div className="compose" style={{ marginTop: 12 }}>
                  <textarea
                    value={noteDraft}
                    placeholder={
                      hasSource
                        ? 'Add a note about this design…'
                        : 'Open the thread when a design is attached — notes unlock here.'
                    }
                    aria-label="Add a note about this design"
                    disabled={!hasSource || posting}
                    onChange={(e) => setNoteDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                        e.preventDefault();
                        void onPostNote();
                      }
                    }}
                    rows={Math.min(6, Math.max(2, noteDraft.split('\n').length + 1))}
                  />
                  <span className="who">Posting as <b>Will</b></span>
                  <button
                    type="button"
                    className="btn btn-primary btn-pill"
                    disabled={!hasSource || !noteDraft.trim() || posting}
                    onClick={onPostNote}
                  >
                    {posting ? 'Posting…' : 'Post'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="foot-caption">
            Last updated · {hasSource ? 'has a linked source' : 'no source linked'}
          </div>
        </>
      )}

      <ConfirmDialog
        open={removeOpen}
        title="Remove source?"
        description="Reviewers won't be able to preview the design until a new source is linked."
        confirmLabel="Remove"
        cancelLabel="Cancel"
        busy={removing}
        triggerRef={removeTriggerRef}
        onConfirm={onRemove}
        onClose={() => setRemoveOpen(false)}
      />
    </div>
  );
}

// Relative "x·x ago" formatting for note timestamps (client-local — no server
// timezone math, code-quality timezone rules).
function formatTs(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const diff = Math.max(0, Date.now() - then);
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}
