// Requirements tab (screen 15, requirements.html v5.3) — the feature-grouped
// BR/TR/AC source of truth (requirements redesign, slices 1-3). One form open
// at a time across the screen (spec UX), optimistic status changes with
// snap-back + toast, delete via the edit form's two-step strip, and the
// delete-guard 409 surfaced inline with a scroll-and-flash escape hatch. No
// TanStack Query (plan §2): a plain fetch + reload after every successful
// mutation.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useOutletContext, useParams } from 'react-router-dom';
import {
  createAc,
  createFeature,
  createRequirement,
  deleteAc,
  deleteFeature,
  deleteRequirement,
  fetchRequirements,
  fetchRequirementsGenerationStatus,
  triggerRequirementsGeneration,
  RequirementsDeleteGuardError,
  RequirementsValidationError,
  updateAc,
  updateFeature,
  updateRequirement,
  updateRequirementStatus,
  type AcItem,
  type RequirementsResponse,
  type RequirementsGenerationStatus,
  type RequirementItem,
  type FeatureItem,
  type FeaturePatch,
  type ReqStatus,
} from '../../lib/api';
import { nextFreeId } from '../../../server/requirements-model';
import type { ProjectOutletContext } from '../ProjectDetailScreen';
import { ConfirmDialog } from '../ConfirmDialog';
import { InlineForm, type FormValues, type FeatureFormValues, type ReqFormValues } from './InlineForm';
import { AcForm, type AcFormValues } from './AcForm';
import { FilterBar } from './FilterBar';
import { FeatureGroup } from './FeatureGroup';
import { ReqRow } from './ReqRow';
import {
  applyFilters,
  deriveTotals,
  EMPTY_FILTER,
  nextFeatureIdPreview,
  nextReqIdPreview,
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
// icons on rows/features open the modal directly (refinement batch item 2.9).
// Unlike stories, features strike cleanly (their reqs/ACs live inside the
// block), so no linked-referencer escape hatch is needed here.
type DeleteTarget =
  | { kind: 'feature'; feId: string; trigger: HTMLElement | null; label: string; copy: string }
  | { kind: 'ac'; acId: string; trigger: HTMLElement | null; label: string; copy: string }
  | {
      kind: 'req';
      reqId: string;
      type: 'BR' | 'TR';
      feId: string | null;
      trigger: HTMLElement | null;
      label: string;
      copy: string;
    };

// Client-side field errors keyed the same way the server's {errors} payload
// keys them, so InlineForm merges both sources unchanged.
const DEFAULT_FEATURE_VALUES: FeatureFormValues = {
  title: '',
  description: '',
  source: '',
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

const DEFAULT_AC_VALUES: AcFormValues = { text: '', status: 'unmet' };

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
  const [formValues, setFormValues] = useState<(FormValues | AcFormValues) | null>(null);
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
  // on rows/features open this directly — no more two-step "open edit form,
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
  const [featureStatusPending, setFeatureStatusPending] = useState<string | null>(null);
  const [reqStatusPending, setReqStatusPending] = useState<string | null>(null);
  const [acPendingId, setAcPendingId] = useState<string | null>(null);
  // In-flight BA Agent auto‑generation of features / ACs / BR / TR.
  const [reqGenStatus, setReqGenStatus] = useState<RequirementsGenerationStatus | null>(null);

  useEffect(() => {
    if (data?.source !== 'ok') return;
    (async () => {
      try {
        const status = await fetchRequirementsGenerationStatus(idOrSlug);
        setReqGenStatus(status);
      } catch { /* silently hide bar when server is unreachable */ }
    })();
    if (reqGenStatus?.status === 'generating') {
      const t = setInterval(async () => {
        try { await fetchRequirementsGenerationStatus(idOrSlug).then(setReqGenStatus); } catch { /* silent */ }
      }, 3000);
      return () => clearInterval(t);
    }
  }, [data?.source, idOrSlug, reqGenStatus?.status]);


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

  // When a generation run finishes, the rows behind this screen changed on
  // disk — refetch so the new features/ACs/BR/TR appear without a remount.
  // Only the generating → done transition refetches; an initial read that is
  // already 'done' is covered by the mount-time load().
  const prevGenStatus = useRef<string | null>(null);
  useEffect(() => {
    const status = reqGenStatus?.status ?? null;
    if (status === 'done' && prevGenStatus.current === 'generating') void load();
    prevGenStatus.current = status;
  }, [reqGenStatus?.status, load]);

  // Retry after a failed generation run — the failed state is re-triggerable
  // server-side (the retry generates only the sections the failed run
  // didn't finish), so the recovery path lives here next to the banner.
  const [reqGenRetrying, setReqGenRetrying] = useState(false);
  const retryReqGen = useCallback(async () => {
    try {
      await triggerRequirementsGeneration(idOrSlug);
      const status = await fetchRequirementsGenerationStatus(idOrSlug);
      setReqGenStatus(status);
    } catch (err) {
      showNotice({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Could not retry requirements generation',
      });
    } finally {
      setReqGenRetrying(false);
    }
  }, [idOrSlug, showNotice]);

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
  // Feature-first carry-over of QA-12: business = ALL BRs (unassigned + the
  // ones linked inside feature blocks); technical = TRs only. Feature blocks
  // contribute their own status to the status chips (a feature has a
  // ReqStatus even though it has no BR/TR type).
  const chipCounts = useMemo(() => {
    const byStatus = {} as Record<ReqStatus, number>;
    const bump = (st: ReqStatus | null) => {
      if (st) byStatus[st] = (byStatus[st] ?? 0) + 1;
    };
    let business = 0;
    let technical = 0;
    if (data && data.source === 'ok') {
      for (const f of data.features) {
        bump(f.status);
        for (const r of f.reqs) {
          if (r.type === 'BR') {
            business += 1;
          } else {
            technical += 1;
          }
          bump(r.status);
        }
      }
      for (const r of data.businessReqs) {
        business += 1;
        bump(r.status);
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

  const featureValuesFrom = (feature: FeatureItem): FeatureFormValues => ({
    title: feature.title,
    description: feature.description,
    source: feature.source ?? '',
    priority: feature.priority ?? 'must',
    status: feature.status ?? 'draft',
    owner: feature.owner ?? 'BA',
  });

  const reqValuesFrom = (req: RequirementItem): ReqFormValues => ({
    type: req.type,
    text: req.text,
    priority: req.priority ?? 'must',
    status: req.status ?? 'draft',
    owner: req.owner ?? 'BA',
  });

  const acValuesFrom = (ac: AcItem): AcFormValues => ({
    text: ac.text,
    status: ac.status ?? 'unmet',
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
    async (values: FormValues | AcFormValues) => {
      if (!form || !idOrSlug) return;
      setSubmitting(true);
      try {
        if (form.kind === 'feature') {
          const v = values as FeatureFormValues;
          if (form.mode === 'add') {
            await createFeature(idOrSlug, {
              title: v.title,
              description: v.description,
              // Empty source string = "no source link" — the server stores null.
              source: v.source === '' ? null : v.source,
              priority: v.priority,
              status: v.status,
              owner: v.owner,
            });
            showNotice({ kind: 'success', text: 'Feature created' });
          } else {
            // QA-8: edit mode sends only the fields the user actually
            // changed. The server's validateFeaturePatch ignores absent
            // keys, so a legacy feature with empty optional fields can
            // still be saved by editing its title alone.
            const initial = featureValuesFrom(
              data?.features.find((f) => f.feId === form.feId) ?? {
                feId: form.feId, title: '', description: '', source: null,
                priority: 'must', status: 'draft', owner: 'BA', origin: 'manual',
                acs: [], reqs: [],
              } as FeatureItem,
            );
            const patch: FeaturePatch = {};
            if (v.title !== initial.title) patch.title = v.title;
            if (v.description !== initial.description) patch.description = v.description;
            if (v.source !== initial.source) patch.source = v.source === '' ? null : v.source;
            if (v.priority !== initial.priority) patch.priority = v.priority;
            if (v.status !== initial.status) patch.status = v.status;
            if (v.owner !== initial.owner) patch.owner = v.owner;
            await updateFeature(idOrSlug, form.feId, patch);
            showNotice({ kind: 'success', text: `${form.feId} updated` });
          }
        } else if (form.kind === 'req') {
          const v = values as ReqFormValues;
          if (form.mode === 'add') {
            await createRequirement(idOrSlug, form.feId, {
              type: v.type,
              text: v.text,
              priority: v.priority,
              status: v.status,
              owner: v.owner,
            });
            showNotice({
              kind: 'success',
              text:
                v.type === 'BR'
                  ? `Business requirement added to ${form.feId}`
                  : `Technical requirement added to ${form.feId}`,
            });
          } else {
            // QA-8: edit mode sends only changed fields (same shape as
            // the feature path; server's validateReqPatch ignores absent
            // keys).
            const initial = reqValuesFrom(
              [
                ...(data?.businessReqs ?? []),
                ...(data?.features.flatMap((f) => f.reqs) ?? []),
              ].find((r) => r.id === form.reqId) ?? {
                id: form.reqId, type: 'TR', text: '', priority: null, status: null,
                owner: null, origin: null, featureId: form.feId,
              } as RequirementItem,
            );
            const patch: Partial<ReqFormValues> = {};
            if (v.type !== initial.type) patch.type = v.type;
            if (v.text !== initial.text) patch.text = v.text;
            if (v.priority !== initial.priority) patch.priority = v.priority;
            if (v.status !== initial.status) patch.status = v.status;
            if (v.owner !== initial.owner) patch.owner = v.owner;
            // QA-10: pass feId (may be null for unassigned BRs) so the
            // server scopes locateReq to the right row once duplicate ids
            // exist across feature blocks.
            await updateRequirement(idOrSlug, form.reqId, patch, form.feId);
            showNotice({ kind: 'success', text: `${form.reqId} updated` });
          }
        } else {
          const v = values as AcFormValues;
          if (form.mode === 'add') {
            await createAc(idOrSlug, form.feId, { text: v.text, status: v.status });
            showNotice({ kind: 'success', text: `Criterion added to ${form.feId}` });
          } else {
            // QA-8 for ACs: only changed fields. (AC ids are unique across
            // the file, so no feId scoping is needed on the PATCH path.)
            const initial = acValuesFrom(
              data?.features.flatMap((f) => f.acs).find((a) => a.id === form.acId) ?? {
                id: form.acId, text: '', status: 'unmet', origin: null,
              } as AcItem,
            );
            const patch: Partial<AcFormValues> = {};
            if (v.text !== initial.text) patch.text = v.text;
            if (v.status !== initial.status) patch.status = v.status;
            await updateAc(idOrSlug, form.acId, patch);
            showNotice({ kind: 'success', text: `${form.acId} updated` });
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
  // helpers below build the right DeleteTarget for a feature, an AC, or a
  // req. The modal itself owns the focus trap and busy state; we just hold
  // the target and a ref to the trigger so focus can return on close.
  const openDeleteForFeature = useCallback((feature: FeatureItem) => {
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const summary = feature.title ? ` — ${truncate(feature.title, 60)}` : '';
    deleteTriggerRef.current = trigger;
    setDeleteTarget({
      kind: 'feature',
      feId: feature.feId,
      trigger,
      label: `Delete ${feature.feId}${summary}`,
      copy: `Deleting ${feature.feId} strikes the block and its rows in features.md — the ID is never reused.`,
    });
    setDeleteGuardMsg(null);
  }, []);

  const openDeleteForAc = useCallback((ac: AcItem) => {
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const summary = ac.text ? ` — ${truncate(ac.text, 60)}` : '';
    deleteTriggerRef.current = trigger;
    setDeleteTarget({
      kind: 'ac',
      acId: ac.id,
      trigger,
      label: `Delete ${ac.id}${summary}`,
      copy: `Deleting ${ac.id} strikes the row in features.md — the marker keeps a 30-day recovery seam.`,
    });
    setDeleteGuardMsg(null);
  }, []);

  const openDeleteForReq = useCallback((req: RequirementItem, feId: string | null) => {
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const summary = req.text ? ` — ${truncate(req.text, 60)}` : '';
    deleteTriggerRef.current = trigger;
    setDeleteTarget({
      kind: 'req',
      reqId: req.id,
      type: req.type,
      feId,
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
      if (deleteTarget.kind === 'feature') {
        await deleteFeature(idOrSlug, deleteTarget.feId);
        showNotice({ kind: 'success', text: `${deleteTarget.feId} deleted (struck in features.md)` });
      } else if (deleteTarget.kind === 'ac') {
        await deleteAc(idOrSlug, deleteTarget.acId);
        showNotice({ kind: 'success', text: `${deleteTarget.acId} deleted (struck in features.md)` });
      } else {
        // QA-10: pass feId (may be null for unassigned BRs) so the server
        // scopes locateReq to the right row once duplicate ids exist.
        await deleteRequirement(idOrSlug, deleteTarget.reqId, deleteTarget.feId);
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

  const changeFeatureStatus = useCallback(
    async (feature: FeatureItem, next: ReqStatus) => {
      if (!idOrSlug) return;
      setFeatureStatusPending(feature.feId);
      setData((d) =>
        d
          ? {
              ...d,
              features: d.features.map((f) =>
                f.feId === feature.feId ? { ...f, status: next } : f,
              ),
            }
          : d,
      );
      try {
        await updateFeature(idOrSlug, feature.feId, { status: next });
        await reloadQuiet();
      } catch (e) {
        await reloadQuiet();
        showNotice({
          kind: 'error',
          text: e instanceof Error ? e.message : `Could not update ${feature.feId} status`,
        });
      } finally {
        setFeatureStatusPending(null);
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
              features: d.features.map((f) => ({
                ...f,
                reqs: f.reqs.map((r) => (r.id === req.id ? { ...r, status: next } : r)),
              })),
            }
          : d,
      );
      try {
        // QA-10: pass featureId (may be null for unassigned BRs) so the
        // server scopes locateReq to the right row once duplicate ids exist
        // across feature blocks.
        await updateRequirementStatus(idOrSlug, req.id, next, req.featureId);
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

  const changeAcStatus = useCallback(
    async (ac: AcItem, next: 'met' | 'unmet') => {
      if (!idOrSlug) return;
      setAcPendingId(ac.id);
      setData((d) =>
        d
          ? {
              ...d,
              features: d.features.map((f) => ({
                ...f,
                acs: f.acs.map((a) => (a.id === ac.id ? { ...a, status: next } : a)),
              })),
            }
          : d,
      );
      try {
        await updateAc(idOrSlug, ac.id, { status: next });
        await reloadQuiet();
      } catch (e) {
        await reloadQuiet();
        showNotice({
          kind: 'error',
          text: e instanceof Error ? e.message : `Could not update ${ac.id} status`,
        });
      } finally {
        setAcPendingId(null);
      }
    },
    [idOrSlug, reloadQuiet, showNotice],
  );

  // ── Derived render data ────────────────────────────────────────────────────

  const formIdLine = useMemo(() => {
    if (!form || !data || data.source !== 'ok') return '';
    if (form.mode === 'add') {
      if (form.kind === 'feature') {
        return `new feature · auto-assigned as ${nextFeatureIdPreview(data.features)}`;
      }
      if (form.kind === 'req') {
        // QA-10: scope the per-feature preview to the feature under which
        // the form is mounted (add-req always has a feId).
        const type = (formValues as ReqFormValues | null)?.type ?? 'TR';
        return `new requirement · auto-assigned as ${nextReqIdPreview(type, data, form.feId)}`;
      }
      const acs = data.features.find((f) => f.feId === form.feId)?.acs ?? [];
      return `new criterion · auto-assigned as ${nextFreeId(acs.map((a) => a.id), 'AC')}`;
    }
    if (form.mode === 'edit') {
      if (form.kind === 'feature') return form.feId;
      if (form.kind === 'req') return form.reqId;
      return form.acId;
    }
    return '';
  }, [form, data, formValues]);

  // Initial values are read at mount (the forms capture them once); the key
  // below guarantees a remount whenever the form target changes.
  const formInitial: FormValues | AcFormValues | null = useMemo(() => {
    if (!form || !data) return null;
    if (form.mode === 'add') {
      if (form.kind === 'feature') return DEFAULT_FEATURE_VALUES;
      if (form.kind === 'req') return { ...DEFAULT_REQ_VALUES, type: 'TR' };
      return DEFAULT_AC_VALUES;
    }
    if (form.kind === 'feature') {
      const feature = data.features.find((f) => f.feId === form.feId);
      return feature ? featureValuesFrom(feature) : null;
    }
    if (form.kind === 'req') {
      // QA-13: edit-req forms carry the row's home feature id (or null for
      // unassigned BRs). Scope the lookup so a duplicate display id across
      // two blocks (e.g. both have TR-001) mounts the form with the right
      // row's values. The PATCH path already scopes via feId; this matches
      // the same convention client-side.
      if (form.feId === null) {
        const br = data.businessReqs.find((r) => r.id === form.reqId);
        return br ? reqValuesFrom(br) : null;
      }
      const feature = data.features.find((f) => f.feId === form.feId);
      const req = feature?.reqs.find((r) => r.id === form.reqId);
      return req ? reqValuesFrom(req) : null;
    }
    const ac = data.features.flatMap((f) => f.acs).find((a) => a.id === form.acId);
    return ac ? acValuesFrom(ac) : null;
  }, [form, data]);

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
            <code>features.md</code> — it is created in the <b>Project Background</b> tab
            as the BA workspace is reviewed.
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

  const emptyProject = data.features.length === 0 && data.businessReqs.length === 0;

  // ── The form slot (refinement batch items 2.7 + 2.8) ──
  // Slots: 'top' = the add-feature form under the add bar; a feature's feId
  // = edit-feature / add-req / add-ac form under that feature's head; a
  // reqId = edit-req form rendered directly under that specific ReqRow; an
  // acId = edit-ac form rendered directly under that specific AC row.

  const renderForm = (slot: 'top' | string) => {
    if (!form || !formInitial) return null;
    // Slot match (refinement batch items 2.7 + 2.8 + QA-1):
    //  - add-feature → top bar only
    //  - edit-feature / add-req / add-ac → the feature's head slot
    //  - edit-req → the per-row slot (carries the req id)
    //  - edit-ac → the per-row slot (carries the ac id)
    const belongsHere =
      form.mode === 'add' && form.kind === 'feature'
        ? slot === 'top'
        : form.mode === 'edit' && form.kind === 'feature'
          ? slot === form.feId
          : form.mode === 'add'
            ? slot === form.feId
            : form.kind === 'req'
              ? slot === form.reqId
              : slot === form.acId;
    if (!belongsHere) return null;
    if (form.kind === 'ac') {
      return (
        <AcForm
          key={`${form.kind}-${form.mode}-${slot}-${form.mode === 'edit' ? form.acId : 'new'}`}
          formId={formIdLine}
          initial={formInitial as AcFormValues}
          errors={formErrors}
          submitting={submitting}
          onDirtyChange={setDirty}
          onValuesChange={setFormValues}
          onSubmit={(v) => void submitForm(v)}
          onCancel={closeForm}
        />
      );
    }
    return (
      <InlineForm
        key={`${form.kind}-${form.mode}-${slot}-${form.kind === 'req' && form.mode === 'edit' ? form.reqId : ''}`}
        mode={form.mode}
        kind={form.kind}
        formId={formIdLine}
        heading={
          form.kind === 'feature'
            ? 'Feature'
            : form.mode === 'add'
              ? `Requirement in ${form.feId}`
              : 'Requirement'
        }
        initial={formInitial as FormValues}
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
            {totals?.total ?? 0} business &amp; technical requirements · grouped by feature
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

      {/* In‑flight BA Agent generation progress per §8 spec — phase-aware.
          Generation is ONE large batch per section (the model returns its full
          section at once; rows splice only after the response parses), so the
          feature count is unknowable mid-call — the banner shows a live elapsed
          clock + step counter until the first rows land, then live row counts.
          Accessibility markers from the design state spec: role=status +
          aria-live=polite, text-only changes under the same live region. */}
      {reqGenStatus?.status === 'generating' && (
        <div className="ba-warn" role="status" aria-live="polite">
          <b>BA Agent generating features and requirements</b> —{' '}
          {reqGenStatus.result && reqGenStatus.result.featuresGenerated > 0 ? (
            <>
              wrote {reqGenStatus.result.featuresGenerated} features ({reqGenStatus.result.acsGenerated}{' '}
              acceptance criteria) · now generating {reqGenStatus.currentSection ?? 'requirements'} —{' '}
              {reqGenStatus.progress.generated} of {reqGenStatus.progress.total} steps done.
            </>
          ) : reqGenStatus.sectionStartedAt ? (
            <>
              calling the {reqGenStatus.currentSection ?? 'requirements'} model…{' '}
              {Math.max(0, Math.round((Date.now() - reqGenStatus.sectionStartedAt) / 1000))}s elapsed ·{' '}
              {reqGenStatus.progress.generated} of {reqGenStatus.progress.total} steps done.
            </>
          ) : (
            <>
              {reqGenStatus.currentSection ? `${reqGenStatus.currentSection} · ` : ''}
              {reqGenStatus.progress.generated} of {reqGenStatus.progress.total} steps done.
            </>
          )}
          You can still manually add features below.
        </div>
      )}

      {reqGenStatus?.status === 'done' && (
        <div className="toast" role="status" aria-live="polite">
          <span className="toast-dot" aria-hidden="true" />
          BA Agent finished generating requirements{reqGenStatus.result
            ? ` — ${reqGenStatus.result.featuresGenerated} features, ${reqGenStatus.result.brsGenerated} business and ${reqGenStatus.result.trsGenerated} technical requirements ready.`
            : ` — ${reqGenStatus.progress.generated} of ${reqGenStatus.progress.total} steps done.`}
        </div>
      )}

      {reqGenStatus?.status === 'failed' && (
        <div className="ba-warn" role="alert">
          <b>Requirements generation failed</b>
          {reqGenStatus.error ? ` — ${reqGenStatus.error}` : ' — retry to continue.'}{' '}
          <button type="button" className="btn btn-secondary" disabled={reqGenRetrying} onClick={() => { setReqGenRetrying(true); void retryReqGen(); }}>
            {reqGenRetrying ? 'Retrying…' : 'Retry'}
          </button>
        </div>
      )}

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
                Reads <code>features.md</code>
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
              /* Zero-features empty state (AC-8): one CTA, feature-first. The form
                 slot rides along — without it the CTA sets form state nothing
                 ever mounts, and the click is a silent no-op. */
              <>
                <div className="req-empty">
                  <h2>No requirements yet</h2>
                  <p>
                    Start with a <b>feature</b> — once one exists you can add BR / TR
                    requirements and acceptance criteria to it from inside that feature's header.
                  </p>
                  <button type="button" className="btn btn-primary" aria-label="Add your first feature" onClick={() => openForm({ mode: 'add', kind: 'feature' })}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true"><path d="M12 5v14 M5 12h14"/></svg>
                    Add your first feature
                  </button>
                </div>
                {renderForm('top')}
              </>
            ) : (
              <>
                {/* Add bar — feature-first: only "Add feature" lives here (spec UI). */}
                <div className="req-add-bar" role="region" aria-label="Add a new feature">
                  <div className="label">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v8 M8 12h8"/></svg>
                    <span>
                      <b>BA controls.</b> Start with a <b>feature</b> — once a feature exists you
                      can add BR / TR requirements and acceptance criteria to it from inside
                      that feature's header.
                    </span>
                  </div>
                  <button type="button" className="btn btn-primary" aria-label="Add a new feature" onClick={() => openForm({ mode: 'add', kind: 'feature' })}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true"><path d="M12 5v14 M5 12h14"/></svg>
                    Add feature
                  </button>
                </div>

                {renderForm('top') /* the add-feature form lives under the add bar */}

                {filtered && (
                  <FilterBar filter={filter} onChange={setFilter} counts={chipCounts} />
                )}

                {/* Unassigned business requirements group — only the BRs
                    without a feature link (or whose feature no longer
                    exists) live here. Linked BRs are rendered inside their
                    feature's reqs list (refinement batch item 2.7). */}
                {filtered && filtered.businessReqs.length > 0 && (
                  <div className="story brs-group">
                    <div className="story-head">
                      <div className="story-id">BRs</div>
                      <div className="story-body">
                        <div className="story-title">Unassigned business requirements</div>
                        <div className="story-as">
                          Business requirements that aren't attached to a feature yet. New
                          BRs are added from a feature's header (feature-first), so this
                          list shrinks as features are written.
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
                          onEdit={() => openForm({ mode: 'edit', kind: 'req', reqId: req.id, feId: null })}
                          onDelete={() => openDeleteForReq(req, null)}
                          onStatusChange={(next) => void changeReqStatus(req, next)}
                          editFormNode={renderForm(req.id)}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {filtered && filtered.features.map((feature) => (
                  <FeatureGroup
                    key={feature.feId}
                    feature={feature}
                    openForm={form}
                    renderForm={() => renderForm(feature.feId)}
                    editFormFor={(reqId) =>
                      // Guard the per-row slot by feId so a duplicate req id
                      // in another feature block never renders a second form.
                      form && form.kind === 'req' && form.mode === 'edit' && form.feId === feature.feId
                        ? renderForm(reqId)
                        : null
                    }
                    editFormForAc={(acId) =>
                      form && form.kind === 'ac' && form.mode === 'edit' && form.feId === feature.feId
                        ? renderForm(acId)
                        : null
                    }
                    flash={false}
                    statusPendingFeature={featureStatusPending === feature.feId}
                    statusPendingReqId={reqStatusPending}
                    acPendingId={acPendingId}
                    onEditFeature={() => openForm({ mode: 'edit', kind: 'feature', feId: feature.feId })}
                    onAddReq={() => openForm({ mode: 'add', kind: 'req', feId: feature.feId })}
                    onAddAc={() => openForm({ mode: 'add', kind: 'ac', feId: feature.feId })}
                    // Delete is a direct modal (item 2.9), not a two-step form strip.
                    onDeleteFeature={() => openDeleteForFeature(feature)}
                    onFeatureStatus={(next) => void changeFeatureStatus(feature, next)}
                    onReqEdit={(req) => openForm({ mode: 'edit', kind: 'req', reqId: req.id, feId: feature.feId })}
                    onReqDelete={(req) => openDeleteForReq(req, req.featureId)}
                    onReqStatus={(req, next) => void changeReqStatus(req, next)}
                    onAcEdit={(ac) => openForm({ mode: 'edit', kind: 'ac', feId: feature.feId, acId: ac.id })}
                    onAcDelete={(ac) => openDeleteForAc(ac)}
                    onAcStatus={(ac, next) => void changeAcStatus(ac, next)}
                  />
                ))}

                {filtered && filtered.features.length === 0 && filtered.businessReqs.length === 0 && (
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