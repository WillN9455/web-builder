// Sprint tab (screens 6 + 6b, design/sprint.html) — the master story board.
//
// Dispatcher + assembly:
//  - Top-level state: connected (#s6) vs. not connected (#s6b). A 404 from the
//    jira/link read is a screen state, not an error — the dispatcher branches
//    on JiraLinkNotFoundError and renders the Connect Jira setup form.
//  - Connected: sync banner (info / stale / failed, role="status"), Edit-Jira
//    panel (#jira-config-panel, configOpen), the Build-board card (header +
//    Board/Backlog toggle + kanban), the code-agent status strip, story
//    generation (slice 4), and the "Open in Jira" promo.
//  - The board polls GET /board every 30s — Jira is the source of truth; the
//    local cards keep the board fast (decision 1). Moves + adds go through
//    PATCH/POST /board/:id with optimistic local state and snap-back on error.
//  - Slice 4 (decision 5): "Generate user stories" triggers BA Run-2 story
//    generation against the requirements model; each generated story becomes a
//    Jira issue (locally keyed) and a To-do card.
//
// Gate: Sprint is a gated tab (ProjectSidebar PROJECT_TABS) — until the
// project context is confirmed, deep links bounce to Overview like the other
// gated tabs.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import {
  addBoardCard,
  deleteJiraLink,
  fetchBoard,
  fetchJiraLink,
  fetchStoryGenStatus,
  testJiraLink,
  triggerStoryGeneration,
  updateBoardCard,
  JiraLinkNotFoundError,
  type BoardCard,
  type BoardCardInput,
  type BoardResponse,
  type JiraLink,
  type StoryGenStatus,
} from '../../lib/api';
import type { ProjectOutletContext } from '../ProjectDetailScreen';
import { ConfirmDialog } from '../ConfirmDialog';
import { SprintBoard, COLUMNS, CODE_AGENTS, type BoardColumn } from './SprintBoard';
import { ConnectJiraForm, JiraConfigPanel, linkAgeMs } from './JiraConfig';

type Notice = { kind: 'success' | 'error'; text: string };
type LinkState = 'loading' | 'ok' | 'not-connected' | 'error';
type BoardLoad = 'loading' | 'ok' | 'error';

// The design's 7-stage stepper (design/sprint.html #s6) mapped onto the
// project table's 8-stage field. PRD sits inside the Requirements span (the
// design has no separate PRD step); Review/QA render the butter review state,
// Shipped the navy star (see _sprint.scss .stepper).
const STEP_LABELS = ['Intake', 'Requirements', 'Design', 'Build', 'Review', 'QA', 'Deployed'];
const STAGE_TO_STEP: Record<string, number> = {
  Intake: 1,
  Requirements: 2,
  PRD: 2,
  Design: 3,
  Build: 4,
  Review: 5,
  QA: 6,
  Shipped: 7,
};

// Whole hours since a server naive-UTC stamp (same parsing convention as
// server/jira-link.ts formatRelative) — drives the agent strip's elapsed time.
function hoursElapsed(ts: string): number {
  const ms = Date.parse(ts.replace(' ', 'T') + 'Z');
  if (Number.isNaN(ms)) return 0;
  return Math.max(0, Math.floor((Date.now() - ms) / 3_600_000));
}

const GEAR_ICON =
  // Copy of the board-card cog glyph (design/sprint.html).
  <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />;

