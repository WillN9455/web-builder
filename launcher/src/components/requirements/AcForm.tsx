// Small inline form for feature-level acceptance criteria (redesign §4/§7):
// one textarea + the met/unmet initial state. Shares the .add-form CSS
// vocabulary with InlineForm but is deliberately simpler — an AC has no
// priority/owner/type, and its status vocabulary (met/unmet) is not a
// ReqStatus, so the shared InlineForm's select sets don't apply.
//
// The screen owns open/close (one form at a time via FormState kind 'ac'),
// dirty tracking, and submission — this component is pure presentation.

import { useEffect, useRef, useState } from 'react';
import { LIMITS } from '../../../server/requirements-model';

export type AcFormValues = { text: string; status: 'met' | 'unmet' };

type Props = {
  formId: string; // "new AC-003" / "AC-001" — the stable ID only
  initial: AcFormValues;
  errors: Record<string, string>;
  submitting: boolean;
  onDirtyChange?: (dirty: boolean) => void;
  onValuesChange?: (values: AcFormValues) => void;
  onSubmit: (values: AcFormValues) => void;
  onCancel: () => void;
};

export function AcForm(props: Props) {
  const { formId, initial, errors, submitting, onDirtyChange, onValuesChange, onSubmit, onCancel } = props;
  const [values, setValues] = useState<AcFormValues>(initial);
  const [touched, setTouched] = useState(false);
  const initialRef = useRef(initial);
  const firstFieldRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    firstFieldRef.current?.focus();
  }, []);

  useEffect(() => {
    onDirtyChange?.(JSON.stringify(values) !== JSON.stringify(initialRef.current));
  }, [values, onDirtyChange]);

  const set = (patch: Partial<AcFormValues>) => {
    const next = { ...values, ...patch };
    setValues(next);
    onValuesChange?.(next);
  };

  const trimmed = values.text.trim();
  const clientError =
    trimmed.length < LIMITS.acText.min || trimmed.length > LIMITS.acText.max
      ? `Must be ${LIMITS.acText.min}–${LIMITS.acText.max} characters`
      : null;
  const showError = errors.text ?? (touched || clientError !== null ? clientError : null);
  const hasErrors = showError != null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (hasErrors || submitting) return;
    onSubmit(values);
  };

  return (
    <form
      className={`add-form mode-${formId.startsWith('new ') ? 'add' : 'edit'}`}
      role="form"
      aria-label="Acceptance criterion"
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
          {formId.startsWith('new ') ? <path d="M12 5v14 M5 12h14" /> : <path d="M4 20h4l10-10-4-4L4 16z M14 6l4 4" />}
        </svg>
        <span>Acceptance criterion</span>
        <span className="form-mode">{formId.startsWith('new ') ? 'Add' : 'Edit'}</span>
        <span className="form-id">{formId}</span>
      </div>

      <div className="grid-2">
        <div className="field span-2">
          <label htmlFor="acf-text">Criterion text <span className="req-mark">*</span></label>
          <textarea
            ref={firstFieldRef}
            id="acf-text"
            rows={2}
            value={values.text}
            placeholder={`Observable, testable outcome, ${LIMITS.acText.min}–${LIMITS.acText.max} chars`}
            aria-invalid={showError ? true : undefined}
            aria-describedby="err-ac-text"
            onChange={(e) => set({ text: e.target.value })}
            onBlur={() => setTouched(true)}
          />
          <div className="field-error" id="err-ac-text" role="alert">
            {showError ?? ' '}
          </div>
        </div>
      </div>

      <div className="grid-2">
        <div className="field">
          <label htmlFor="acf-status">Status <span className="req-mark">*</span></label>
          <select id="acf-status" value={values.status} onChange={(e) => set({ status: e.target.value as 'met' | 'unmet' })}>
            <option value="unmet">Unmet</option>
            <option value="met">Met</option>
          </select>
        </div>
        <div className="field" aria-hidden="true" />
      </div>

      <div className="field-row">
        <div className="help">
          Lives under this feature's <code>## Acceptance Criteria</code> section in <code>features.md</code>.
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
            <>{formId.startsWith('new ') ? 'Add criterion' : 'Save changes'}</>
          )}
        </button>
      </div>
    </form>
  );
}