// Requirements tab (screen 15, requirements.html v5.3) — the story-grouped
// BR/TR source of truth. One InlineForm open at a time across the screen
// (spec UX), optimistic status changes with snap-back + toast, delete via the
// edit form's two-step strip, and the delete-guard 409 surfaced inline with a
// scroll-and-flash escape hatch. No TanStack Query (plan §2): a plain
// fetch + reload after every successful mutation.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useOutletContext, useParams } from 'react-router-dom';
import {
  createRequirement,
  createStory,
  deleteRequirement,
  deleteStory,
  fetchRequirements,
  RequirementsDeleteGuardError,
  RequirementsValidationError,
  updateRequirement,
  updateRequirementStatus,
  updateStory,
  type RequirementsResponse,
  type RequirementItem,
  type ReqStatus,
  type StoryItem,
} from '../../lib/api';
import type { ProjectOutletContext } from '../ProjectDetailScreen';
import { ConfirmDialog } from '../ConfirmDialog';
import { InlineForm, type FormValues, type ReqFormValues, type StoryFormValues } from './InlineForm';
import { FilterBar } from './FilterBar';
import { StoryGroup } from './StoryGroup';
import { ReqRow } from './ReqRow';
import {
  applyFilters,
  deriveTotals,
  EMPTY_FILTER,
  nextReqIdPreview,
  nextStoryIdPreview,
  type FilterState,
  type FormState,
} from './storyModel';

type Notice = { kind: 'success' | 'error'; text: string };

type LoadState = 'loading' | 'ok' | 'error';

type DeleteGuard = { message: string; referencedBy: string[] };

// Client-side field errors keyed the same way the server's {errors} payload
// keys them, so InlineForm merges both sources unchanged.
const DEFAULT_STORY_VALUES: StoryFormValues = {
  title: '',
  asA: '',
  iWantTo: '',
  soThat: '',
  priority: 'must',
  status: 'draft',
  owner: 'BA',
};

const DEFAULT_REQ_VALUES: ReqFormValues = {
  type: 'TR',
  text: '',
  priority: 'must',
  status: 'draft',
  owner: 'BA',
};

