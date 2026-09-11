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
  fetchBaIdea,
  fetchBaOpenQuestions,
  reopenAllBaFiles,
  retryBaGeneration,
  saveBaFile,
  triggerRequirementsGeneration,
  transitionBaFile,
  type BaComment,
  type BaFile,
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
import { IdeaSummaryCard } from './ba-workspace/IdeaSummaryCard';

// The tree's top "Idea" band (plan §9.4 AC-22) — client-synthesized from the
// server's idea.available flag. idea.md is reference material: read-only,
// outside the 17-count/gate/status lifecycle (the server's allowlist never
// accepts it for PUT/transition/comments either).
const IDEA_FILE = 'idea.md';
// AC-29 (plan §9.5) — the Idea band is client-synthesized, so idea.md is never
// in filesData.files; resolving the open file from the server payload alone
// made the editor see `null` and render "No artifact selected" even though the
// body was fetched. This entry gives the editor the same file identity the
// tree band shows (read-only, outside the review lifecycle).
const IDEA_FILE_ENTRY: BaFile = {
  filename: IDEA_FILE,
  band: 'idea',
  title: 'Project idea',
  status: 'draft',
  readOnly: true,
  editedSinceSend: false,
};
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
  // Bulk "send all back to Draft" on the confirmed State D card — one atomic
  // server-side UPDATE flips every Approved artifact back to Draft. Confirmed
  // first via the dialog below; the trigger ref is the button itself so focus
  // returns to it on close (ConfirmDialog triggerRef contract).
  const [pendingReopenAll, setPendingReopenAll] = useState(false);
  const [reopening, setReopening] = useState(false);
  const reopenAllTriggerRef = useRef<HTMLButtonElement>(null);
  // Per-file "Send back to Draft" on the confirmed State D card's list rows —
  // same AC-27 approved → draft transition, one file at a time. The per-row
  // trigger refs live in a map (17 buttons); the dialog's triggerRef points
  // at the row whose dialog is open, so focus returns there on close.
  const [pendingReopenFile, setPendingReopenFile] = useState<string | null>(null);
  const [reopeningFile, setReopeningFile] = useState(false);
  const reopenFileTriggerRefs = useRef(new Map<string, HTMLButtonElement | null>());
  const reopenFileDialogTriggerRef = useRef<HTMLElement | null>(null);
  // The gate card's "← Back to artifacts" — show the full workspace again
  // (tree + read-only approved artifacts). The card is one toggle away via
  // the workspace's "← Project context ready" button, so the state lives here
  // where it survives the card's unmount (it previously lived in
  // ContextReadyView, whose `return null` blanked the screen).
  const [viewingArtifacts, setViewingArtifacts] = useState(false);
  // Fix #3 — "Regenerate requirements" on the confirmed State D card, offered
  // when the last completed generation is stale (an approved artifact
  // reverted since it finished). The trigger call is the action itself: the
  // server runs it in reconcile mode (updates/removes/adds against the
  // existing generated rows) — no confirm dialog needed.
  const [regenerating, setRegenerating] = useState(false);

  // AC-29 — resolve the open file from the tree's full identity, not just the
  // server payload: the synthesized Idea band never appears in filesData.files,
  // so idea.md needs its own entry or the editor renders its empty branch.
  const selectedFile =
    filesData?.files.find((f) => f.filename === selected) ??
    (selected === IDEA_FILE && filesData?.idea.available ? IDEA_FILE_ENTRY : null);
  const dirty = !bodyLoading && selectedFile !== null && draft !== savedBody;
  // AC-30 (plan §9.5) — the editor's view/edit mode. Draft/Returned open on
  // the rendered read view; Edit switches to the textarea. Reset on every
  // open; Save exits back to the read view (where Send now lives).
  const [editing, setEditing] = useState(false);

  const openFile = useCallback(
    async (filename: string) => {
      setSelected(filename);
      setEditing(false); // AC-30 — every open lands on the read view.
      setBodyLoading(true);
      try {
        const data =
          filename === IDEA_FILE
            ? await fetchBaIdea(id ?? '')
            : await fetchBaFile(id ?? '', filename);
        setSavedBody(data.content);
        setDraft(data.content);
        // The review thread carries over from the last selection only for
        // files that can have one — in_review or returned (AC-24 widens it
        // past in_review so the BA sees SA feedback after a return).
        const status = filesData?.files.find((f) => f.filename === filename)?.status;
        if (status === 'in_review' || status === 'returned') {
          const c = await fetchBaComments(id ?? '', filename).catch(() => ({ comments: [] }));
          setComments(c.comments);
        } else {
          setComments([]);
        }
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
    // filesData is read for the status lookup — it is loaded before any file
    // can be opened (the tree renders from it), so it is never stale here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id, filesData],
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
      if (status === 'in_review' || status === 'returned') {
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
      setEditing(false); // AC-30 — a completed save returns to the read view.
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

  // AC-27 — approved → draft. Reverses the SA approval (confirmed first via
  // the dialog below); the BA can then edit and re-send. The State D gate
  // reacts through the server's contextChangedSinceConfirm warning — no new
  // gate logic here.
  const [pendingSetBack, setPendingSetBack] = useState(false);
  const docTriggerRef = useRef<HTMLDivElement>(null);
  const handleSetBack = useCallback(async () => {
    if (!selectedFile) return;
    setBusy(true);
    try {
      await transitionBaFile(id ?? '', selectedFile.filename, 'draft');
      await refreshAfterMutation(selectedFile.filename, 'draft');
      showNotice({
        kind: 'success',
        text: `Set back to Draft — ${selectedFile.filename} is open for editing again.`,
      });
    } catch (err) {
      showNotice({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Could not set the file back to Draft',
      });
    } finally {
      setBusy(false);
    }
  }, [id, refreshAfterMutation, selectedFile, showNotice]);

  // Bulk reopen — the confirmed State D card's "Send all back to Draft". One
  // atomic server-side UPDATE (reopen-all route) flips every Approved artifact
  // back to Draft; the workspace returns via contextReady flipping false, and
  // the server's contextChangedSinceConfirm warning appears. 409 (requirements
  // generation mid-run) surfaces as an error notice.
  const handleReopenAll = useCallback(async () => {
    setReopening(true);
    try {
      await reopenAllBaFiles(id ?? '');
      // Reopen only flips statuses — bodies on disk are untouched, so the
      // in-memory body stays accurate. loadFiles refreshes the tree and flips
      // contextReady back to false, which returns the workspace.
      await loadFiles();
      showNotice({
        kind: 'success',
        text: 'All approved artifacts are back in Draft — they are open for editing again.',
      });
    } catch (err) {
      showNotice({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Could not send the artifacts back to Draft',
      });
    } finally {
      setReopening(false);
    }
  }, [id, loadFiles, showNotice]);

  // Per-file reopen — the confirmed State D card's row-level "Send back to
  // Draft". Same route + transition the AC-27 editor button uses (approved →
  // draft); a single revert flips contextReady false and returns the
  // workspace with its review flow, leaving the other 16 approvals intact.
  const handleReopenFile = useCallback(
    async (filename: string) => {
      setReopeningFile(true);
      try {
        await transitionBaFile(id ?? '', filename, 'draft');
        // Status flip only — the body on disk is untouched, so the in-memory
        // body (if a file was open earlier) stays accurate.
        await loadFiles();
        showNotice({
          kind: 'success',
          text: `${filename} is back in Draft — send it for SA review and re-approve it.`,
        });
      } catch (err) {
        showNotice({
          kind: 'error',
          text: err instanceof Error ? err.message : 'Could not send the artifact back to Draft',
        });
      } finally {
        setReopeningFile(false);
      }
    },
    [id, loadFiles, showNotice],
  );

  // Ref registration for the 17 per-row reopen buttons (the dialog's focus
  // restore reads the map entry for the row that opened it).
  const registerReopenFileRef = useCallback(
    (filename: string) => (el: HTMLButtonElement | null) => {
      reopenFileTriggerRefs.current.set(filename, el);
    },
    [],
  );

  const openReopenFileDialog = useCallback((filename: string) => {
    reopenFileDialogTriggerRef.current = reopenFileTriggerRefs.current.get(filename) ?? null;
    setPendingReopenFile(filename);
  }, []);

  // Leaving the gate (revert/confirm/reload) must not park the user in the
  // artifacts view of a workspace that no longer qualifies for the card.
  useEffect(() => {
    if (!filesData?.contextReady) setViewingArtifacts(false);
  }, [filesData?.contextReady]);

  const handleConfirmContext = useCallback(async () => {
    setBusy(true);
    try {
      await confirmProjectContext(id ?? '');
      onContextConfirmed();
      // Trigger BA Agent to auto-generate stories + BR/TR from approved artifacts.
      // The confirm itself has already succeeded at this point — a failed
      // trigger (409 gate/already-generated, server down) must not read as a
      // failed confirm, so it gets its own catch.
      let alreadyRunning = false;
      let triggerError: string | null = null;
      try {
        const triggerResult = await triggerRequirementsGeneration(id ?? '');
        alreadyRunning = !!triggerResult.alreadyRunning;
      } catch (triggerErr) {
        triggerError = triggerErr instanceof Error ? triggerErr.message : 'Requirements generation could not start';
      }
      showNotice(
        triggerError
          ? {
              kind: 'error',
              text: `Project context confirmed — Sprint, Design, Build, QA unlocked. But requirements generation could not start: ${triggerError} Retry from the Requirements tab.`,
            }
          : {
              kind: 'success',
              text: alreadyRunning
                ? 'Project context confirmed — Sprint, Design, Build, QA unlocked. Requirements generation already in progress.'
                : 'Project context confirmed — Sprint, Design, Build, QA unlocked. BA Agent is auto-generating requirements.',
            },
      );
      await loadFiles();
    } catch (err) {
      showNotice({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Could not confirm the project context',
      });
    } finally {
      setBusy(false);
    }
  }, [id, loadFiles, onContextConfirmed, showNotice]);

  // Fix #3 — regenerate stale requirements in reconcile mode. Unlike the
  // confirm-then-trigger pair, the trigger call is the whole action: the
  // server's reconcile path updates/removes/adds against the existing
  // generated rows. A 409 (mid-run, or rows deleted since) surfaces as an
  // error notice per the baFetch convention — never a success-shaped payload.
  const handleRegenerateRequirements = useCallback(async () => {
    setRegenerating(true);
    try {
      const triggerResult = await triggerRequirementsGeneration(id ?? '');
      const running = !!triggerResult.alreadyRunning;
      showNotice({
        kind: 'success',
        text: running
          ? 'Requirements generation already in progress — the reconcile will resume when it finishes.'
          : 'Regenerating requirements — the BA Agent will reconcile against the previously generated stories and requirements.',
      });
      await loadFiles();
    } catch (err) {
      showNotice({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Could not regenerate requirements',
      });
    } finally {
      setRegenerating(false);
    }
  }, [id, loadFiles, showNotice]);

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

  // The tree's bands: the client-synthesized "Idea" band on top (AC-22) when
  // idea.md exists, then the 5 artifact bands from the server payload. The
  // idea row is readOnly — the tree omits its status dot and the count chip
  // stays on the 17.
  const bands = [
    ...(filesData?.idea.available
      ? [
          {
            key: 'idea',
            label: 'Idea',
            // AC-29 — one entry shared with selectedFile's fallback, so the
            // tree row and the editor describe the same file.
            files: [IDEA_FILE_ENTRY],
          },
        ]
      : []),
    ...(filesData?.bands ?? []).map((b) => ({
      key: b.key,
      label: b.label,
      files: filesData?.files.filter((f) => f.band === b.key) ?? [],
    })),
  ];
  // Band progress for the generation panel — done counts come from the files
  // already on disk; totals from the server's bands payload (one source).
  const genBands = (filesData?.bands ?? []).map((b) => ({
    label: b.label,
    done: filesData?.files.filter((f) => f.band === b.key).length ?? 0,
    total: b.total,
  }));

  // State D — the gate card replaces the workspace when every artifact is
  // approved. "← Back to artifacts" flips viewingArtifacts: the workspace
  // renders below (approved artifacts are read-only there — AC-30), and the
  // card comes back via the workspace's "← Project context ready" button.
  if (filesData?.contextReady && !viewingArtifacts) {
    const reopenFileTitle =
      filesData.files.find((f) => f.filename === pendingReopenFile)?.title ?? 'This artifact';
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
          onBackToArtifacts={() => setViewingArtifacts(true)}
          onReopenAll={() => setPendingReopenAll(true)}
          reopening={reopening}
          reopenAllTriggerRef={reopenAllTriggerRef}
          onReopenFile={openReopenFileDialog}
          reopeningFile={reopeningFile}
          registerReopenFileRef={registerReopenFileRef}
          requirementsStale={filesData.requirementsStale}
          onRegenerate={() => void handleRegenerateRequirements()}
          regenerating={regenerating}
        />
        {/* Bulk reopen — the confirmed State D card's "Send all back to Draft".
            Reverses all 17 approvals at once, so it confirms first (same
            severity as the AC-27 per-file dialog). */}
        <ConfirmDialog
          open={pendingReopenAll}
          title="Send all back to Draft?"
          description="Every approved artifact returns to Draft and is open for editing again. You will need to send each one for SA review and get it approved again before the project context can be re-confirmed."
          confirmLabel="Send all back to Draft"
          cancelLabel="Keep approved"
          triggerRef={reopenAllTriggerRef}
          onClose={() => setPendingReopenAll(false)}
          onConfirm={() => {
            setPendingReopenAll(false);
            void handleReopenAll();
          }}
        />
        {/* Per-file reopen — the confirmed card's row-level "Send back to
            Draft". Reverses one SA approval, so it confirms first (same
            severity as the bulk + AC-27 dialogs). */}
        <ConfirmDialog
          open={pendingReopenFile !== null}
          title="Send back to Draft?"
          description={`"${reopenFileTitle}" is Approved. Setting it back to Draft re-opens it for editing — you will need to send it for SA review and get it approved again before the project context can be re-confirmed.`}
          confirmLabel="Send back to Draft"
          cancelLabel="Keep approved"
          triggerRef={reopenFileDialogTriggerRef}
          busy={reopeningFile}
          onClose={() => setPendingReopenFile(null)}
          onConfirm={() => {
            const target = pendingReopenFile;
            setPendingReopenFile(null);
            if (target) void handleReopenFile(target);
          }}
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

      {/* State D card is one toggle away while every artifact is still
          approved — "← Back to artifacts" landed here via viewingArtifacts. */}
      {filesData?.contextReady && (
        <div className="state-d-return-row">
          <button type="button" className="btn btn-ghost" onClick={() => setViewingArtifacts(true)}>
            ← Project context ready
          </button>
        </div>
      )}

      {/* AC-21 (revised, §9.6 QA) — the LLM-written idea summary sits at the
          very top of the tab (above the stage counts): async + cached
          server-side, the card owns its own polling/retry. Reference aid
          only — never gate input. */}
      <IdeaSummaryCard projectId={id ?? ''} />

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
            <div className="ba-doc-col" ref={docTriggerRef}>
              <ArtifactEditor
                file={selectedFile}
                bodyLoading={bodyLoading}
                value={draft}
                dirty={dirty}
                saving={saving}
                editing={editing}
                commentCount={comments.length}
                onChange={setDraft}
                onDiscard={() => {
                  setDraft(savedBody);
                  setEditing(false);
                }}
                onEdit={() => setEditing(true)}
                onSave={() => void handleSave()}
                onSend={() => void handleSend()}
                onReturn={() => void handleTransition('returned')}
                onApprove={() => void handleTransition('approved')}
                onSetBack={() => setPendingSetBack(true)}
              />
              {/* AC-24 — the thread stays visible after a return, so the BA
                  can read the SA feedback and reply while reworking. */}
              {(selectedFile?.status === 'in_review' || selectedFile?.status === 'returned') && (
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

      {/* AC-27 — setting an approved artifact back to Draft reverses an SA
          approval, so it confirms first. */}
      <ConfirmDialog
        open={pendingSetBack}
        title="Set back to Draft?"
        description={`"${selectedFile?.title ?? 'This artifact'}" is Approved. Setting it back to Draft re-opens it for editing and un-approves it — you will need to send it for SA review and get it approved again.`}
        confirmLabel="Set back to Draft"
        cancelLabel="Keep approved"
        triggerRef={docTriggerRef}
        onClose={() => setPendingSetBack(false)}
        onConfirm={() => {
          setPendingSetBack(false);
          void handleSetBack();
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

