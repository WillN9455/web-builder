// The unified add/edit form (spec UI: Add and Edit share one component — the
// only differences are the framing pill, the form-id line, the submit label,
// and the border tint). One form is open at a time across the screen;
// Esc/Cancel collapses it and the screen returns focus to the originating
// button (AC-5). Delete is no longer a form affordance — it lives in a
// confirmation modal opened from the row trash icon (refinement batch
// item 2.9).
//
// Requirements redesign (slices 1-3): the former "user story" form is now the
// FEATURE form — features (FE-NN) are the spec containers that group ACs,
// BRs and TRs. Stories become a derived artifact owned by the sprint board
// workstream and are no longer created here.

import { useEffect, useRef, useState } from 'react';
import {
  LIMITS,
  REQ_PRIORITIES,
  REQ_STATUSES,
  REQ_OWNERS,
  statusLabel,
  type ReqOwner,
  type ReqPriority,
  type ReqStatus,
} from '../../../server/requirements-model';

export type FeatureFormValues = {
  title: string;
  description: string;
  // Empty string means "no source link" — the server stores null.
  source: string;
  priority: ReqPriority;
  status: ReqStatus;
  owner: ReqOwner;
};

export type ReqFormValues = {
  type: 'BR' | 'TR';
  text: string;
  priority: ReqPriority;
  status: ReqStatus;
  owner: ReqOwner;
};

export type FormValues = FeatureFormValues | ReqFormValues;

export type InlineFormProps<V extends FormValues> = {
  mode: 'add' | 'edit';
  kind: 'feature' | 'req';
  formId: string; // "new FE-07" / "FE-01" — the stable ID only
  initial: V;
  heading: React.ReactNode; // "Feature" / "Requirement in FE-01"
  errors: Record<string, string>;
  submitting: boolean;
  onDirtyChange?: (dirty: boolean) => void;
  // Lets the parent track the live values (e.g. the type select drives the
  // next-ID preview in the form-id line).
  onValuesChange?: (values: V) => void;
  onSubmit: (values: V) => void;
  onCancel: () => void;
  // Delete is no longer part of the form (refinement batch item 2.9): a
  // confirmation modal owns it, opened directly from the row trash icon. The
  // form's footer is now just help text + Cancel + Save.
};

const PRIORITY_LABELS: Record<ReqPriority, string> = {
  must: 'Must',
  should: 'Should',
  could: 'Could',
  wont: "Won't (this release)",
};

const OWNER_LABELS: Record<ReqOwner, string> = {
  BA: 'BA',
  SA: 'SA',
  DEV: 'Dev',
  DES: 'Design',
  QA: 'QA',
};

// Client-side length checks mirror the server's LIMITS (server re-validates —
// client checks alone are never trusted, spec SEC).
function checkLength(field: string, value: string, min: number, max: number, errors: Record<string, string>): string {
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) {
    errors[field] = `Must be ${min}–${max} characters`;
  }
  return trimmed;
}

