import { useEffect, useRef, useState, useId, useCallback } from 'react';
import { createPortal } from 'react-dom';

type Props = {
  open: boolean;
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  // When set, render a text input below the description. The confirm button
  // stays disabled until the input's trimmed value matches exactly. Used by
  // destructive flows where we want a stronger gate than a single click.
  requireTextMatch?: string;
  busy?: boolean;
  // Server / network error rendered inside the dialog (e.g. "API server is
  // not running"). Empty when there's nothing to surface.
  errorMessage?: string | null;
  // Ref to the element that opened the dialog — we restore focus to it on
  // close so keyboard users don't lose their place in the page.
  triggerRef: React.RefObject<HTMLElement | null>;
  onConfirm: () => void;
  onClose: () => void;
};

// Selector matching the focusable elements inside the dialog. Used by the
// hand-rolled focus trap (no headless UI library is installed — verified in
// package.json). Native <button>, <a>, <input>, etc. only.
const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'textarea:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

// Reusable confirm/destructive dialog. Renders into a React portal at
// document.body so the modal sits above every parent stacking context.
// Implements the parts of ui-best-practices.md §4 that the WAI-ARIA dialog
// pattern requires: role + aria-modal, focus trap, Esc to close, backdrop
// click to close, body scroll lock, and focus restoration to the trigger.
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  requireTextMatch,
  busy,
  errorMessage,
  triggerRef,
  onConfirm,
  onClose,
}: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelBtnRef = useRef<HTMLButtonElement>(null);
  const [typed, setTyped] = useState('');
  const titleId = useId();
  const descId = useId();

  // Reset the typed value every time the dialog re-opens so a stale match
  // from a previous session can't carry over.
  useEffect(() => {
    if (open) setTyped('');
  }, [open]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !dialogRef.current) return;
      // Cycle focus inside the dialog. If focus would leave, wrap to the
      // first/last focusable element.
      const focusables = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter((el) => !el.hasAttribute('disabled') && el.tabIndex !== -1);
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    },
    [onClose],
  );

  // Open lifecycle: lock body scroll, move focus into the dialog (initial
  // focus lands on Cancel so a stray Enter doesn't confirm), restore focus
  // + scroll on close.
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Defer focus until after the portal mounts — picking Cancel as the
    // landing spot keeps the destructive action one deliberate click away.
    const id = window.setTimeout(() => cancelBtnRef.current?.focus(), 0);
    return () => {
      window.clearTimeout(id);
      document.body.style.overflow = prevOverflow;
      const trigger = triggerRef.current;
      // Restore focus to the trigger that opened the dialog. Skip if the
      // trigger is no longer in the DOM (e.g. the tile got removed because
      // it was the project being deleted).
      if (trigger && document.body.contains(trigger)) {
        trigger.focus();
      }
    };
  }, [open, triggerRef]);

  if (!open) return null;

  const matchNeeded = typeof requireTextMatch === 'string';
  const matchOk = !matchNeeded || typed.trim() === requireTextMatch;
  const confirmDisabled = busy || !matchOk;

  const dialog = (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        // Close on backdrop click only when the mousedown started on the
        // backdrop itself — otherwise dragging from inside the dialog would
        // dismiss it on release.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        onKeyDown={handleKeyDown}
        // Prevent the backdrop's mousedown handler from firing when the
        // user clicks inside the dialog body.
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="modal-title">{title}</h2>
        <div id={descId} className="modal-body">
          {description}
          {matchNeeded && (
            <input
              autoFocus
              type="text"
              className={`confirm-input ${typed.length > 0 && !matchOk ? 'invalid' : ''}`}
              placeholder={requireTextMatch}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              aria-label={`Type ${requireTextMatch} to confirm`}
              aria-invalid={typed.length > 0 && !matchOk}
            />
          )}
          {errorMessage && (
            <p role="alert" className="field-error">{errorMessage}</p>
          )}
        </div>
        <div className="modal-actions">
          <button
            ref={cancelBtnRef}
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
            disabled={busy}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={onConfirm}
            disabled={confirmDisabled}
            aria-busy={busy}
          >
            {busy ? 'Deleting…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(dialog, document.body);
}
