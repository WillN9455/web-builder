// Project Background screen — the BA Workspace (sitemap screens 12 · 13 · 14
// + State D gate). Zones top→bottom: stage banner (live counts), open-questions
// banner (butter), two-column body (file tree + document editor + inline
// review thread). When all 17 artifacts are Approved the State D
// confirmation card replaces the workspace (same per-project shell — locked
// decision 10).
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useOutletContext, useParams } from 'react-router-dom';
import {
  addBaComment,
  confirmProjectContext,
  fetchBaComments,
  fetchBaFile,
  fetchBaFiles,
  fetchBaOpenQuestions,
  retryBaGeneration,
  saveBaFile,
  transitionBaFile,
  type BaComment,
  type BaFilesResponse,
} from '../lib/api';
import { ConfirmDialog } from './ConfirmDialog';
import { FileTreeSkeleton, DocumentSkeleton } from './Skeletons';
import { FileTree } from './ba-workspace/FileTree';
import { ArtifactEditor } from './ba-workspace/ArtifactEditor';
import { ReviewThread } from './ba-workspace/ReviewThread';
import { StageBanner } from './ba-workspace/StageBanner';
import { OpenQuestionsBanner } from './ba-workspace/OpenQuestionsBanner';
import { ContextReadyView } from './ba-workspace/ContextReadyView';
import { GenerationPanel } from './ba-workspace/GenerationPanel';
import type { ProjectOutletContext } from './ProjectDetailScreen';

type Notice = { kind: 'success' | 'error'; text: string };