export function InlineForm<V extends FormValues>(props: InlineFormProps<V>) {
  const {
    mode,
    kind,
    formId,
    initial,
    heading,
    errors,
    submitting,
    onDirtyChange,
    onValuesChange,
    onSubmit,
    onCancel,
  } = props;

  const [values, setValues] = useState<FormValues>(initial);
  // Touched tracking (refinement batch item 2.4): client-side length errors
  // only render after the user has interacted with the field (or after a
  // submit attempt). The server is still the backstop — it always
  // re-validates and the merged {errors} payload bypasses touched.
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [submitAttempted, setSubmitAttempted] = useState(false);
  // First field gets focus on mount (spec UX). The kind of element differs
  // per kind (input vs select), so a callback ref keeps the type honest.
  const firstFieldRef = useRef<HTMLElement | null>(null);
  const setFirstField = (el: HTMLElement | null) => {
    firstFieldRef.current = el;
  };
  const initialRef = useRef(initial);

  useEffect(() => {
    firstFieldRef.current?.focus();
  }, []);

  useEffect(() => {
    const dirty = JSON.stringify(values) !== JSON.stringify(initialRef.current);
    onDirtyChange?.(dirty);
  }, [values, onDirtyChange]);

  const set = (patch: Partial<FormValues>) =>
    setValues((v) => {
      const next = { ...v, ...patch } as V;
      onValuesChange?.(next);
      return next;
    });
  const isFeature = kind === 'feature';
  const fv = values as FeatureFormValues;
  const rv = values as ReqFormValues;

  // QA-8: in EDIT mode, the form only validates and submits the fields the
  // user actually changed. A feature whose description is short can't
  // satisfy the add-mode min lengths, so submitting the loaded values
  // verbatim fails before the server is ever contacted. `isChanged(key)`
  // compares the live value to the initial value (string compare for text,
  // strict-equal for selects).
  // `keyof FormValues` resolves to the union of both subtypes' keys, which
  // collapses to just the shared fields (priority/status/owner). Cast the
  // keys we care about to the broader string-keyed record shape so the
  // helpers can read any field by name.
  const initialStr = (k: string): string => {
    const v = (initial as unknown as Record<string, unknown>)[k];
    return typeof v === 'string' ? v : '';
  };
  const liveStr = (k: string): string => {
    const v = (values as unknown as Record<string, unknown>)[k];
    return typeof v === 'string' ? v : '';
  };
  const isChanged = (k: string): boolean => {
    if (mode !== 'edit') return true;
    const a = initialStr(k);
    const b = liveStr(k);
    return a !== b;
  };

  // Client-side field errors (server errors arrive via props and merge).
  // In edit mode, untouched fields bypass validation entirely (the server
  // ignores fields the PATCH doesn't include).
  const clientErrors: Record<string, string> = {};
  if (isFeature) {
    if (mode !== 'edit' || isChanged('title')) checkLength('title', fv.title, LIMITS.featureTitle.min, LIMITS.featureTitle.max, clientErrors);
    if (mode !== 'edit' || isChanged('description')) checkLength('description', fv.description, LIMITS.description.min, LIMITS.description.max, clientErrors);
    // Source is optional (server stores null when empty) — only validate
    // when the user actually typed something.
    if (fv.source.trim() !== '' && (mode !== 'edit' || isChanged('source'))) {
      checkLength('source', fv.source, LIMITS.source.min, LIMITS.source.max, clientErrors);
    }
  } else {
    if (mode !== 'edit' || isChanged('text')) checkLength('text', rv.text, LIMITS.reqText.min, LIMITS.reqText.max, clientErrors);
  }
  // Server errors always render (they came back from a real submit and the
  // user needs the feedback); client errors only show on touched fields or
  // after a submit attempt — the spec UX is "errors after the user has
  // tried the field, not before they typed a thing".
  const showError = (name: string): string | null => {
    if (errors[name]) return errors[name];
    if (clientErrors[name] && (touched.has(name) || submitAttempted)) {
      return clientErrors[name];
    }
    return null;
  };
  const fieldErrors = { ...clientErrors, ...errors };
  const hasErrors = Object.keys(fieldErrors).length > 0;
  // QA-3: the form-error-summary banner ("Fix the N highlighted fields")
  // and aria-invalid only reflect the *visible* error set — otherwise the
  // banner pre-fires on mount because the client-side length checks
  // already populated clientErrors for every untouched field. The full
  // clientErrors set still drives submit gating above (server is the
  // backstop — refusing a submit because of an unseen client error is
  // intentional; the user just hasn't seen the banner yet, but the form
  // never opens with errors *visible* before they touched anything).
  const visibleErrorKeys = Object.keys(fieldErrors).filter((k) => showError(k) != null);
  const visibleErrorCount = visibleErrorKeys.length;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitAttempted(true);
    if (hasErrors || submitting) return;
    onSubmit(values as V);
  };

  const markTouched = (name: string) =>
    setTouched((prev) => (prev.has(name) ? prev : new Set(prev).add(name)));

  const fieldErr = (name: string) => {
    const msg = showError(name);
    return msg ? (
      <div className="field-error" id={`err-${name}`} role="alert">
        {msg}
      </div>
    ) : (
      <div className="field-error" id={`err-${name}`}>
        {' '}
      </div>
    );
  };

  const invalid = (name: string) => (showError(name) ? true : undefined);

  return (
    <form
      className={`add-form mode-${mode}`}
      role="form"
      aria-label={`${mode === 'add' ? 'Add' : 'Edit'} ${isFeature ? 'feature' : 'requirement'}`}
      onSubmit={submit}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onCancel();
        }
      }}
    >
      <div className="form-title">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
          {mode === 'add' ? <path d="M12 5v14 M5 12h14" /> : <path d="M4 20h4l10-10-4-4L4 16z M14 6l4 4" />}
        </svg>
        <span>{heading}</span>
        <span className="form-mode">{mode === 'add' ? 'Add' : 'Edit'}</span>
        <span className="form-id">{formId}</span>
      </div>

      {visibleErrorCount > 0 && (
        <div className="form-error-summary" role="alert">
          Fix the {visibleErrorCount} highlighted field{visibleErrorCount > 1 ? 's' : ''} below.
        </div>
      )}

      {isFeature ? (
        <>
          <div className="grid-2">
            <div className="field span-2">
              <label htmlFor="rf-title">Feature title <span className="req-mark">*</span></label>
              <input
                ref={setFirstField}
                id="rf-title"
                type="text"
                value={fv.title}
                placeholder="Short verb-led title (4–120 chars)"
                aria-invalid={invalid('title')}
                aria-describedby="err-title"
                onChange={(e) => set({ title: e.target.value })}
                onBlur={() => markTouched('title')}
              />
              {fieldErr('title')}
            </div>
          </div>
          <div className="grid-2" style={{ marginTop: 12 }}>
            <div className="field span-2">
              <label htmlFor="rf-desc">Description <span className="req-mark">*</span></label>
              <textarea
                id="rf-desc"
                rows={3}
                value={fv.description}
                placeholder="Problem statement / overview, 4–1000 chars"
                aria-invalid={invalid('description')}
                aria-describedby="err-description"
                onChange={(e) => set({ description: e.target.value })}
                onBlur={() => markTouched('description')}
              />
              {fieldErr('description')}
            </div>
          </div>
          <div className="grid-2" style={{ marginTop: 12 }}>
            <div className="field span-2">
              <label htmlFor="rf-source">Source link <span className="opt-mark">(optional)</span></label>
              {/* Background-doc traceability (redesign §7): e.g.
                  "user-journeys.md §3". Left empty the feature simply has no
                  source link — the server stores null. */}
              <input
                id="rf-source"
                type="text"
                value={fv.source}
                placeholder="Background doc + section, e.g. user-journeys.md §3 (2–200 chars)"
                aria-invalid={invalid('source')}
                aria-describedby="err-source"
                onChange={(e) => set({ source: e.target.value })}
                onBlur={() => markTouched('source')}
              />
              {fieldErr('source')}
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="grid-2">
            <div className="field">
              <label htmlFor="rf-type">Type <span className="req-mark">*</span></label>
              <select
                ref={setFirstField}
                id="rf-type"
                value={rv.type}
                onChange={(e) => set({ type: e.target.value as 'BR' | 'TR' })}
              >
                <option value="BR">Business requirement (BR)</option>
                <option value="TR">Technical requirement (TR)</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="rf-prio">Priority <span className="req-mark">*</span></label>
              <select id="rf-prio" value={rv.priority} onChange={(e) => set({ priority: e.target.value as ReqPriority })}>
                {REQ_PRIORITIES.map((p) => (
                  <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid-2" style={{ marginTop: 12 }}>
            <div className="field span-2">
              <label htmlFor="rf-text">Requirement text <span className="req-mark">*</span></label>
              <textarea
                id="rf-text"
                rows={3}
                value={rv.text}
                placeholder="A complete sentence, 10–500 chars"
                aria-invalid={invalid('text')}
                aria-describedby="err-text"
                onChange={(e) => set({ text: e.target.value })}
                onBlur={() => markTouched('text')}
              />
              {fieldErr('text')}
            </div>
          </div>
        </>
      )}

      <div className="grid-3" style={{ marginTop: 12 }}>
        {/* Add mode's initial status offers only the two starting states
            (Draft / In review); edit mode offers current + machine-allowed
            targets. */}
        <div className="field">
          <label htmlFor="rf-status">{mode === 'add' && isFeature ? 'Initial feature status' : 'Status'} <span className="req-mark">*</span></label>
          <select id="rf-status" value={rv.status} onChange={(e) => set({ status: e.target.value as ReqStatus })}>
            {(mode === 'add' && isFeature
              ? (['draft', 'in_review'] as ReqStatus[])
              : ([...REQ_STATUSES] as ReqStatus[])
            ).map((s) => (
              <option key={s} value={s}>{statusLabel(s)}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="rf-owner">Owner <span className="req-mark">*</span></label>
          <select id="rf-owner" value={rv.owner} onChange={(e) => set({ owner: e.target.value as ReqOwner })}>
            {REQ_OWNERS.map((o) => (
              <option key={o} value={o}>{OWNER_LABELS[o]}</option>
            ))}
          </select>
        </div>
        {!isFeature && <div className="field" aria-hidden="true" />}
      </div>

      <div className="field-row">
        <div className="help">
          {isFeature
            ? mode === 'add'
              ? <>New <code>{formId.replace(/^new /, '')}</code> will be appended to <code>features.md</code>.</>
              : <>Updates the <code>{formId}</code> block in <code>features.md</code>.</>
            : mode === 'add'
              ? <>Lands in the <code>{formId.replace(/^new /, '')}</code> feature block in <code>features.md</code> on save.</>
              : <>Updates <code>{formId}</code> in its feature block in <code>features.md</code>.</>}
        </div>
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? (
            <>
              <span className="spinner" aria-hidden="true" /> Saving…
            </>
          ) : (
            <>
              {mode === 'add' ? (isFeature ? 'Create feature' : 'Create requirement') : 'Save changes'}
            </>
          )}
        </button>
      </div>
    </form>
  );
}