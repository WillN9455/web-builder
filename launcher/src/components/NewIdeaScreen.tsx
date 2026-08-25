import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ChatDoneEvent, ChatMessage } from '../lib/api';
import { FolderPickStep } from './new-idea/FolderPickStep';
import { ChatStep } from './new-idea/ChatStep';
import { CapturedStep } from './new-idea/CapturedStep';

type Step = 'folder' | 'chat' | 'done';

// Owns the 3-step intake flow (folder pick → BA chat → captured).
// Step transitions are driven by user actions; the chat step is the only one
// that holds a long-running stream.
export function NewIdeaScreen() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('folder');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [projectDir, setProjectDir] = useState<string | null>(null);
  const [doneEvent, setDoneEvent] = useState<ChatDoneEvent | null>(null);

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