export function ProjectBackgroundScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { project, error: shellError, onContextConfirmed } =
    useOutletContext<ProjectOutletContext>();

  // ── Files (tree + counts + gate) ─────────────────────────────────────────
  const [filesData, setFilesData] = useState<BaFilesResponse | null>(null);
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [filesError, setFilesError] = useState<string | null>(null);

  const loadFiles = useCallback(
    // silent: poll-refresh without the skeleton flicker (the 2s generation
    // poll — AC-19 — would re-trigger it every tick otherwise).
    async (opts?: { silent?: boolean }) => {
      if (!opts?.silent) setLoadingFiles(true);
      setFilesError(null);
      try {
        const data = await fetchBaFiles(id ?? '');
        setFilesData(data);
      } catch (err) {
        setFilesError(err instanceof Error ? err.message : 'Could not load the PRD artifacts');
      } finally {
        setLoadingFiles(false);
      }
    },
    [id],
  );

  useEffect(() => {
    void loadFiles();
    // Open-questions banner data — a failure here just hides the banner.
    fetchBaOpenQuestions(id ?? '')
      .then((d) => setBlockers(d.blockerCount))
      .catch(() => setBlockers(0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // ── BA auto-draft generation (plan addendum AC-17…AC-19) ────────────────
  const generation = filesData?.generation ?? null;
  const generationActive = generation?.state === 'pending' || generation?.state === 'generating';

  // Poll GET /files while the BA agent drafts; stops on unmount and as soon
  // as the run lands done/failed. Navigating away and back mid-generation is
  // safe — the panel state is server-side, so a remount re-derives it.
  useEffect(() => {
    if (!generationActive) return;
    const t = window.setInterval(() => {
      void loadFiles({ silent: true });
    }, 2000);
    return () => window.clearInterval(t);
  }, [generationActive, loadFiles]);

  // Manual trigger / failed-run retry (AC-18) — same endpoint; the retry
  // re-runs only missing files (skip-if-exists).
  const [triggering, setTriggering] = useState(false);
  const handleRetryGeneration = useCallback(async () => {
    setTriggering(true);
    try {
      await retryBaGeneration(id ?? '');
      await loadFiles();
      showNotice({
        kind: 'success',
        text: 'BA Agent started drafting the Project Background documents.',
      });
    } catch (err) {
      showNotice({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Could not start the document generation',
      });
    } finally {
      setTriggering(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, loadFiles]);

  // ── Open file ────────────────────────────────────────────────────────────
  const [selected, setSelected] = useState<string | null>(null);
  const [savedBody, setSavedBody] = useState('');
  const [draft, setDraft] = useState('');
  const [bodyLoading, setBodyLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [comments, setComments] = useState<BaComment[]>([]);
  const [blockers, setBlockers] = useState(0);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [pendingSelect, setPendingSelect] = useState<string | null>(null);
  const treeTriggerRef = useRef<HTMLDivElement>(null);

  const selectedFile = filesData?.files.find((f) => f.filename === selected) ?? null;
  const dirty = !bodyLoading && selectedFile !== null && draft !== savedBody;

  const openFile = useCallback(
    async (filename: string) => {
      setSelected(filename);
      setBodyLoading(true);
      try {
        const data = await fetchBaFile(id ?? '', filename);
        setSavedBody(data.content);
        setDraft(data.content);
        setComments([]);
      } catch (err) {
        setNotice({
          kind: 'error',
          text: err instanceof Error ? err.message : `Could not open ${filename}`,
        });
        setSavedBody('');
        setDraft('');
      } finally {
        setBodyLoading(false);
      }
    },
    [id],
  );

  // Auto-select the first artifact once the tree loads.
  useEffect(() => {
    if (!loadingFiles && filesData && filesData.files.length > 0 && selected === null) {
      void openFile(filesData.files[0].filename);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingFiles, filesData]);

  const refreshAfterMutation = useCallback(
    async (filename: string, status: string) => {
      await loadFiles();
      // Re-read the body so the editor shows exactly what's on disk, and
      // refresh the thread when the file is under review.
      try {
        const data = await fetchBaFile(id ?? '', filename);
        setSavedBody(data.content);
        setDraft(data.content);
      } catch {
        /* tree still refreshed — keep the in-memory body */
      }
      if (status === 'in_review') {
        const c = await fetchBaComments(id ?? '', filename).catch(() => ({ comments: [] }));
        setComments(c.comments);
      }
    },
    [id, loadFiles],
  );

  const showNotice = useCallback((n: Notice) => setNotice(n), []);

  // Toast auto-dismiss (4s — ui-best-practices.md §3).
  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(t);
  }, [notice]);

  // Dirty guard: warn before leaving the page with unsaved edits.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  // ── Actions ──────────────────────────────────────────────────────────────

  const handleSelect = (filename: string) => {
    if (filename === selected) return;
    if (dirty) {
      // Unsaved edits — confirm the discard before switching (validation state).
      setPendingSelect(filename);
      return;
    }
    void openFile(filename);
  };

  const handleSave = useCallback(async (): Promise<boolean> => {
    if (!selectedFile) return false;
    setSaving(true);
    try {
      await saveBaFile(id ?? '', selectedFile.filename, draft);
      setSavedBody(draft);
      void loadFiles();
      showNotice({ kind: 'success', text: `Saved changes to ${selectedFile.filename}.` });
      return true;
    } catch (err) {
      showNotice({
        kind: 'error',
        text: err instanceof Error ? err.message : `Could not save ${selectedFile.filename}`,
      });
      return false;
    } finally {
      setSaving(false);
    }
  }, [draft, id, loadFiles, selectedFile, showNotice]);

  const handleSend = useCallback(async () => {
    if (!selectedFile) return;
    setBusy(true);
    try {
      // Dirty edits must land on disk before the SA reviews them.
      if (dirty) {
        const ok = await handleSave();
        if (!ok) return;
      }
      await transitionBaFile(id ?? '', selectedFile.filename, 'in_review');
      await refreshAfterMutation(selectedFile.filename, 'in_review');
      showNotice({
        kind: 'success',
        text: `Sent for SA review — only this file: ${selectedFile.filename}.`,
      });
    } catch (err) {
      showNotice({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Could not send for review',
      });
    } finally {
      setBusy(false);
    }
  }, [dirty, handleSave, id, refreshAfterMutation, selectedFile, showNotice]);

  const handleTransition = useCallback(
    async (to: 'returned' | 'approved') => {
      if (!selectedFile) return;
      setBusy(true);
      try {
        await transitionBaFile(id ?? '', selectedFile.filename, to);
        await refreshAfterMutation(selectedFile.filename, to);
        showNotice({
          kind: 'success',
          text: to === 'returned' ? 'Returned to BA.' : `Approved ✓ ${selectedFile.filename}`,
        });
      } catch (err) {
        showNotice({
          kind: 'error',
          text: err instanceof Error ? err.message : 'Could not update the review state',
        });
      } finally {
        setBusy(false);
      }
    },
    [id, refreshAfterMutation, selectedFile, showNotice],
  );

  const handleReply = useCallback(
    async (body: string) => {
      if (!selectedFile) return;
      setBusy(true);
      try {
        await addBaComment(id ?? '', selectedFile.filename, 'BA', body);
        const c = await fetchBaComments(id ?? '', selectedFile.filename);
        setComments(c.comments);
      } catch (err) {
        showNotice({
          kind: 'error',
          text: err instanceof Error ? err.message : 'Could not post the reply',
        });
      } finally {
        setBusy(false);
      }
    },
    [id, selectedFile, showNotice],
  );

  const handleConfirmContext = useCallback(async () => {
    setBusy(true);
    try {
      await confirmProjectContext(id ?? '');
      onContextConfirmed();
      await loadFiles();
      showNotice({
        kind: 'success',
        text: 'Project context confirmed — Sprint, Design, Build, QA unlocked.',
      });
    } catch (err) {
      showNotice({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Could not confirm the project context',
      });
    } finally {
      setBusy(false);
    }
  }, [id, loadFiles, onContextConfirmed, showNotice]);

  // ── Shell-level states ───────────────────────────────────────────────────

  if (shellError) {
    return (
      <div className="center-stage" style={{ minHeight: 400 }}>
        <div className="center-card" style={{ textAlign: 'center' }}>
          <div className="crumbs">Project</div>
          <h1>Could not load &ldquo;{id}&rdquo;</h1>
          <p className="sub" style={{ textAlign: 'center' }}>{shellError}</p>
          <div className="actions-row" style={{ justifyContent: 'center' }}>
            <button type="button" className="btn btn-primary" onClick={() => navigate('/projects')}>
              Back to projects
            </button>
          </div>
        </div>
      </div>
    );
  }
  if (project === null) {
    return (
      <div className="center-stage" style={{ minHeight: 400 }}>
        <div className="center-card" style={{ textAlign: 'center' }}>
          <div className="crumbs">Project</div>
          <h1>Loading…</h1>
        </div>
      </div>
    );
  }

  const bands = (filesData?.bands ?? []).map((b) => ({
    key: b.key,
    label: b.label,
    files: filesData?.files.filter((f) => f.band === b.key) ?? [],
  }));
  // Band progress for the generation panel — done counts come from the files
  // already on disk; totals from the server's bands payload (one source).
  const genBands = (filesData?.bands ?? []).map((b) => ({
    label: b.label,
    done: filesData?.files.filter((f) => f.band === b.key).length ?? 0,
    total: b.total,
  }));

  // State D — the gate card replaces the workspace when every artifact is
  // approved. After confirmation it stays up in its confirmed variant until
  // "← Back to artifacts" is used (ContextReadyView's local state).
  if (filesData?.contextReady) {
    return (
      <>
        {notice && <NoticeBar notice={notice} />}
        <ContextReadyView
          files={filesData.files}
          bandLabels={filesData.bands}
          alreadyConfirmed={filesData.contextConfirmed}
          busy={busy}
          error={notice?.kind === 'error' ? notice.text : null}
          onConfirm={handleConfirmContext}
        />
      </>
    );
  }

  return (
    <div className="ba-workspace">
      {notice && <NoticeBar notice={notice} />}

      {filesData?.contextChangedSinceConfirm && (
        <div className="ba-warn" role="alert">
          <b>Context changed since confirmation</b> — an artifact is no longer Approved. The
          downstream tabs stay unlocked (the confirm is one-shot and never re-locks), but
          re-confirm before relying on the locked context.
        </div>
      )}

      {generation?.state === 'failed' && (
        // AC-19 — failed run: error banner + Retry (re-drafts only the gaps).
        <div className="ba-warn" role="alert">
          <b>BA document generation failed</b> — {generation.error ?? 'some documents are missing.'}{' '}
          <button
            type="button"
            className="btn btn-soft"
            disabled={triggering}
            onClick={() => void handleRetryGeneration()}
          >
            Retry
          </button>
        </div>
      )}

      <StageBanner
        counts={
          filesData?.counts ?? { draft: 0, in_review: 0, returned: 0, approved: 0, total: 0 }
        }
        review={
          selectedFile?.status === 'in_review'
            ? { filename: selectedFile.filename, commentCount: comments.length }
            : null
        }
      />

      <OpenQuestionsBanner projectId={id ?? ''} blockerCount={blockers} />

      {loadingFiles ? (
        <div className="ba-grid">
          <FileTreeSkeleton />
          <DocumentSkeleton />
        </div>
      ) : filesError ? (
        <div className="center-card ba-error-card" role="alert">
          <h3>Could not load the PRD artifacts</h3>
          <p className="sub">{filesError}</p>
          <div className="actions-row">
            <button type="button" className="btn btn-primary" onClick={() => void loadFiles()}>
              Retry
            </button>
          </div>
        </div>
      ) : generationActive ? (
        // AC-19 — the BA agent is drafting: the panel replaces the tree/editor.
        <GenerationPanel
          count={generation?.count ?? 0}
          current={generation?.current ?? null}
          bands={genBands}
        />
      ) : filesData && filesData.files.length === 0 ? (
        // Empty tree — the project has no PRD/ folder yet (pre-intake-
        // completion projects land here post-#17). Friendly, no crash (AC-3).
        // The button is the manual trigger for pre-feature projects (AC-18).
        <div className="center-card ba-error-card">
          <h3>No PRD artifacts yet</h3>
          <p className="sub">
            This project&rsquo;s folder has no <code>PRD/</code> directory yet. The 17 source
            documents appear here once the BA Agent drafts them.
          </p>
          <div className="actions-row">
            <button
              type="button"
              className="btn btn-primary"
              disabled={triggering}
              onClick={() => void handleRetryGeneration()}
            >
              Draft the documents now
            </button>
          </div>
        </div>
      ) : (
        filesData && (
          <div className="ba-grid">
            <div ref={treeTriggerRef}>
              <FileTree
                bands={bands}
                selected={selected}
                dirtyFilename={dirty ? selected : null}
                onSelect={handleSelect}
              />
            </div>
            <div className="ba-doc-col">
              <ArtifactEditor
                file={selectedFile}
                bodyLoading={bodyLoading}
                value={draft}
                dirty={dirty}
                saving={saving}
                commentCount={comments.length}
                onChange={setDraft}
                onDiscard={() => setDraft(savedBody)}
                onSave={() => void handleSave()}
                onSend={() => void handleSend()}
                onReturn={() => void handleTransition('returned')}
                onApprove={() => void handleTransition('approved')}
              />
              {selectedFile?.status === 'in_review' && (
                <ReviewThread
                  filename={selectedFile.filename}
                  comments={comments}
                  busy={busy}
                  onReply={(body) => void handleReply(body)}
                />
              )}
            </div>
          </div>
        )
      )}

      <ConfirmDialog
        open={pendingSelect !== null}
        title="Discard unsaved changes?"
        description={`You have unsaved edits to ${selected ?? 'this file'}. Switching files discards them — save first to keep the edits.`}
        confirmLabel="Discard and switch"
        cancelLabel="Keep editing"
        triggerRef={treeTriggerRef}
        onClose={() => setPendingSelect(null)}
        onConfirm={() => {
          const target = pendingSelect;
          setPendingSelect(null);
          setDraft(savedBody);
          if (target) void openFile(target);
        }}
      />
    </div>
  );
}

// Transient success / error notice — reuses the .toast styling from the
// delete-project flow (auto-dismissed after 4s above).
function NoticeBar({ notice }: { notice: Notice }) {
  return (
    <div
      className="toast"
      role={notice.kind === 'error' ? 'alert' : 'status'}
      aria-live="polite"
      style={notice.kind === 'error' ? { background: 'var(--blush)' } : undefined}
    >
      <span className="toast-dot" aria-hidden="true" />
      {notice.text}
    </div>
  );
}

