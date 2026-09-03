// Status dropdown — the mockup's `.req-status-dd` listbox pattern (spec WCAG:
// button aria-haspopup="listbox" + ul role="listbox" + role="option"
// aria-selected; Arrow-key navigation, Esc closes, focus returns to the
// trigger). Offers the current status + machine-allowed targets ONLY —
// out-of-machine entries are hidden, not disabled (plan §0b, AC-6).

import { useEffect, useRef, useState } from 'react';
import {
  allowedTransitions,
  REQ_STATUSES,
  statusLabel,
  type ReqStatus,
} from '../../../server/requirements-model';
import { statusDotClass } from './storyModel';

type Props = {
  status: ReqStatus | null; // null → legacy row, every status is a fair baseline set
  label: string; // e.g. "BR-001 status, currently draft" — the trigger's aria-label
  groupAriaLabel: string; // e.g. "Change status"
  onSelect: (next: ReqStatus) => void;
  disabled?: boolean;
};

export function StatusDropdown({ status, label, groupAriaLabel, onSelect, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Current first, then machine-allowed targets, in canonical status order.
  const options: ReqStatus[] =
    status === null
      ? [...REQ_STATUSES]
      : [status, ...allowedTransitions(status).filter((s) => s !== status)];

  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, [open]);

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  };

  const pick = (next: ReqStatus) => {
    setOpen(false);
    triggerRef.current?.focus();
    onSelect(next);
  };

  const openMenu = () => {
    optionRefs.current = [];
    setOpen(true);
    // Focus lands on the first option so ArrowDown/ArrowUp walk the listbox
    // immediately (spec WCAG: Arrow-key navigation).
    requestAnimationFrame(() => optionRefs.current[0]?.focus());
  };

  return (
    <div className={`req-status-dd status-${status ?? 'draft'}`} ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="req-status-btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        disabled={disabled}
        onClick={() => (open ? close(true) : openMenu())}
        onKeyDown={(e) => {
          if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            openMenu();
          }
          if (open && e.key === 'Escape') {
            e.stopPropagation();
            close(true);
          }
        }}
      >
        <span className={`file-status ${statusDotClass(status)}`} aria-hidden="true" />
        <span>{statusLabel(status ?? 'draft')}</span>
        <svg className="caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <ul className="status-menu" role="listbox" aria-label={groupAriaLabel}>
          {options.map((opt, i) => (
            <li key={opt}>
              <button
                ref={(el) => {
                  optionRefs.current[i] = el;
                }}
                type="button"
                role="option"
                aria-selected={opt === status}
                className={opt === status ? 'current' : undefined}
                onClick={() => pick(opt)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    optionRefs.current[(i + 1) % options.length]?.focus();
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    optionRefs.current[(i - 1 + options.length) % options.length]?.focus();
                  } else if (e.key === 'Escape') {
                    e.stopPropagation();
                    close(true);
                  } else if (e.key === 'Home') {
                    e.preventDefault();
                    optionRefs.current[0]?.focus();
                  } else if (e.key === 'End') {
                    e.preventDefault();
                    optionRefs.current[options.length - 1]?.focus();
                  }
                }}
              >
                <span className={`file-status ${statusDotClass(opt)}`} aria-hidden="true" />
                {statusLabel(opt)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}