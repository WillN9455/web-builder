import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  fetchResume,
  ResumeUnavailableError,
  type ChatDoneEvent,
  type ChatMessage,
} from '../lib/api';
import type { InterviewStep } from './new-idea/InterviewProgress';
import { FolderPickStep } from './new-idea/FolderPickStep';
import { ChatStep } from './new-idea/ChatStep';
import { CapturedStep } from './new-idea/CapturedStep';

type Step = 'folder' | 'chat' | 'done' | 'loading' | 'resume-error';

// Build the 9-step checklist that ChatStep renders in its right rail. Mirrors
// the literal in ChatStep.buildSteps() — kept duplicated so the parent can
// pre-compute initial state for resume without coupling the two components
// to a shared mutable module.
function buildInitialSteps(): InterviewStep[] {
  return [
    { label: 'Project folder set', detail: 'Workspace pinned.', state: 'done' },
    { label: 'Problem', detail: 'Describe the pain point.', state: 'current' },
    { label: 'Users & scale', detail: 'Who feels this most?', state: 'pending' },
    { label: 'MVP scope', detail: 'Smallest shippable version.', state: 'pending' },
    { label: 'Business rules', detail: 'Permissions, automations.', state: 'pending' },
    { label: 'Compliance', detail: 'GDPR / PCI / HIPAA / none.', state: 'pending' },
    { label: 'Brand & design', detail: 'Style, references.', state: 'pending' },
    { label: 'Tech stack', detail: 'Optional — we can recommend.', state: 'pending' },
    { label: 'Timeline & constraints', detail: 'Launch, budget, risks.', state: 'pending' },
  ];
}

// Same skip-marker the chat step rewrites user input to before posting to
// /api/chat. Used here to recognise skipped topics in a resumed transcript.
const SKIP_MARKER = 'Skip — please fill this in yourself.';

