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

// Truncate a string at a word boundary for the delete-modal target label.
// The label sits inside a single line in the modal title and shouldn't
// overflow on narrow viewports.
function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.5 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

// A delete target describes what the modal is about to strike. The trash
// icons on rows/stories open the modal directly (refinement batch item 2.9);
// `linkedUsId` powers the "Open referencing story" escape hatch when the
// server returns a 409 (the BR is referenced from a story block).
type DeleteTarget =
  | { kind: 'story'; usId: string; trigger: HTMLElement | null; label: string; copy: string }
  | {
      kind: 'req';
      reqId: string;
      type: 'BR' | 'TR';
      usId: string | null;
      trigger: HTMLElement | null;
      label: string;
      copy: string;
    };

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
  const [submitting, setSubmitting] = useState(false);
  const [dirty, setDirty] = useState(false);
  // Opening another form while the current one is dirty → discard prompt.
  const [discardOpen, setDiscardOpen] = useState(false);
  const pendingOpenRef = useRef<{ form: FormState; trigger: HTMLElement | null } | null>(null);
  const discardTriggerRef = useRef<HTMLElement | null>(null);
  // Where focus goes when the form collapses (the button that opened it).
  const originRef = useRef<HTMLElement | null>(null);
  // Delete confirmation modal (refinement batch item 2.9). The trash icons
  // on rows/stories open this directly — no more two-step "open edit form,
  // then click Delete in the footer".
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleting, setDeleting] = useState(false);
  // Server-side delete-guard error rendered inside the modal.
  const [deleteGuardMsg, setDeleteGuardMsg] = useState<string | null>(null);
  // The ConfirmDialog contract is a RefObject<HTMLElement | null>; we keep
  // one ref and point it at the trash icon that opened the modal so focus
  // returns there on close. Close is also wired to read the latest trigger
  // off `deleteTarget` itself.
  const deleteTriggerRef = useRef<HTMLElement | null>(null);

  const [notice, setNotice] = useState<Notice | null>(null);
  const noticeTimer = useRef<number | null>(null);
  const [storyStatusPending, setStoryStatusPending] = useState<string | null>(null);
  const [reqStatusPending, setReqStatusPending] = useState<string | null>(null);

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
  //
  // QA-12: business = ALL BRs (unassigned + linked inside stories); technical
  // = TRs only. The previous code counted every story.reqs row as "technical"
  // even when those rows were linked BRs (and business was only the
  // unassigned §8 rows), so the Business count and filter hid every BR that
  // lived inside a story.
  const chipCounts = useMemo(() => {
    const byStatus = {} as Record<ReqStatus, number>;
    const bump = (st: ReqStatus | null) => {
      if (st) byStatus[st] = (byStatus[st] ?? 0) + 1;
    };
    let business = 0;
    let technical = 0;
    if (data && data.source === 'ok') {
      for (const r of data.businessReqs) {
        business += 1;
        bump(r.status);
      }
      for (const s of data.stories) {
        for (const r of s.reqs) {
          if (r.type === 'BR') {
            business += 1;
          } else {
            technical += 1;
          }
          bump(r.status);
        }
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
            // QA-8: edit mode sends only the fields the user actually
            // changed. The server's validateStoryPatch ignores absent
            // keys, so a legacy story whose body fields are empty can
            // still be saved by editing its title alone — the form used
            // to refuse the submit before the server was ever contacted.
            const initial = storyValuesFrom(
              data?.stories.find((s) => s.usId === form.usId) ?? {
                usId: form.usId, title: '', asA: null, iWantTo: null, soThat: null,
                priority: 'must', status: 'draft', owner: 'BA', origin: 'manual', reqs: [],
                headingLine: -1, metaLine: null, bodyLine: null, blockEnd: -1, deleted: false,
              } as StoryItem,
            );
            const patch: Partial<StoryFormValues> = {};
            if (v.title !== initial.title) patch.title = v.title;
            if (v.asA !== initial.asA) patch.asA = v.asA;
            if (v.iWantTo !== initial.iWantTo) patch.iWantTo = v.iWantTo;
            if (v.soThat !== initial.soThat) patch.soThat = v.soThat;
            if (v.priority !== initial.priority) patch.priority = v.priority;
            if (v.status !== initial.status) patch.status = v.status;
            if (v.owner !== initial.owner) patch.owner = v.owner;
            await updateStory(idOrSlug, form.usId, patch);
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
            // QA-8: edit mode sends only changed fields (same shape as
            // the story path; server's validateReqPatch ignores absent
            // keys).
            const initial = reqValuesFrom(
              [...(data?.businessReqs ?? []), ...(data?.stories.flatMap((s) => s.reqs) ?? [])].find(
                (r) => r.id === form.reqId,
              ) ?? {
                id: form.reqId, type: 'TR', text: '', priority: null, status: null, owner: null, origin: null, storyUsId: form.usId,
              } as RequirementItem,
            );
            const patch: Partial<ReqFormValues> = {};
            if (v.type !== initial.type) patch.type = v.type;
            if (v.text !== initial.text) patch.text = v.text;
            if (v.priority !== initial.priority) patch.priority = v.priority;
            if (v.status !== initial.status) patch.status = v.status;
            if (v.owner !== initial.owner) patch.owner = v.owner;
            // QA-10: pass storyUsId so the server scopes locateReq to the
            // right row once duplicate ids exist across stories.
            await updateRequirement(idOrSlug, form.reqId, patch, form.usId);
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
    [form, idOrSlug, showNotice, closeForm, load, handleError, data],
  );

  // Trash icons open the modal directly (refinement batch item 2.9). The
  // helper below builds the right DeleteTarget for a story or a req. The
  // modal itself owns the focus trap and busy state; we just hold the
  // target and a ref to the trigger so focus can return on close.
  const openDeleteForStory = useCallback((story: StoryItem) => {
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const summary = story.title ? ` — ${truncate(story.title, 60)}` : '';
    deleteTriggerRef.current = trigger;
    setDeleteTarget({
      kind: 'story',
      usId: story.usId,
      trigger,
      label: `Delete ${story.usId}${summary}`,
      copy: `Deleting ${story.usId} strikes the block and its rows in user-journeys.md — the ID is never reused.`,
    });
    setDeleteGuardMsg(null);
  }, []);

  const openDeleteForReq = useCallback((req: RequirementItem, usId: string | null) => {
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const summary = req.text ? ` — ${truncate(req.text, 60)}` : '';
    deleteTriggerRef.current = trigger;
    setDeleteTarget({
      kind: 'req',
      reqId: req.id,
      type: req.type,
      usId,
      trigger,
      label: `Delete ${req.id}${summary}`,
      copy: `Deleting ${req.id} strikes the row in its source file — the marker keeps a 30-day recovery seam.`,
    });
    setDeleteGuardMsg(null);
  }, []);

  const closeDelete = useCallback(() => {
    const trigger = deleteTarget?.trigger ?? null;
    setDeleteTarget(null);
    setDeleteGuardMsg(null);
    setDeleting(false);
    // Restore focus to the trash icon that opened the modal (mirrors the
    // ConfirmDialog pattern, but we manage it here because the trigger is
    // captured per-target, not at mount).
    if (trigger && document.body.contains(trigger)) trigger.focus();
  }, [deleteTarget]);

  // Run the actual DELETE inside the modal. 409 surfaces inline as the
  // modal's errorMessage so the user can decide next steps without losing
  // context.
  const confirmDelete = useCallback(async () => {
    if (!deleteTarget || !idOrSlug) return;
    setDeleting(true);
    try {
      if (deleteTarget.kind === 'story') {
        await deleteStory(idOrSlug, deleteTarget.usId);
        showNotice({ kind: 'success', text: `${deleteTarget.usId} deleted (struck in user-journeys.md)` });
      } else {
        // QA-10: pass usId so the server scopes locateReq to the right
        // row once duplicate ids exist across stories.
        await deleteRequirement(idOrSlug, deleteTarget.reqId, deleteTarget.usId);
        showNotice({ kind: 'success', text: `${deleteTarget.reqId} deleted (struck in its source file)` });
      }
      closeDelete();
      await load();
    } catch (e) {
      if (e instanceof RequirementsDeleteGuardError) {
        setDeleteGuardMsg(e.message);
      } else {
        showNotice({ kind: 'error', text: e instanceof Error ? e.message : 'Could not delete' });
      }
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, idOrSlug, showNotice, closeDelete, load]);

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
        // QA-10: pass storyUsId so the server scopes locateReq to the right
        // row once duplicate ids exist across stories.
        await updateRequirementStatus(idOrSlug, req.id, next, req.storyUsId);
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
      // QA-10: scope the per-story preview to the story under which the
      // form is mounted (add-req always has a usId). Edit-req uses its
      // form's usId (null for unassigned BRs).
      const type = (formValues as ReqFormValues | null)?.type ?? 'TR';
      const previewUsId = form.kind === 'req' ? (form as { usId: string | null }).usId : null;
      return `new requirement · auto-assigned as ${nextReqIdPreview(type, data, previewUsId)}`;
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
    // QA-13: edit-req forms carry a story id (the row's home story, or
    // null for unassigned BRs). Scope the lookup so a duplicate display
    // id across two stories (e.g. both have TR-001) mounts the form with
    // the right row's values. The PATCH path already scopes via
    // storyUsId; this matches the same convention client-side.
    if (form.usId === null) {
      const br = data.businessReqs.find((r) => r.id === form.reqId);
      return br ? reqValuesFrom(br) : null;
    }
    const story = data.stories.find((s) => s.usId === form.usId);
    const req = story?.reqs.find((r) => r.id === form.reqId);
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

  // ── The InlineForm slot (refinement batch items 2.7 + 2.8) ──
  // Slots: 'top' = the add-story form under the add bar; a story's usId =
  // edit-story / add-req form under that story's head; a reqId = edit-req
  // form rendered directly under that specific ReqRow (no more shared
  // 'brs' slot — edit-BR is just edit-req under the BR row).

  const renderForm = (slot: 'top' | string) => {
    if (!form || !formInitial) return null;
    // Slot match (refinement batch items 2.7 + 2.8 + QA-1):
    //  - add-story → top bar only
    //  - edit-story / add-req → the story's head slot (the add-req form
    //    carries the story id, NOT a req id — slot matches `form.usId`)
    //  - edit-req → the per-row slot (carries the req id)
    // The previous code required `'reqId' in form` for any non-story form,
    // which silently dropped add-req forms (no reqId) — clicking Add
    // requirement in a story opened state but rendered nothing (QA-1).
    const belongsHere =
      form.mode === 'add' && form.kind === 'story'
        ? slot === 'top'
        : form.kind === 'story'
          ? slot === form.usId
          : form.mode === 'add'
            ? slot === form.usId
            : 'reqId' in form && slot === form.reqId;
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
              /* Zero-stories empty state (AC-8): one CTA, story-first. The form
                 slot rides along — without it the CTA sets form state nothing
                 ever mounts, and the click is a silent no-op. */
              <>
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
                {renderForm('top')}
              </>
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

                {/* Business requirements group — only the *unassigned* BRs
                    (those without a `<!-- BR-NNN: story=US-NN -->` link, or
                    whose story no longer exists) live here. Linked BRs are
                    rendered inside their story's reqs list (refinement batch
                    item 2.7). */}
                {filtered && filtered.businessReqs.length > 0 && (
                  <div className="story brs-group">
                    <div className="story-head">
                      <div className="story-id">BRs</div>
                      <div className="story-body">
                        <div className="story-title">Unassigned business requirements</div>
                        <div className="story-as">
                          PRD §8 rows that aren't attached to a user story. New BRs are added
                          from a story's header (story-first), so this list shrinks as stories
                          are written. Legacy rows (from before story links existed) start here.
                        </div>
                      </div>
                      <div className="story-meta">
                        <span className="story-count">{filtered.businessReqs.length} reqs</span>
                      </div>
                    </div>
                    <div className="req-list" role="list">
                      {filtered.businessReqs.map((req) => (
                        <ReqRow
                          key={req.id}
                          req={req}
                          statusPending={reqStatusPending === req.id}
                          onEdit={() => openForm({ mode: 'edit', kind: 'req', reqId: req.id, usId: null })}
                          onDelete={() => openDeleteForReq(req, null)}
                          onStatusChange={(next) => void changeReqStatus(req, next)}
                          editFormNode={renderForm(req.id)}
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
                    editFormFor={(reqId) => renderForm(reqId)}
                    flash={false}
                    statusPendingStory={storyStatusPending === story.usId}
                    statusPendingReqId={reqStatusPending}
                    onEditStory={() => openForm({ mode: 'edit', kind: 'story', usId: story.usId })}
                    onAddReq={() => openForm({ mode: 'add', kind: 'req', usId: story.usId })}
                    // Delete is a direct modal (item 2.9), not a two-step form strip.
                    onDeleteStory={() => openDeleteForStory(story)}
                    onStoryStatus={(next) => void changeStoryStatus(story, next)}
                    onReqEdit={(req) => openForm({ mode: 'edit', kind: 'req', reqId: req.id, usId: story.usId })}
                    onReqDelete={(req) => openDeleteForReq(req, story.usId)}
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

      {/* Delete confirmation (refinement batch item 2.9) — opens directly
          from the row trash icon. Renders as a portal at document.body. The
          409 (referenced-by) path surfaces its message inside the modal so
          the user can read it without losing the destructive context. */}
      <ConfirmDialog
        open={deleteTarget != null}
        title={deleteTarget?.label ?? ''}
        description={deleteTarget?.copy ?? ''}
        confirmLabel={deleting ? 'Deleting…' : 'Delete'}
        cancelLabel="Cancel"
        busy={deleting}
        errorMessage={deleteGuardMsg}
        triggerRef={deleteTriggerRef}
        onConfirm={() => void confirmDelete()}
        onClose={closeDelete}
      />
    </div>
  );
}