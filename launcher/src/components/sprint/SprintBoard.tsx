// Sprint tab — the 4-column Kanban board (screen 6, design/sprint.html #s6).
//
// Cards are keyboard-draggable (Control/Command + ArrowLeft/ArrowRight moves the
// focused card between columns) and mouse-draggable (HTML5 drag-and-drop). Every
// move announces itself via an aria-live status region (FR-3, sitemap
// accessibility), and persists through the parent's onMove → PATCH /board/:id.
// The "+ Add issue" affordance (topbar + empty-state CTA) opens the inline form
// rendered above the columns; submit persists through the parent's onAdd.

import { useRef, useState } from 'react';
import type { BoardCard, BoardCardInput } from '../../lib/api';

export type BoardColumn = BoardCard['column'];
export type BoardPriority = BoardCard['priority'];

// Column metadata mirrors the design's kanban headers (design/sprint.html):
// dot colours verbatim (To do ink-3 / In progress blue / In review amber /
// Done green), title case per the mockup.
export const COLUMNS: {
  key: BoardColumn;
  label: string;
  dot: string;
  moveLabel: string; // announced by the aria-live status region
}[] = [
  { key: 'todo', label: 'To do', dot: 'var(--ink-3)', moveLabel: 'To do' },
  { key: 'inprogress', label: 'In progress', dot: 'var(--blue)', moveLabel: 'In progress' },
  { key: 'inreview', label: 'In review', dot: 'var(--amber)', moveLabel: 'In review' },
  { key: 'done', label: 'Done', dot: 'var(--green)', moveLabel: 'Done' },
];

export const PRIORITY_CLASSES: Record<BoardPriority, '' | 'high' | 'med' | 'low'> = {
  high: 'high',
  med: 'med',
  low: 'low',
};

export const PRIORITY_LABELS: Record<BoardPriority, string> = {
  high: 'High',
  med: 'Medium',
  low: 'Low',
};

// Code-agent selector options for the add-issue form (FR-3: C1/C2/C3 avatars).
export const CODE_AGENTS = [
  { id: 'C1', label: 'Code Agent 1' },
  { id: 'C2', label: 'Code Agent 2' },
  { id: 'C3', label: 'Code Agent 3' },
] as const;

// The visually-hidden announcer for card moves. No sr-only utility exists in
// the app stylesheet, so the standard clip recipe is inline (WAI-ARIA live
// region: aria-live + atomic so each move reads as one sentence).
const srOnly: React.CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  margin: -1,
  padding: 0,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
};

type SprintBoardProps = {
  cards: BoardCard[];
  onMove: (card: BoardCard, column: BoardColumn) => Promise<void>;
  /** Add-issue form state is lifted to the screen so the topbar "+ Add issue"
      button, the empty-state CTA, and the board's own form share one slot. */
  addOpen: boolean;
  onOpenAdd: () => void;
  onCloseAdd: () => void;
  onAdd: (input: BoardCardInput) => Promise<void>;
};

type NewIssue = { title: string; points: string; priority: BoardPriority; assigneeAgent: string };

const EMPTY_NEW_ISSUE: NewIssue = {
  title: '',
  points: '1',
  priority: 'med',
  assigneeAgent: '',
};