// Owns the 3-step intake flow (folder pick → BA chat → captured).
// Step transitions are driven by user actions; the chat step is the only one
// that holds a long-running stream.
//
// Resume mode: when the URL carries ?resume=<slug>, NewIdeaScreen calls
// /api/projects/:id/resume on mount, skips the folder step, and seeds the
// chat step with the persisted transcript + topic-progress state.
export function NewIdeaScreen() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const resumeSlug = searchParams.get('resume');

  const [step, setStep] = useState<Step>('folder');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [projectDir, setProjectDir] = useState<string | null>(null);
  const [doneEvent, setDoneEvent] = useState<ChatDoneEvent | null>(null);
  // Resume-mode seed data — non-null only when entering via ?resume=<slug>.
  const [initialMessages, setInitialMessages] = useState<ChatMessage[] | null>(null);
  const [initialSteps, setInitialSteps] = useState<InterviewStep[] | null>(null);
  const [initialStepIndex, setInitialStepIndex] = useState<number | null>(null);
  const [resumeError, setResumeError] = useState<string | null>(null);

  // Folder pick → chat. `name` is forwarded to /api/init but lives on the
  // server side from there — we don't need to keep a copy in client state.
  const handleInit = useCallback((sess: string, dir: string, _name: string | null) => {
    setSessionId(sess);
    setProjectDir(dir);
    setStep('chat');
  }, []);

  // "← Change folder" link inside the chat step
  const handleChangeFolder = useCallback(() => {
    setStep('folder');
    // Keep sessionId/projectDir around in case the user wants to re-enter
    // with the same folder; they're harmless until /api/chat is called again.
  }, []);

  // "← All projects" link from the chat step — always jumps to /projects,
  // not just one step back. (The chat step's footer Cancel link used to go
  // back to the folder pick, which felt like a dead-end; users expected it
  // to take them out of the intake flow entirely.)
  const handleLeaveToProjects = useCallback(() => navigate('/projects'), [navigate]);

  // Chat step streamed a final reply — show captured card
  const handleCaptured = useCallback((evt: ChatDoneEvent) => {
    setDoneEvent(evt);
    setStep('done');
  }, []);

  // "← All projects" from the captured step
  const handleBackToProjects = useCallback(() => navigate('/projects'), [navigate]);

  // "Open project →" from the captured step
  const handleOpenProject = useCallback(
    (slug: string | undefined) => {
      navigate(slug ? `/projects/${slug}` : '/projects');
    },
    [navigate],
  );

  // Used by both folder pick and chat step's Cancel/back actions.
  const handleCancel = useCallback(() => {
    if (step === 'folder') navigate('/projects');
    else setStep('folder');
  }, [navigate, step]);

  // Resume flow — runs once on mount if ?resume=<slug> is present.
  useEffect(() => {
    if (!resumeSlug) return;
    let cancelled = false;
    setStep('loading');
    setResumeError(null);
    (async () => {
      try {
        const data = await fetchResume(resumeSlug);
        if (cancelled) return;
        // Rebuild the step list locally so InterviewProgress shows the same
        // state the chat step would have built during a live session.
        //
        // The server's `topicProgress.currentTopic` is the authoritative
        // cursor — it's the deepest ::topic=N:: marker the BA has emitted
        // in the persisted transcript. When that marker is missing (older
        // transcripts from before the marker was added, or the BA simply
        // hasn't transitioned yet), fall back to counting user→assistant
        // pairs so the sidebar still lands at a sensible step.
        const base = buildInitialSteps();
        const serverCursor = data.topicProgress.currentTopic;
        let resolved = 0;
        let skipped = 0;
        for (let i = 0; i < data.messages.length - 1; i++) {
          const m = data.messages[i];
          const next = data.messages[i + 1];
          if (m.role !== 'user' || next.role !== 'assistant') continue;
          if (m.content.startsWith(SKIP_MARKER)) skipped++;
          else resolved++;
        }
        // Map the server's 1-based topic index onto our step list (index 0
        // is the fixed "Project folder set" step). Cap at base.length - 1
        // so a 9th topic the BA prompt might add later doesn't overshoot.
        const fallbackCursor = Math.min(1 + resolved + skipped, base.length - 1);
        const target = serverCursor !== null && serverCursor !== undefined
          ? Math.min(serverCursor, base.length - 1)
          : fallbackCursor;
        for (let i = 1; i < base.length; i++) {
          if (i < target) {
            base[i] = { ...base[i], state: 'done', detail: 'Captured.' };
          } else if (i === target) {
            base[i] = { ...base[i], state: 'current' };
          } else {
            base[i] = { ...base[i], state: 'pending' };
          }
        }
        const cursor = target;

        setSessionId(data.sessionId);
        setProjectDir(data.project.folder_path);
        setInitialMessages(data.messages);
        setInitialSteps(base);
        setInitialStepIndex(cursor);
        setStep('chat');
      } catch (err) {
        if (cancelled) return;
        // 409 (project is no longer in Intake / idea already captured) and
        // 410 (no transcript) both mean "the chat isn't resumable" — send
        // the user to the project detail page instead of trapping them on
        // /new. Any other failure shows a soft error and a way back.
        if (err instanceof ResumeUnavailableError && (err.status === 409 || err.status === 410)) {
          navigate(`/projects/${resumeSlug}`, { replace: true });
          return;
        }
        setResumeError(err instanceof Error ? err.message : 'Could not resume interview');
        setStep('resume-error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [resumeSlug, navigate]);

  if (step === 'loading') {
    return (
      <main className="main" style={{ padding: 0 }} aria-busy>
        <div className="center-stage" style={{ minHeight: 360 }}>
          <div className="center-card" style={{ textAlign: 'center' }}>
            <div className="crumbs">Resuming interview</div>
            <h1>Loading your conversation…</h1>
            <p className="sub" style={{ textAlign: 'center' }}>
              Reading the saved transcript from disk.
            </p>
          </div>
        </div>
      </main>
    );
  }

  if (step === 'resume-error') {
    return (
      <main className="main" style={{ padding: 0 }}>
        <div className="center-stage" style={{ minHeight: 360 }}>
          <div className="center-card" style={{ textAlign: 'center' }}>
            <div className="crumbs">Couldn't resume</div>
            <h1>Resume failed</h1>
            <p className="sub" style={{ textAlign: 'center' }}>
              {resumeError ?? 'Unknown error'}
            </p>
            <div className="actions-row" style={{ justifyContent: 'center' }}>
              <button type="button" className="btn btn-primary" onClick={() => navigate('/projects')}>
                ← All projects
              </button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="main" style={{ padding: 0 }} aria-busy={step === 'chat'}>
      {step === 'folder' && (
        <FolderPickStep onInit={handleInit} onCancel={handleCancel} />
      )}
      {step === 'chat' && sessionId && projectDir && (
        <ChatStep
          sessionId={sessionId}
          projectDir={projectDir}
          onChangeFolder={handleChangeFolder}
          onCaptured={handleCaptured}
          onCancel={handleLeaveToProjects}
          onOpenProject={handleOpenProject}
          initialMessages={initialMessages ?? undefined}
          initialSteps={initialSteps ?? undefined}
          initialCurrentStepIndex={initialStepIndex ?? undefined}
        />
      )}
      {step === 'done' && doneEvent && (
        <CapturedStep
          doneEvent={doneEvent}
          projectDir={projectDir}
          onOpenProject={handleOpenProject}
          onBack={handleBackToProjects}
        />
      )}
    </main>
  );
}

// Re-export so other modules can pull ChatMessage alongside.
export type { ChatMessage };