export function RequirementsScreen() {
  const { id } = useParams();
  const { project, onRequirementsCount } = useOutletContext<ProjectOutletContext>();
  const idOrSlug = id ?? '';

  const [data, setData] = useState<RequirementsResponse | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);

  const [filter, setFilter] = useState<FilterState>(EMPTY_FILTER);
  const [form, setForm] = useState<FormState | null>(null);
  // Live values of the open form (drives the next-ID preview's type segment).
  const [formValues, setFormValues] = useState<FormValues | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [guard, setGuard] = useState<DeleteGuard | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [dirty, setDirty] = useState(false);
  // Opening another form while the current one is dirty → discard prompt.
  const [discardOpen, setDiscardOpen] = useState(false);
  const pendingOpenRef = useRef<{ form: FormState; trigger: HTMLElement | null } | null>(null);
  const discardTriggerRef = useRef<HTMLElement | null>(null);
  // Where focus goes when the form collapses (the button that opened it).
  const originRef = useRef<HTMLElement | null>(null);

  const [notice, setNotice] = useState<Notice | null>(null);
  const noticeTimer = useRef<number | null>(null);
  const [storyStatusPending, setStoryStatusPending] = useState<string | null>(null);
  const [reqStatusPending, setReqStatusPending] = useState<string | null>(null);
  const [flashStoryId, setFlashStoryId] = useState<string | null>(null);
  const flashTimer = useRef<number | null>(null);

  const showNotice = useCallback((n: Notice) => {
    setNotice(n);
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 4000);
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetchRequirements(idOrSlug);
      setData(res);
      setLoadState('ok');
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Could not load requirements');
      setLoadState('error');
    }
  }, [idOrSlug]);

  useEffect(() => {
    void load();
  }, [load]);

  // Sidebar honesty (AC-12): the chip reflects this screen's live parse and
  // clears when the tab unmounts, so a stale count never outlives its source.
  const totalCount = data && data.source === 'ok' ? deriveTotals(data).total : null;
  useEffect(() => {
    onRequirementsCount?.(totalCount);
    return () => onRequirementsCount?.(null);
  }, [totalCount, onRequirementsCount]);

  useEffect(
    () => () => {
      if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
      if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
    },
    [],
  );

  const totals = useMemo(() => (data && data.source === 'ok' ? deriveTotals(data) : null), [data]);
  const filtered = useMemo(
    () => (data && data.source === 'ok' ? applyFilters(data, filter) : null),
    [data, filter],
  );
  // Chip + segment counts always come from the FULL list, never the filtered
  // view — a filter must not shrink its own controls.
  const chipCounts = useMemo(() => {
    const byStatus = {} as Record<ReqStatus, number>;
    const bump = (st: ReqStatus | null) => {
      if (st) byStatus[st] = (byStatus[st] ?? 0) + 1;
    };
    let business = 0;
    let technical = 0;
    if (data && data.source === 'ok') {
      business = data.businessReqs.length;
      for (const r of data.businessReqs) bump(r.status);
      for (const s of data.stories) {
        technical += s.reqs.length;
        for (const r of s.reqs) bump(r.status);
      }
    }
    return { all: business + technical, business, technical, byStatus };
  }, [data]);

  // ── Form open / close (spec UX: one form at a time; dirty → discard prompt) ──

  const applyForm = useCallback((next: FormState, trigger: HTMLElement | null) => {
    originRef.current = trigger;
    setForm(next);
    setFormValues(null);
    setFormErrors({});
    setGuard(null);
    setDirty(false);
  }, []);

  const openForm = useCallback(
    (next: FormState) => {
      const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      if (form && dirty) {
        pendingOpenRef.current = { form: next, trigger };
        discardTriggerRef.current = trigger;
        setDiscardOpen(true);
        return;
      }
      applyForm(next, trigger);
    },
    [form, dirty, applyForm],
  );

  const closeForm = useCallback(() => {
    setForm(null);
    setFormValues(null);
    setFormErrors({});
    setGuard(null);
    setDirty(false);
    originRef.current?.focus();
    originRef.current = null;
  }, []);

  const confirmDiscard = useCallback(() => {
    const pending = pendingOpenRef.current;
    pendingOpenRef.current = null;
    setDiscardOpen(false);
    if (pending) applyForm(pending.form, pending.trigger);
  }, [applyForm]);

  // ── Flash highlight (delete-guard "Open referencing story", spec UX) ──

  const flashStory = useCallback((usId: string) => {
    setFlashStoryId(usId);
    document.getElementById(`story-${usId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlashStoryId(null), 2500);
  }, []);

  // ── Submit / delete dispatch ───────────────────────────────────────────────

  const reloadQuiet = useCallback(async () => {
    try {
      const res = await fetchRequirements(idOrSlug);
      setData(res);
    } catch {
      // keep showing the previous copy; the next user action retries
    }
  }, [idOrSlug]);

  const storyValuesFrom = (story: StoryItem): StoryFormValues => ({
    title: story.title,
    asA: story.asA ?? '',
    iWantTo: story.iWantTo ?? '',
    soThat: story.soThat ?? '',
    priority: story.priority ?? 'must',
    status: story.status ?? 'draft',
    owner: story.owner ?? 'BA',
  });

  const reqValuesFrom = (req: RequirementItem): ReqFormValues => ({
    type: req.type,
    text: req.text,
    priority: req.priority ?? 'must',
    status: req.status ?? 'draft',
    owner: req.owner ?? 'BA',
  });

  const handleError = useCallback(
    (e: unknown) => {
      if (e instanceof RequirementsValidationError) {
        setFormErrors(e.errors);
        return;
      }
      showNotice({ kind: 'error', text: e instanceof Error ? e.message : 'Something went wrong' });
    },
    [showNotice],
  );

  const submitForm = useCallback(
    async (values: FormValues) => {
      if (!form || !idOrSlug) return;
      setSubmitting(true);
      try {
        if (form.kind === 'story') {
          const v = values as StoryFormValues;
          if (form.mode === 'add') {
            await createStory(idOrSlug, {
              title: v.title,
              asA: v.asA,
              iWantTo: v.iWantTo,
              soThat: v.soThat,
              priority: v.priority,
              status: v.status,
              owner: v.owner,
            });
            showNotice({ kind: 'success', text: 'User story created' });
          } else {
            await updateStory(idOrSlug, form.usId, {
              title: v.title,
              asA: v.asA,
              iWantTo: v.iWantTo,
              soThat: v.soThat,
              priority: v.priority,
              status: v.status,
              owner: v.owner,
            });
            showNotice({ kind: 'success', text: `${form.usId} updated` });
          }
        } else {
          const v = values as ReqFormValues;
          if (form.mode === 'add') {
            await createRequirement(idOrSlug, form.usId, {
              type: v.type,
              text: v.text,
              priority: v.priority,
              status: v.status,
              owner: v.owner,
            });
            showNotice({
              kind: 'success',
              text: v.type === 'BR' ? 'Business requirement added to prd.md §8' : 'Technical requirement added',
            });
          } else {
            await updateRequirement(idOrSlug, form.reqId, {
              type: v.type,
              text: v.text,
              priority: v.priority,
              status: v.status,
              owner: v.owner,
            });
            showNotice({ kind: 'success', text: `${form.reqId} updated` });
          }
        }
        closeForm();
        await load();
      } catch (e) {
        handleError(e);
      } finally {
        setSubmitting(false);
      }
    },
    [form, idOrSlug, showNotice, closeForm, load, handleError],
  );

  // The form strip's Delete is the second step of the two-step confirm
  // (spec UX): the first step was choosing to open the edit form.
  const submitDelete = useCallback(async () => {
    // Delete lives only in the edit form's strip — the add form has none.
    if (!form || !idOrSlug || form.mode !== 'edit') return;
    setSubmitting(true);
    try {
      if (form.kind === 'story') {
        await deleteStory(idOrSlug, form.usId);
        showNotice({ kind: 'success', text: `${form.usId} deleted (struck in user-journeys.md)` });
      } else {
        await deleteRequirement(idOrSlug, form.reqId);
        showNotice({ kind: 'success', text: `${form.reqId} deleted (struck in its source file)` });
      }
      closeForm();
      await load();
    } catch (e) {
      if (e instanceof RequirementsDeleteGuardError) {
        setGuard({ message: e.message, referencedBy: e.referencedBy });
      } else {
        handleError(e);
      }
    } finally {
      setSubmitting(false);
    }
  }, [form, idOrSlug, showNotice, closeForm, load, handleError]);

  // ── Optimistic status changes (spec UX: flip immediately, snap back + toast
  // if the server rejects the transition) ─────────────────────────────────────

  const changeStoryStatus = useCallback(
    async (story: StoryItem, next: ReqStatus) => {
      if (!idOrSlug) return;
      setStoryStatusPending(story.usId);
      setData((d) =>
        d
          ? {
              ...d,
              stories: d.stories.map((s) => (s.usId === story.usId ? { ...s, status: next } : s)),
            }
          : d,
      );
      try {
        await updateStory(idOrSlug, story.usId, { status: next });
        await reloadQuiet();
      } catch (e) {
        await reloadQuiet();
        showNotice({
          kind: 'error',
          text: e instanceof Error ? e.message : `Could not update ${story.usId} status`,
        });
      } finally {
        setStoryStatusPending(null);
      }
    },
    [idOrSlug, reloadQuiet, showNotice],
  );

  const changeReqStatus = useCallback(
    async (req: RequirementItem, next: ReqStatus) => {
      if (!idOrSlug) return;
      setReqStatusPending(req.id);
      setData((d) =>
        d
          ? {
              ...d,
              businessReqs: d.businessReqs.map((r) => (r.id === req.id ? { ...r, status: next } : r)),
              stories: d.stories.map((s) => ({
                ...s,
                reqs: s.reqs.map((r) => (r.id === req.id ? { ...r, status: next } : r)),
              })),
            }
          : d,
      );
      try {
        await updateRequirementStatus(idOrSlug, req.id, next);
        await reloadQuiet();
      } catch (e) {
        await reloadQuiet();
        showNotice({
          kind: 'error',
          text: e instanceof Error ? e.message : `Could not update ${req.id} status`,
        });
      } finally {
        setReqStatusPending(null);
      }
    },
    [idOrSlug, reloadQuiet, showNotice],
  );

  // ── Derived render data ────────────────────────────────────────────────────

  const formIdLine = useMemo(() => {
    if (!form || !data || data.source !== 'ok') return '';
    if (form.mode === 'add') {
      if (form.kind === 'story') return `new story · auto-assigned as ${nextStoryIdPreview(data.stories)}`;
      const type = (formValues as ReqFormValues | null)?.type ?? 'TR';
      return `new requirement · auto-assigned as ${nextReqIdPreview(type, data)}`;
    }
    return form.kind === 'story' ? form.usId : form.reqId;
  }, [form, data, formValues]);

  // Initial values are read at mount (InlineForm captures them once); the
  // key below guarantees a remount whenever the form target changes.
  const formInitial: FormValues | null = useMemo(() => {
    if (!form || !data) return null;
    if (form.mode === 'add') {
      if (form.kind === 'story') return DEFAULT_STORY_VALUES;
      return { ...DEFAULT_REQ_VALUES, type: 'TR' };
    }
    if (form.kind === 'story') {
      const story = data.stories.find((s) => s.usId === form.usId);
      return story ? storyValuesFrom(story) : null;
    }
    const req = [
      ...data.businessReqs,
      ...data.stories.flatMap((s) => s.reqs),
    ].find((r) => r.id === form.reqId);
    return req ? reqValuesFrom(req) : null;
  }, [form, data, storyValuesFrom, reqValuesFrom]);

  // ── States ─────────────────────────────────────────────────────────────────

  if (loadState === 'error') {
    return (
      <div className="center-stage" style={{ minHeight: 400 }}>
        <div className="center-card" style={{ textAlign: 'center' }}>
          <div className="crumbs">Requirements</div>
          <h1>Could not load requirements</h1>
          <p className="sub" style={{ textAlign: 'center' }}>{loadError}</p>
          <div className="actions-row" style={{ justifyContent: 'center' }}>
            <button type="button" className="btn btn-primary" onClick={() => { setLoadState('loading'); void load(); }}>
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (loadState === 'loading') {
    return (
      <div className="center-stage" style={{ minHeight: 400 }}>
        <div className="center-card" style={{ textAlign: 'center' }}>
          <div className="crumbs">Requirements</div>
          <h1>Loading…</h1>
        </div>
      </div>
    );
  }

  if (!data) return null;

  // no-prd (AC-4): friendly empty state, and NO add affordances (AC-12) —
  // the PRD/ folder itself is born in Project Background.
  if (data.source === 'no-prd') {
    return (
      <div className="center-stage" style={{ minHeight: 400 }}>
        <div className="center-card" style={{ textAlign: 'center' }}>
          <div className="crumbs">Requirements</div>
          <h1>No requirements yet</h1>
          <p className="sub" style={{ textAlign: 'center' }}>
            This project has no PRD/ folder yet. The Requirements tab reads{' '}
            <code>prd.md</code> §8 and <code>user-journeys.md</code> — both are
            created in the <b>Project Background</b> tab as the BA workspace is
            reviewed.
          </p>
          <div className="actions-row" style={{ justifyContent: 'center' }}>
            <Link className="btn btn-soft" to={`/projects/${idOrSlug}/background`}>
              Open Project Background
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const emptyProject = data.stories.length === 0 && data.businessReqs.length === 0;

  // ── The InlineForm slot (shared by every open-form position) ──
  // Slots: 'top' = the add-story form under the add bar; 'brs' = the edit-BR
  // form inside the business-requirements group; otherwise a story's usId.

  const renderForm = (slot: 'top' | 'brs' | string) => {
    if (!form || !formInitial) return null;
    const belongsHere =
      form.mode === 'add' && form.kind === 'story'
        ? slot === 'top'
        : form.kind === 'story'
          ? slot === form.usId
          : slot === 'brs'
            ? form.usId == null
            : slot === form.usId;
    if (!belongsHere) return null;
    return (
      <InlineForm
        key={`${form.kind}-${form.mode}-${slot}-${'reqId' in form ? form.reqId : ''}`}
        mode={form.mode}
        kind={form.kind}
        formId={formIdLine}
        heading={
          form.kind === 'story'
            ? 'User story'
            : form.mode === 'add'
              ? `Requirement in ${form.usId}`
              : 'Requirement'
        }
        initial={formInitial}
        errors={formErrors}
        submitting={submitting}
        onDirtyChange={setDirty}
        onValuesChange={setFormValues}
        onSubmit={(v) => void submitForm(v)}
        onCancel={closeForm}
        onDelete={() => void submitDelete()}
        deleteCopy={
          form.mode === 'edit'
            ? form.kind === 'story'
              ? `Deleting ${form.usId} strikes the block and its rows in user-journeys.md — the ID is never reused.`
              : `Deleting ${form.reqId} strikes the row in its source file — the marker keeps a 30-day recovery seam.`
            : undefined
        }
        deleteBlocked={
          guard
            ? {
                message: guard.message,
                onOpenStory:
                  guard.referencedBy.length > 0 ? () => flashStory(guard.referencedBy[0]) : undefined,
              }
            : null
        }
      />
    );
  };

  return (
    <div className="req-screen">
      {notice && (
        <div className="toast" role={notice.kind === 'error' ? 'alert' : 'status'} aria-live="polite"
          style={notice.kind === 'error' ? { background: 'var(--blush)' } : undefined}>
          <span className="toast-dot" aria-hidden="true" />
          {notice.text}
        </div>
      )}

      {/* Stage banner — live totals re-derived every render (LEGEND) */}
      <div className="ba-stage">
        <div className="ico">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path d="M9 5h11v14H9z M5 5h14v14H5z"/></svg>
        </div>
        <div className="body">
          <div className="lbl">Requirements</div>
          <div className="ttl">
            {totals?.total ?? 0} business &amp; technical requirements · grouped by user story
          </div>
          <div className="sub">
            The signed-off list. Long-form context lives in the{' '}
            <Link to={`/projects/${idOrSlug}/background`}><b>Project Background</b></Link> tab. Only
            the BA can add or change a requirement here. {/* TODO(auth): the launcher is a
            single-user local app — no auth middleware gates this yet. */}
          </div>
        </div>
        <div className="counts">
          <span className="count-pill">
            <span className="file-status approved" aria-hidden="true" />
            <b>{totals?.business ?? 0}</b> Business
          </span>
          <span className="count-pill">
            <span className="file-status review" aria-hidden="true" />
            <b>{totals?.technical ?? 0}</b> Technical
          </span>
          <span className="count-pill">
            <span className="file-status returned" aria-hidden="true" />
            <b>{totals?.blocked ?? 0}</b> Blocked
          </span>
        </div>
      </div>

      <div className="ba-workspace" style={{ gridTemplateColumns: '1fr' }}>
        <div className="ba-doc">
          <div className="ba-doc-head">
            <div>
              <div className="crumbs">
                Requirements · <b>{project?.name ?? idOrSlug}</b> ·{' '}
                <span className="pill done" style={{ padding: '2px 8px', fontSize: '10.5px' }}>
                  <span className="dot" aria-hidden="true" /> {totals?.total ?? 0} requirements
                </span>
              </div>
              <div className="title">{project?.name ?? idOrSlug} — Requirements</div>
            </div>
            <div className="meta">
              <span>
                Reads <code>prd.md</code> §8 + <code>user-journeys.md</code>
              </span>
            </div>
          </div>

          <div className="ba-doc-body view">
            {data.parseError && (
              <div className="toast" role="alert" style={{ background: 'var(--butter)', marginBottom: 12 }}>
                <span className="toast-dot" aria-hidden="true" />
                Some requirements could not be parsed and are hidden: {data.parseError}
              </div>
            )}

            {emptyProject ? (
              /* Zero-stories empty state (AC-8): one CTA, story-first. */
              <div className="req-empty">
                <h2>No requirements yet</h2>
                <p>
                  Start with a <b>user story</b> — once one exists you can add BR / TR
                  requirements to it from inside that story's header.
                </p>
                <button type="button" className="btn btn-primary" aria-label="Add your first user story" onClick={() => openForm({ mode: 'add', kind: 'story' })}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true"><path d="M12 5v14 M5 12h14"/></svg>
                  Add your first user story
                </button>
              </div>
            ) : (
              <>
                {/* Add bar — story-first: only "Add user story" lives here (spec UI). */}
                <div className="req-add-bar" role="region" aria-label="Add a new user story">
                  <div className="label">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v8 M8 12h8"/></svg>
                    <span>
                      <b>BA controls.</b> Start with a <b>user story</b> — once a story exists you
                      can add BR / TR requirements to it from inside that story's header.
                    </span>
                  </div>
                  <button type="button" className="btn btn-primary" aria-label="Add a new user story" onClick={() => openForm({ mode: 'add', kind: 'story' })}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true"><path d="M12 5v14 M5 12h14"/></svg>
                    Add user story
                  </button>
                </div>

                {renderForm('top') /* the add-story form lives under the add bar */}

                {filtered && (
                  <FilterBar filter={filter} onChange={setFilter} counts={chipCounts} />
                )}

                {/* Business requirements group — prd.md §8 rows, no story owner
                    (plan §6.8: attaching BRs to stories would invent data). */}
                {filtered && filtered.businessReqs.length > 0 && (
                  <div className="story brs-group">
                    <div className="story-head">
                      <div className="story-id">BRs</div>
                      <div className="story-body">
                        <div className="story-title">Business requirements</div>
                        <div className="story-as">
                          PRD §8 — the outcomes the product must deliver, not tied to a single
                          user story. Story-first: requirements are added from a story's header.
                        </div>
                      </div>
                      <div className="story-meta">
                        <span className="story-count">{filtered.businessReqs.length} reqs</span>
                      </div>
                    </div>
                    {renderForm('brs') /* edit-BR form slot */}
                    <div className="req-list" role="list">
                      {filtered.businessReqs.map((req) => (
                        <ReqRow
                          key={req.id}
                          req={req}
                          statusPending={reqStatusPending === req.id}
                          onEdit={() => openForm({ mode: 'edit', kind: 'req', reqId: req.id, usId: null })}
                          onDelete={() => openForm({ mode: 'edit', kind: 'req', reqId: req.id, usId: null })}
                          onStatusChange={(next) => void changeReqStatus(req, next)}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {filtered && filtered.stories.map((story) => (
                  <StoryGroup
                    key={story.usId}
                    story={story}
                    openForm={form}
                    renderForm={() => renderForm(story.usId)}
                    flash={flashStoryId === story.usId}
                    statusPendingStory={storyStatusPending === story.usId}
                    statusPendingReqId={reqStatusPending}
                    onEditStory={() => openForm({ mode: 'edit', kind: 'story', usId: story.usId })}
                    onAddReq={() => openForm({ mode: 'add', kind: 'req', usId: story.usId })}
                    // Delete goes through the edit form's two-step strip (spec UX).
                    onDeleteStory={() => openForm({ mode: 'edit', kind: 'story', usId: story.usId })}
                    onStoryStatus={(next) => void changeStoryStatus(story, next)}
                    onReqEdit={(req) => openForm({ mode: 'edit', kind: 'req', reqId: req.id, usId: story.usId })}
                    onReqDelete={(req) => openForm({ mode: 'edit', kind: 'req', reqId: req.id, usId: story.usId })}
                    onReqStatus={(req, next) => void changeReqStatus(req, next)}
                  />
                ))}

                {filtered && filtered.stories.length === 0 && filtered.businessReqs.length === 0 && (
                  <div className="req-empty slim">
                    <p>No requirements match the current filters.</p>
                    <button type="button" className="btn btn-ghost" onClick={() => setFilter(EMPTY_FILTER)}>
                      Clear filters
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Discard-changes prompt (spec UX: opening another form while dirty). */}
      <ConfirmDialog
        open={discardOpen}
        title="Discard unsaved changes?"
        description="The open form has edits that haven't been saved. Discard them to open the other form?"
        confirmLabel="Discard changes"
        cancelLabel="Keep editing"
        triggerRef={discardTriggerRef}
        onConfirm={confirmDiscard}
        onClose={() => {
          pendingOpenRef.current = null;
          setDiscardOpen(false);
          discardTriggerRef.current?.focus();
        }}
      />
    </div>
  );
}