export function SprintScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const idOrSlug = id ?? '';
  const { project } = useOutletContext<ProjectOutletContext>();

  const [linkState, setLinkState] = useState<LinkState>('loading');
  const [link, setLink] = useState<JiraLink | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);

  const [board, setBoard] = useState<BoardResponse | null>(null);
  const [boardLoad, setBoardLoad] = useState<BoardLoad>('loading');
  const [boardError, setBoardError] = useState<string | null>(null);

  const [notice, setNotice] = useState<Notice | null>(null);
  const noticeTimer = useRef<number | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<BoardCard['priority'] | null>(null);
  const [view, setView] = useState<'board' | 'backlog'>('board');
  const [configOpen, setConfigOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const cogRef = useRef<HTMLButtonElement>(null);

  // Slice 4 — story generation state.
  const [genStatus, setGenStatus] = useState<StoryGenStatus | null>(null);
  const [genError, setGenError] = useState<string | null>(null);
  const [genElapsed, setGenElapsed] = useState(0);

  const showNotice = useCallback((n: Notice) => {
    setNotice(n);
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 4000);
  }, []);

  // ── Jira link ─────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setLinkState('loading');
    setLink(null);
    setBoard(null);
    setBoardLoad('loading');
    (async () => {
      try {
        const { link: resolved } = await fetchJiraLink(idOrSlug);
        if (!cancelled) {
          setLink(resolved);
          setLinkState('ok');
        }
      } catch (err) {
        if (cancelled) return;
        if (err instanceof JiraLinkNotFoundError) {
          setLinkState('not-connected');
        } else {
          setLinkError(err instanceof Error ? err.message : 'Could not load the Jira connection.');
          setLinkState('error');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [idOrSlug]);

  const loadBoard = useCallback(async () => {
    const res = await fetchBoard(idOrSlug);
    setBoard(res);
    setBoardLoad('ok');
    return res;
  }, [idOrSlug]);

  // ── Board fetch + ~30s poll while connected (decision 1: Jira is the
  //    source of truth via polling; local cards keep the board fast). ───────
  useEffect(() => {
    if (linkState !== 'ok') return;
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetchBoard(idOrSlug);
        if (!cancelled) {
          setBoard(res);
          setBoardLoad('ok');
        }
      } catch (err) {
        if (!cancelled) {
          setBoardError(err instanceof Error ? err.message : 'Could not load the board.');
          setBoardLoad('error');
        }
      }
    };
    void poll();
    const t = window.setInterval(poll, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [idOrSlug, linkState]);

  // ── Slice 4 — story-generation polling + elapsed clock ──────────────────
  useEffect(() => {
    if (genStatus?.status !== 'generating') return;
    let cancelled = false;
    const tick = async () => {
      try {
        const s = await fetchStoryGenStatus(idOrSlug);
        if (!cancelled) setGenStatus(s);
      } catch {
        /* read failures keep the last known state — the poll retries */
      }
    };
    void tick();
    const t = window.setInterval(tick, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [idOrSlug, genStatus?.status]);

  useEffect(() => {
    if (genStatus?.status !== 'generating') return;
    const startedAt = genStatus.sectionStartedAt ?? Date.now();
    const t = window.setInterval(() => setGenElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => window.clearInterval(t);
  }, [genStatus]);

  // Slice 4 — when a generation run finishes, refetch the board so the new
  // To-do cards appear immediately (a generated story's AC: "the new issue
  // appears on the board immediately after creation"). The 30s board poll
  // remains the backstop.
  useEffect(() => {
    if (genStatus?.status !== 'done') return;
    void loadBoard().catch(() => setBoardLoad('error'));
  }, [genStatus?.status, loadBoard]);

  const cards = useMemo(() => board?.cards ?? [], [board]);
  const counts = board?.counts ?? { todo: 0, inprogress: 0, inreview: 0, done: 0 };
  const totalCards = cards.length;
  const doneCount = counts.done;

  // Client-side search + priority filter (topbar Filter button cycles).
  const visibleCards = useMemo(() => {
    const q = query.trim().toLowerCase();
    return cards.filter(
      (c) =>
        (!filter || c.priority === filter) &&
        (!q || c.title.toLowerCase().includes(q) || c.ticketKey.toLowerCase().includes(q)),
    );
  }, [cards, filter, query]);

  // Board card moves: optimistic flip with snap-back on error (code-quality
  // race discipline — the write is scoped server-side by project_id).
  const moveCard = useCallback(
    async (card: BoardCard, column: BoardColumn) => {
      const prev = board;
      setBoard((b) =>
        b
          ? {
              ...b,
              cards: b.cards.map((c) => (c.id === card.id ? { ...c, column } : c)),
            }
          : b,
      );
      try {
        const { card: updated } = await updateBoardCard(idOrSlug, card.id, { column });
        setBoard((b) =>
          b
            ? {
                ...b,
                cards: b.cards.map((c) => (c.id === updated.id ? updated : c)),
              }
            : b,
        );
      } catch (err) {
        if (prev) setBoard(prev); // snap back
        showNotice({ kind: 'error', text: err instanceof Error ? err.message : 'Could not move the ticket.' });
        throw err;
      }
    },
    [board, idOrSlug, showNotice],
  );

  const addCard = useCallback(
    async (input: BoardCardInput) => {
      try {
        const { card } = await addBoardCard(idOrSlug, input);
        setBoard((b) =>
          b ? { ...b, cards: [card, ...b.cards], counts: { ...b.counts, todo: b.counts.todo + 1 } } : b,
        );
        showNotice({ kind: 'success', text: `${card.ticketKey} added to To do.` });
      } catch (err) {
        showNotice({ kind: 'error', text: err instanceof Error ? err.message : 'Could not add the issue.' });
        throw err;
      }
    },
    [idOrSlug, showNotice],
  );

  const retrySync = useCallback(async () => {
    try {
      const result = await testJiraLink(idOrSlug);
      await loadBoard();
      showNotice({
        kind: 'success',
        // DR2 #4 — the server can't verify yet; don't claim it can.
        text: result.verified
          ? 'Connection tested — the board is up to date.'
          : 'Verification pending — Jira access will be probed when the connector lands (secrets design).',
      });
    } catch (err) {
      showNotice({ kind: 'error', text: err instanceof Error ? err.message : 'Sync retry failed.' });
    }
  }, [idOrSlug, loadBoard, showNotice]);

  const closeConfig = useCallback(() => {
    setConfigOpen(false);
    window.setTimeout(() => cogRef.current?.focus(), 0); // AC-5 focus return
  }, []);

  const confirmDisconnect = useCallback(async () => {
    setDisconnecting(true);
    try {
      await deleteJiraLink(idOrSlug);
      setDisconnectOpen(false);
      setLink(null);
      setLinkState('not-connected');
      setBoard(null);
      setConfigOpen(false);
      showNotice({ kind: 'success', text: 'Jira disconnected. Tickets stay in Jira; this board returns to setup.' });
    } catch (err) {
      showNotice({ kind: 'error', text: err instanceof Error ? err.message : 'Could not disconnect Jira.' });
    } finally {
      setDisconnecting(false);
    }
  }, [idOrSlug, showNotice]);

  const startStoryGen = useCallback(async () => {
    setGenError(null);
    setGenElapsed(0);
    try {
      await triggerStoryGeneration(idOrSlug);
      setGenStatus((s) => (s ? { ...s, status: 'generating' } : { status: 'generating', progress: { generated: 0, total: 0 } }));
    } catch (err) {
      setGenError(err instanceof Error ? err.message : 'Could not start story generation.');
    }
  }, [idOrSlug]);

  // The linked Jira project key's numeric range for the header's ticket label.
  const ticketRange = useMemo(() => {
    const keys = cards.map((c) => c.ticketKey);
    const nums = keys
      .map((k) => Number(k.split('-').pop()))
      .filter((n) => Number.isInteger(n));
    if (nums.length === 0) return '';
    const min = Math.min(...nums);
    const max = Math.max(...nums);
    return min === max ? `#${min}` : `#${min}–#${max}`;
  }, [cards]);

  const stale = link ? linkAgeMs(link) > 120_000 : false;
  const pendingLink = link?.syncStatus === 'pending';
  const bannerVariant =
    link?.syncStatus === 'failed' || link?.syncStatus === 'offline'
      ? 'failed'
      : pendingLink
        ? 'pending'
        : stale
          ? 'stale'
          : 'info';

  // Render-time guard on the "Open in Jira" href (defense in depth for rows
  // saved before the server's http(s)+host/no-userinfo allowlist landed — DR2
  // #1). Returns null when the stored base URL must not become an href.
  const jiraBrowseUrl = useMemo(() => {
    if (!link?.jiraBaseUrl) return null;
    let parsed: URL;
    try {
      parsed = new URL(link.jiraBaseUrl);
    } catch {
      return null;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    if (!parsed.host || parsed.username || parsed.password) return null;
    return `${parsed.origin}/browse/${encodeURIComponent(link.jiraProjectKey)}`;
  }, [link]);

  // ── Gate: Sprint is gated on project context confirmation. All hooks run
  //    above; the redirect renders below them (never an early return mid-hook).
  if (project && !project.context_confirmed) {
    return <Navigate to={`/projects/${idOrSlug}/overview`} replace />;
  }

  // ── Loading / error shells before the branch ─────────────────────────────
  if (linkState === 'loading') {
    return (
      <div className="sprint-screen">
        <div className="center-stage" style={{ minHeight: 400 }}>
          <div className="center-card" style={{ textAlign: 'center' }}>
            <div className="crumbs">Sprint</div>
            <h1>Loading…</h1>
          </div>
        </div>
      </div>
    );
  }

  if (linkState === 'error') {
    return (
      <div className="sprint-screen">
        <div className="center-stage" style={{ minHeight: 400 }}>
          <div className="center-card" style={{ textAlign: 'center' }}>
            <div className="crumbs">Sprint</div>
            <h1>Could not load the Jira connection</h1>
            <p className="sub" style={{ textAlign: 'center' }}>{linkError}</p>
            <div className="actions-row" style={{ justifyContent: 'center' }}>
              <button type="button" className="btn btn-primary" onClick={() => navigate(0)}>
                Retry
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const isConnected = linkState === 'ok' && link !== null;

  // ── Shared chrome: topbar + project header + stepper (both screens) ───────
  const topbar = isConnected ? (
    <div className="topbar">
      <Link to="/projects" style={{ fontSize: 13, color: 'var(--ink-2)', textDecoration: 'none' }}>
        ← Projects
      </Link>
      <div className="search">
        <input
          placeholder="Search tasks, tickets, agents…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search tasks, tickets and agents"
        />
      </div>
      <button
        type="button"
        className="btn btn-soft btn-pill"
        aria-pressed={filter !== null}
        onClick={() =>
          setFilter((f) => (f === null ? 'high' : f === 'high' ? 'med' : f === 'med' ? 'low' : null))
        }
      >
        {filter === null ? 'Filter' : `Filter: ${filter === 'high' ? 'High' : filter === 'med' ? 'Med' : 'Low'} ✓`}
      </button>
      <button type="button" className="btn btn-soft btn-pill">
        Sprint
      </button>
      <button type="button" className="btn btn-primary btn-pill" onClick={() => setAddOpen(true)}>
        + Add issue
      </button>
    </div>
  ) : (
    <div className="topbar">
      <Link to="/projects" style={{ fontSize: 13, color: 'var(--ink-2)', textDecoration: 'none' }}>
        ← Projects
      </Link>
      <div className="search" style={{ opacity: 0.6 }}>
        <input placeholder="Search this project…" aria-label="Search this project" value="" readOnly tabIndex={-1} />
      </div>
      <button
        type="button"
        className="btn btn-soft btn-pill"
        onClick={() => document.getElementById('connect-jira-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
      >
        Help
      </button>
      <button
        type="button"
        className="btn btn-primary btn-pill"
        onClick={() => document.getElementById('connect-jira-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
      >
        Connect Jira →
      </button>
    </div>
  );

  const activeStep = STAGE_TO_STEP[project?.current_stage ?? ''] ?? 1;
  const currentStage = project?.current_stage ?? '';
  const stepClassFor = (step: number) => {
    if (step < activeStep) return 'step done';
    if (step === activeStep) {
      const kind = currentStage === 'Review' || currentStage === 'QA' ? ' review' : currentStage === 'Shipped' ? ' shipped' : '';
      return `step active${kind}`;
    }
    return 'step';
  };

  return (
    <div className="sprint-screen">
      {topbar}

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

      {/* Project header card */}
      <div className="card">
        <div className="proj-head">
          <div className={`ico-lg tile-${project?.tile_color ?? 'peach'}`} aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2b2547" strokeWidth={1.8}>
              <path d="M3 12l9-9 9 9 M5 10v10h14V10" />
            </svg>
          </div>
          <div>
            <h1>{project?.name ?? idOrSlug}</h1>
            <div className="one">{project?.one_liner}</div>
            <div className="path">
              {project?.folder_path} · {currentStage} stage
              {isConnected ? ' · Jira connected' : ' · no Jira link yet'}
            </div>
          </div>
          <div className="actions">
            {isConnected ? (
              <>
                <span className="pill inprog">
                  <span className="dot" aria-hidden="true" />
                  {currentStage}
                </span>
                <span className="stage-pt">
                  {totalCards} Jira ticket{totalCards === 1 ? '' : 's'}
                  {ticketRange ? ` · ${ticketRange}` : ''}
                </span>
              </>
            ) : (
              <>
                <span className="pill blocked">
                  <span className="dot" aria-hidden="true" />
                  Sprint · Blocked
                </span>
                <span className="stage-pt">0 Jira tickets · setup required</span>
              </>
            )}
          </div>
        </div>

        {/* 7-stage stepper — active step derived from current_stage */}
        <div className="stepper" style={{ marginTop: 18 }}>
          {STEP_LABELS.map((label, i) => (
            <div className={stepClassFor(i + 1)} key={label}>
              <div className="num">
                <b>{i + 1}</b>
              </div>
              <div className="lbl">{label}</div>
              {i < STEP_LABELS.length - 1 && <div className="bar" />}
            </div>
          ))}
        </div>
      </div>

      {/* ── Screen 6b — connect flow ─────────────────────────────────────────── */}
      {!isConnected && (
        <>
          <div className="jira-gate" role="status">
            <div className="ico" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                <circle cx="12" cy="12" r="9" />
                <path d="M12 8v4 M12 16h.01" />
              </svg>
            </div>
            <div>
              <b>Sprint is the master story board</b> — every Requirements item, Design pickup, Build
              task, and QA run is reflected here as a Jira ticket. Until a Jira project is linked,
              the board can&rsquo;t render.
              <span className="sub">
                Link a Jira project to start creating tickets from your approved requirements. Status
                changes in Jira sync back here within 30s.
              </span>
            </div>
            <div className="right">
              <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>Board is blocked</span>
            </div>
          </div>

          <ConnectJiraForm
            idOrSlug={idOrSlug}
            onConnected={(resolved) => {
              setLink(resolved);
              setLinkState('ok');
              void loadBoard().catch(() => setBoardLoad('error'));
              showNotice({ kind: 'success', text: `Connected to the ${resolved.jiraProjectKey} project.` });
            }}
          />

          <div className="card" style={{ padding: '20px 22px' }}>
            <h3 style={{ margin: '0 0 10px' }}>After you connect</h3>
            <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.7 }}>
              <li>Generated user stories become Jira tickets in <i>To do</i> — one issue per story, keyed and tracked locally.</li>
              <li>Design Agents pick up stories from <i>To do</i> and move them through their stages with peer review.</li>
              <li>Code Agents 1, 2, 3 pick up &ldquo;Ready for development&rdquo; stories in parallel. The Sprint board becomes the master status view across all stages.</li>
              <li>Status changes in Jira (comments, reassigns, transitions) sync back here within 30s. Manual moves are mirrored automatically.</li>
            </ol>
          </div>

          {/* FR-7 side-promo (6b) */}
          <div className="card" style={{ padding: '20px 22px' }}>
            <h3 style={{ margin: 0 }}>Jira not connected</h3>
            <p style={{ margin: '6px 0 12px', fontSize: 13, color: 'var(--ink-2)' }}>
              No board to open yet — link a Jira project to render the Kanban.
            </p>
            <button
              type="button"
              className="btn btn-primary btn-pill"
              onClick={() => document.getElementById('connect-jira-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            >
              Connect Jira →
            </button>
          </div>
        </>
      )}

      {/* ── Screen 6 — connected board ──────────────────────────────────────── */}
      {isConnected && link && (
        <>
          {/* FR-2 sync banner — variant follows live sync state */}
          <div className={`banner banner-${bannerVariant}`} role="status">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
              <circle cx="12" cy="12" r="9" />
              <path d="M12 8v4 M12 16h.01" />
            </svg>
            {bannerVariant === 'failed' ? (
              <div>
                <b>Jira sync failed.</b>{' '}
                {link.syncError ?? 'The connection is down — the board shows its last-known state.'}
              </div>
            ) : bannerVariant === 'pending' ? (
              <div>
                {/* DR2 #4 — no real probe has run, so no claim that sync is
                    live; the connector + verification land with decisions 1/5. */}
                <b>Jira connection saved — verification pending.</b> Atlassian access hasn&rsquo;t
                been probed yet; the board shows its locally-created tickets for now. A real
                connectivity check (401/403/429) lands with the secrets design.
              </div>
            ) : bannerVariant === 'stale' ? (
              <div>
                {/* lastSyncedRelative already ends in "ago" (formatRelative) — no second "ago". */}
                Last sync <b>{link.lastSyncedRelative} — retrying.</b>
              </div>
            ) : (
              <div>
                {link.syncDirection === 'two_way' ? (
                  <>
                    <b>Two-way Jira sync is on.</b> Tickets created here appear in the{' '}
                    <code>{link.jiraProjectKey}</code> Jira project. Status changes in Jira update this
                    board within 30s.
                  </>
                ) : link.syncDirection === 'launcher_to_jira' ? (
                  <>
                    <b>One-way sync (Launcher → Jira) is on.</b> Tickets created here appear in the{' '}
                    <code>{link.jiraProjectKey}</code> Jira project; status changes in Jira aren&rsquo;t
                    written back to this board.
                  </>
                ) : (
                  <>
                    <b>One-way sync (Jira → Launcher) is on.</b> Status changes in Jira update this
                    board within 30s; moves here aren&rsquo;t written to Jira.
                  </>
                )}
              </div>
            )}
            <button type="button" className="btn btn-ghost" onClick={() => void retrySync()}>
              {bannerVariant === 'failed' ? 'Retry sync' : 'Retry'}
            </button>
          </div>

          {/* Edit-Jira panel — toggled by the board card cog, stack below the
              banner so the board stays in context while editing (FR-6) */}
          {configOpen && (
            <JiraConfigPanel
              idOrSlug={idOrSlug}
              link={link}
              onClose={closeConfig}
              onSaved={(updated) => setLink(updated)}
              onDisconnect={() => setDisconnectOpen(true)}
            />
          )}

          {/* Slice 4 — story generation card */}
          <div className="card">
            <h3>User stories</h3>
            {genStatus?.status === 'generating' ? (
              <div role="status" aria-live="polite">
                <p style={{ margin: 0, fontSize: 13.5, color: 'var(--ink)' }}>
                  <b>{genStatus.currentSection ?? 'Drafting user stories'}…</b>
                </p>
                <p className="agent-sub" style={{ marginTop: 4 }}>
                  {genStatus.progress.generated} of {genStatus.progress.total || '…'} stories written ·{' '}
                  {Math.floor(genElapsed / 60)}:{String(genElapsed % 60).padStart(2, '0')} elapsed
                </p>
                <p className="help" style={{ marginTop: 6 }}>
                  This runs in the background — you can leave and come back. Each generated story
                  becomes a Jira issue in <i>To do</i>.
                </p>
              </div>
            ) : genStatus?.status === 'done' ? (
              <div role="status" aria-live="polite">
                <p style={{ margin: 0, fontSize: 13.5, color: 'var(--ink)' }}>
                  <b>
                    {genStatus.result?.storiesGenerated ?? 0} user stories generated ·{' '}
                    {genStatus.result?.issuesCreated ?? 0} Jira issues created in <i>To do</i>.
                  </b>
                </p>
                <p className="help" style={{ marginTop: 6 }}>
                  Regenerate to re-draft — existing generated stories are overwritten in place.
                </p>
              </div>
            ) : genStatus?.status === 'failed' ? (
              <div>
                <div className="error-banner" role="alert">
                  {genStatus.error ?? 'Story generation failed.'}
                </div>
                <div className="setup-actions" style={{ marginTop: 10 }}>
                  <button type="button" className="btn btn-soft" onClick={() => void startStoryGen()}>
                    Retry
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <p className="help" style={{ marginBottom: 12 }}>
                  Draft user stories — each with its own <b>Acceptance Criteria</b> — from the
                  approved requirements, then auto-create a Jira issue per story in <i>To do</i>.
                </p>
                <div className="setup-actions">
                  <button type="button" className="btn btn-primary btn-pill" onClick={() => void startStoryGen()}>
                    Generate user stories
                  </button>
                  {genError && (
                    <span role="alert" className="field-error" style={{ marginLeft: 10 }}>
                      {genError}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Build board card — the cog lives here, not in the topbar (AC-1) */}
          <div className="card" style={{ padding: '22px 22px 26px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <h3 style={{ margin: 0 }}>Build board</h3>
                <span className="stage-pt">
                  {totalCards === 0 ? '0 tickets' : `${doneCount} of ${totalCards} done`}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <button
                  ref={cogRef}
                  className="icon-btn"
                  type="button"
                  aria-label="Board settings — edit Jira connection for this board"
                  aria-pressed={configOpen}
                  aria-controls="jira-config-panel"
                  title="Board settings — Jira connection"
                  onClick={() => (configOpen ? closeConfig() : setConfigOpen(true))}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                    {GEAR_ICON}
                  </svg>
                </button>
                <button
                  type="button"
                  className={`btn btn-soft btn-pill${view === 'board' ? ' btn-primary' : ''}`}
                  aria-pressed={view === 'board'}
                  onClick={() => setView('board')}
                >
                  Board
                </button>
                <button
                  type="button"
                  className={`btn btn-soft btn-pill${view === 'backlog' ? ' btn-primary' : ''}`}
                  aria-pressed={view === 'backlog'}
                  onClick={() => setView('backlog')}
                >
                  Backlog
                </button>
              </div>
            </div>

            {boardLoad === 'error' ? (
              <div className="error-banner" role="alert">
                {boardError} — reload the board to retry.
                <button type="button" className="btn btn-ghost" style={{ marginLeft: 8 }} onClick={() => void loadBoard()}>
                  Reload
                </button>
              </div>
            ) : boardLoad === 'loading' && board === null ? (
              // Loading skeleton (§5): 4 column shells with placeholder cards.
              <div className="kanban" aria-busy="true">
                {COLUMNS.map((col) => (
                  <div className="kcol" key={col.key}>
                    <div className="khead">
                      <span className="dot" style={{ background: col.dot }} />
                      {col.label}
                      <span className="kcount">—</span>
                    </div>
                    <div className="skeleton" style={{ height: 76 }} />
                    <div className="skeleton" style={{ height: 76 }} />
                  </div>
                ))}
              </div>
            ) : view === 'board' ? (
              <SprintBoard
                cards={visibleCards}
                onMove={moveCard}
                addOpen={addOpen}
                onOpenAdd={() => setAddOpen(true)}
                onCloseAdd={() => setAddOpen(false)}
                onAdd={addCard}
              />
            ) : (
              <div className="sprint-backlog" aria-label="Backlog — all tickets">
                {visibleCards.map((card) => (
                  <div className="kcard" key={card.id}>
                    <div className="krow">
                      <span className="ktag tm">{card.ticketKey}</span>
                      <span
                        className={`kprio ${card.priority === 'high' ? 'high' : card.priority === 'med' ? 'med' : 'low'}`}
                      />
                      <span className="kprog">{COLUMNS.find((c) => c.key === card.column)?.label}</span>
                    </div>
                    <div className="ktitle">{card.title}</div>
                    <div className="kfoot">
                      {card.assigneeAgent && <span className={`kagent a-${card.assigneeAgent.toLowerCase().replace(/\W/g, '')}`}>{card.assigneeAgent}</span>}
                      <span className="kpts">{card.points} pts</span>
                    </div>
                  </div>
                ))}
                {visibleCards.length === 0 && <p className="kcol-empty">No tickets match.</p>}
              </div>
            )}
          </div>

          {/* Code-agent status strip (FR-4) — live from the board's assignments */}
          <div className="card">
            <h3>Code agents working now</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 14 }}>
              {CODE_AGENTS.map((agent) => {
                const assigned =
                  cards.find((c) => c.column === 'inprogress' && c.assigneeAgent === agent.id) ??
                  cards.find((c) => c.assigneeAgent === agent.id);
                return (
                  <div className="agent-row" key={agent.id}>
                    <div className={`av a-${agent.id.toLowerCase()}`} aria-hidden="true">
                      {agent.id}
                    </div>
                    <div>
                      <b>{agent.label}</b>
                      <div className="agent-sub">
                        {assigned
                          ? `Working on ${assigned.ticketKey} · ~${hoursElapsed(assigned.updatedAt)}h elapsed`
                          : 'Idle — no ticket assigned'}
                      </div>
                    </div>
                    {assigned && (
                      <span className="pill inprog">
                        <span className="dot" aria-hidden="true" />
                        Active
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* FR-7 side-promo (6) — Open in Jira ↗ */}
          <div className="card" style={{ padding: '20px 22px' }}>
            <h3 style={{ margin: 0 }}>Jira board</h3>
            <p style={{ margin: '6px 0 12px', fontSize: 13, color: 'var(--ink-2)' }}>
              Open the linked <b>{link.jiraProjectKey}</b> project in Jira to manage backlogs, epics,
              and transitions there.
            </p>
            {jiraBrowseUrl ? (
              <a
                className="btn btn-ghost btn-pill"
                href={jiraBrowseUrl}
                target="_blank"
                rel="noreferrer"
              >
                Open in Jira ↗
              </a>
            ) : (
              <span
                className="btn btn-ghost btn-pill"
                aria-disabled="true"
                title="This connection's Base URL is not a safe http(s) URL — re-save it to enable Open in Jira."
              >
                Open in Jira
              </span>
            )}
          </div>
        </>
      )}

      {/* Disconnect confirm — modal with focus trap (ConfirmDialog), AC-8/9 */}
      <ConfirmDialog
        open={disconnectOpen}
        title="Disconnect Jira?"
        description={
          <span>
            Existing tickets stay in Jira; the Sprint board will return to setup. Reconnect anytime
            from the board settings.
          </span>
        }
        confirmLabel="Disconnect"
        cancelLabel="Cancel"
        busy={disconnecting}
        triggerRef={cogRef}
        onConfirm={() => void confirmDisconnect()}
        onClose={() => setDisconnectOpen(false)}
      />
    </div>
  );
}