export function SprintBoard({ cards, onMove, addOpen, onOpenAdd, onCloseAdd, onAdd }: SprintBoardProps) {
  const [announcement, setAnnouncement] = useState('');
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [newIssue, setNewIssue] = useState<NewIssue>(EMPTY_NEW_ISSUE);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const dragIdRef = useRef<number | null>(null);

  const byColumn = (col: BoardColumn) => cards.filter((c) => c.column === col);

  const move = async (card: BoardCard, column: BoardColumn) => {
    if (card.column === column) return;
    const colLabel = COLUMNS.find((c) => c.key === column)!.moveLabel;
    setAnnouncement(`${card.ticketKey} moved to ${colLabel}`);
    try {
      await onMove(card, column);
    } catch {
      setAnnouncement(`${card.ticketKey} could not be moved`);
    }
  };

  const submitAdd = async () => {
    const title = newIssue.title.trim();
    if (!title) {
      setAddError('Issue title is required.');
      return;
    }
    setAdding(true);
    setAddError(null);
    try {
      await onAdd({
        title,
        column: 'todo',
        priority: newIssue.priority,
        points: Number(newIssue.points) || 0,
        assigneeAgent: newIssue.assigneeAgent,
      });
      setNewIssue(EMPTY_NEW_ISSUE);
      onCloseAdd();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Could not add the issue.');
    } finally {
      setAdding(false);
    }
  };

  const openAdd = () => {
    setNewIssue(EMPTY_NEW_ISSUE);
    setAddError(null);
    onOpenAdd();
  };

  // Empty board (§5) — the CTA opens the same add-issue form.
  if (cards.length === 0) {
    return (
      <>
        <div className="empty">
          <div className="illu" aria-hidden="true">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}>
              <rect x="3" y="4" width="5" height="16" rx="1" />
              <rect x="10" y="4" width="5" height="10" rx="1" />
              <rect x="17" y="4" width="4" height="6" rx="1" />
            </svg>
          </div>
          <h2>No tickets yet</h2>
          <p>
            Connect a Requirements doc or add an issue to start. Cards you create here sync to
            your linked Jira project.
          </p>
          <div className="empty-actions">
            <button className="btn btn-primary" onClick={openAdd}>+ Add issue</button>
          </div>
        </div>

        {addOpen && (
          <AddIssueForm
            newIssue={newIssue}
            setNewIssue={setNewIssue}
            addError={addError}
            adding={adding}
            onSubmit={() => void submitAdd()}
            onCancel={onCloseAdd}
          />
        )}
      </>
    );
  }

  return (
    <>
      <div className="kanban" aria-busy={draggingId !== null}>
        {COLUMNS.map((col) => {
          const columnCards = byColumn(col.key);
          return (
            <div
              className="kcol"
              key={col.key}
              data-column={col.key}
              onDragOver={(e) => {
                e.preventDefault();
                // Lift the dragged card visually over the target column head.
                e.dataTransfer.dropEffect = 'move';
              }}
              onDrop={(e) => {
                e.preventDefault();
                const cardId = Number(e.dataTransfer.getData('text/plain'));
                const card = cards.find((c) => c.id === cardId);
                if (card) void move(card, col.key);
                setDraggingId(null);
                dragIdRef.current = null;
              }}
            >
              <div className="khead">
                <span className="dot" style={{ background: col.dot }} />
                {col.label}
                <span className="kcount">{columnCards.length}</span>
              </div>

              {columnCards.length === 0 && (
                <p className="kcol-empty">
                  {col.key === 'todo'
                    ? 'No tickets yet — drag cards here or add an issue.'
                    : 'Drop a ticket here'}
                </p>
              )}

              {columnCards.map((card) => (
                <div
                  key={card.id}
                  className="kcard"
                  role="button"
                  tabIndex={0}
                  draggable
                  aria-label={`${card.ticketKey} ${card.title} — ${col.label}. Press Control and an arrow key to move it.`}
                  title={`${card.ticketKey} ${card.title} — drag or Control+Arrows to move`}
                  style={draggingId === card.id ? { opacity: 0.45 } : undefined}
                  onKeyDown={(e) => {
                    const meta = e.ctrlKey || e.metaKey;
                    if (!meta || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
                    e.preventDefault();
                    const idx = COLUMNS.findIndex((c) => c.key === card.column);
                    if (idx === -1) return;
                    const next = e.key === 'ArrowLeft' ? COLUMNS[idx - 1] : COLUMNS[idx + 1];
                    if (next) void move(card, next.key);
                  }}
                  onDragStart={(e) => {
                    dragIdRef.current = card.id;
                    setDraggingId(card.id);
                    e.dataTransfer.setData('text/plain', String(card.id));
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                  onDragEnd={() => {
                    setDraggingId(null);
                    dragIdRef.current = null;
                  }}
                >
                  <div className="krow">
                    <span className="ktag tm">{card.ticketKey}</span>
                    <span
                      className={`kprio ${PRIORITY_CLASSES[card.priority]}`}
                      title={`${PRIORITY_LABELS[card.priority]} priority`}
                    />
                  </div>
                  <div className="ktitle">{card.title}</div>
                  <div className="kfoot">
                    {card.assigneeAgent && <span className={`kagent a-${card.assigneeAgent.toLowerCase().replace(/\W/g, '')}`}>{card.assigneeAgent}</span>}
                    <span className="kpts">{card.points} pts</span>
                    {card.status && card.column !== 'todo' && <span className="kprog">{card.status}</span>}
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {/* Inline "+ Add issue" form — opened from the topbar or the empty-state
          CTA. Fields mirror the server's BoardCreateInput contract. */}
      {addOpen && (
        <AddIssueForm
          newIssue={newIssue}
          setNewIssue={setNewIssue}
          addError={addError}
          adding={adding}
          onSubmit={() => void submitAdd()}
          onCancel={onCloseAdd}
        />
      )}

      {/* Card-move announcements — aria-live region for keyboard + mouse moves. */}
      <p role="status" aria-live="polite" aria-atomic="true" style={srOnly}>
        {announcement}
      </p>
    </>
  );
}

type AddIssueFormProps = {
  newIssue: NewIssue;
  setNewIssue: (n: NewIssue) => void;
  addError: string | null;
  adding: boolean;
  onSubmit: () => void;
  onCancel: () => void;
};

function AddIssueForm({ newIssue, setNewIssue, addError, adding, onSubmit, onCancel }: AddIssueFormProps) {
  return (
    <form
      className="sprint-add-form"
      aria-label="Add issue"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <div className="setup-row">
        <label htmlFor="sb-add-title">Issue title</label>
        <input
          id="sb-add-title"
          className="input"
          autoFocus
          value={newIssue.title}
          onChange={(e) => setNewIssue({ ...newIssue, title: e.target.value })}
          placeholder="What needs to happen?"
        />
      </div>
      <div className="setup-row">
        <label htmlFor="sb-add-priority">Priority</label>
        <select
          id="sb-add-priority"
          className="input"
          value={newIssue.priority}
          onChange={(e) => setNewIssue({ ...newIssue, priority: e.target.value as BoardPriority })}
        >
          <option value="high">High</option>
          <option value="med">Medium</option>
          <option value="low">Low</option>
        </select>
      </div>
      <div className="setup-row">
        <label htmlFor="sb-add-points">Points</label>
        <input
          id="sb-add-points"
          className="input"
          type="number"
          min={0}
          value={newIssue.points}
          onChange={(e) => setNewIssue({ ...newIssue, points: e.target.value })}
        />
      </div>
      <div className="setup-row">
        <label htmlFor="sb-add-agent">Assign to</label>
        <select
          id="sb-add-agent"
          className="input"
          value={newIssue.assigneeAgent}
          onChange={(e) => setNewIssue({ ...newIssue, assigneeAgent: e.target.value })}
        >
          <option value="">Unassigned</option>
          {CODE_AGENTS.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </select>
      </div>
      {addError && <p role="alert" className="field-error">{addError}</p>}
      <div className="setup-actions">
        <button type="submit" className="btn btn-primary" disabled={adding} aria-busy={adding}>
          {adding ? 'Adding…' : 'Add issue'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
