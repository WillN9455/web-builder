// The unified add/edit form (spec UI: Add and Edit share one component — the
// only differences are the framing pill, the form-id line, the submit label,
// and the border tint). One form is open at a time across the screen;
// Esc/Cancel collapses it and the screen returns focus to the originating
// button (AC-5). Delete is no longer a form affordance — it lives in a
// confirmation modal opened from the row trash icon (refinement batch
// item 2.9).

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

export type StoryFormValues = {
  title: string;
  asA: string;
  iWantTo: string;
  soThat: string;
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

export type FormValues = StoryFormValues | ReqFormValues;

export type InlineFormProps<V extends FormValues> = {
  mode: 'add' | 'edit';
  kind: 'story' | 'req';
  formId: string; // "new US-07" / "US-01" — the stable ID only, never an invented actor/time
  initial: V;
  heading: React.ReactNode; // "User story" / "Requirement in US-01"
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
  const isStory = kind === 'story';
  const sv = values as StoryFormValues;
  const rv = values as ReqFormValues;

  // Client-side field errors (server errors arrive via props and merge).
  const clientErrors: Record<string, string> = {};
  if (isStory) {
    checkLength('title', sv.title, LIMITS.storyTitle.min, LIMITS.storyTitle.max, clientErrors);
    checkLength('asA', sv.asA, LIMITS.asA.min, LIMITS.asA.max, clientErrors);
    checkLength('iWantTo', sv.iWantTo, LIMITS.iWantTo.min, LIMITS.iWantTo.max, clientErrors);
    checkLength('soThat', sv.soThat, LIMITS.soThat.min, LIMITS.soThat.max, clientErrors);
  } else {
    checkLength('text', rv.text, LIMITS.reqText.min, LIMITS.reqText.max, clientErrors);
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
      aria-label={`${mode === 'add' ? 'Add' : 'Edit'} ${isStory ? 'user story' : 'requirement'}`}
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

      {isStory ? (
        <>
          <div className="grid-2">
            <div className="field span-2">
              <label htmlFor="rf-title">Story title <span className="req-mark">*</span></label>
              <input
                ref={setFirstField}
                id="rf-title"
                type="text"
                value={sv.title}
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
            <div className="field">
              <label htmlFor="rf-asa"><b>As a</b> <span className="req-mark">*</span></label>
              {/* TODO(personas): the mockup datalist offers personas.md role names,
                  but no endpoint reads personas yet — free text only, no invented
                  options (plan §2). */}
              <input
                id="rf-asa"
                type="text"
                value={sv.asA}
                placeholder="household owner"
                aria-invalid={invalid('asA')}
                aria-describedby="err-asA"
                onChange={(e) => set({ asA: e.target.value })}
                onBlur={() => markTouched('asA')}
              />
              {fieldErr('asA')}
            </div>
            <div className="field">
              <label htmlFor="rf-iwant"><b>I want to</b> <span className="req-mark">*</span></label>
              <input
                id="rf-iwant"
                type="text"
                value={sv.iWantTo}
                placeholder="Action + object, 4–200 chars"
                aria-invalid={invalid('iWantTo')}
                aria-describedby="err-iWantTo"
                onChange={(e) => set({ iWantTo: e.target.value })}
                onBlur={() => markTouched('iWantTo')}
              />
              {fieldErr('iWantTo')}
            </div>
          </div>
          <div className="grid-2" style={{ marginTop: 12 }}>
            <div className="field span-2">
              <label htmlFor="rf-sothat"><b>So that</b> <span className="req-mark">*</span></label>
              <input
                id="rf-sothat"
                type="text"
                value={sv.soThat}
                placeholder="Outcome / benefit, 4–200 chars"
                aria-invalid={invalid('soThat')}
                aria-describedby="err-soThat"
                onChange={(e) => set({ soThat: e.target.value })}
                onBlur={() => markTouched('soThat')}
              />
              {fieldErr('soThat')}
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
        {/* Add mode's initial status offers only the two story-starting
            states the mockup's add form shows (Draft / In review); edit mode
            offers current + machine-allowed targets. */}
        <div className="field">
          <label htmlFor="rf-status">{mode === 'add' ? (isStory ? 'Initial story status' : 'Status') : 'Status'} <span className="req-mark">*</span></label>
          <select id="rf-status" value={rv.status} onChange={(e) => set({ status: e.target.value as ReqStatus })}>
            {(mode === 'add' && isStory
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
        {!isStory && <div className="field" aria-hidden="true" />}
      </div>

      <div className="field-row">
        <div className="help">
          {isStory
            ? mode === 'add'
              ? <>New <code>{formId.replace(/^new /, '')}</code> will be appended to <code>user-journeys.md</code>.</>
              : <>Updates the <code>{formId}</code> block in <code>user-journeys.md</code>.</>
            : mode === 'add'
              ? <>Lands in <code>prd.md</code> §8 (BR) or the story block (TR) on save.</>
              : <>Updates <code>{formId}</code> in <code>prd.md</code> §8 or its story block.</>}
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
              {mode === 'add' ? (isStory ? 'Create user story' : 'Create requirement') : 'Save changes'}
            </>
          )}
        </button>
      </div>
    </form>
  );
}