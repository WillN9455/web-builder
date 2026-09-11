// Requirements-generation invocation — triggers the BA Agent to auto-generate
// feature specs (each with AC + TR rows) + business requirements from approved
// Project Background artifacts, splicing them into the canonical Requirements
// surfaces via requirements-model's insert helpers (req-gen-splice.ts):
//   - feature blocks (ACs + TRs inside) → features.md (same write surface as
//     POST /features — append-only, existing blocks byte-identical)
//   - BR rows → prd.md §8 (after the last existing row's trailing meta)
// The targets are members of the 17-artifact approval gate, so regeneration
// by file replacement would destroy approved content — splicing is the whole
// design (SA P0 call). Generated rows stamp origin=generated so they are
// traceable and mechanically cleanable.

import fs from 'node:fs';
import path from 'node:path';
import { readReqGenState, writeReqGenState } from './req-gen-state.js';
import {
  BUSINESS_SECTION,
  FEATURES_SECTION,
  fileHasGeneratedRows as fileTextHasGeneratedRows,
  reconcileBusinessReqs,
  reconcileFeatures,
  reconcileSectionsDone,
  requireRows,
  REQ_GEN_SECTIONS,
  spliceBusinessReqs,
  spliceFeatures,
  type DesiredAc,
  type DesiredBr,
  type DesiredFeature,
  type DesiredTr,
  type GenAc,
  type GenBr,
  type GenFeature,
} from './req-gen-splice.js';
import { getProjectRow, resolveProjectFolder, readStatuses, BA_ARTIFACTS, type ProjectRow } from './ba-workspace.js';
import { parseBusinessReqs, parseFeatures, type FeatureRow, type ReqRow } from './requirements-model.js';
import { atomicWritePrd, prdFilePath } from './prd-fs.js';
import { db } from './db.js';
import { MODEL, OLLAMA } from './intake.js';

// ── The generation sections (the job's progress units) ─────────────────────
// One Ollama call per section, run in order. This is the single source of
// truth for the progress total — the status route reads the same length.

// The section list + reconcile live in the pure module (req-gen-splice.ts);
// re-exported here — ba-workspace.ts reads the length as the progress total.
export { REQ_GEN_SECTIONS };

// ── Timings ────────────────────────────────────────────────────────────────
// A local model can spend minutes per section; a heartbeat interval (not
// section boundaries) keeps lastHeartbeatAt fresh for the reconciled read in
// req-gen-state.ts (stale → failed → re-triggerable).
const HEARTBEAT_MS = 30_000;
const CALL_TIMEOUT_MS = 15 * 60_000;
const MAX_CONTEXT_CHARS = 48_000; // idea.md + all approved artifact bodies

// ── In-process guard: one req-gen run per project at a time. ───────────────

const running = new Set<number>();

// ── Public API ──────────────────────────────────────────────────────────────

export type TriggerResult = { ok: true; generationId: string } | { ok: false; error: string };

/**
 * Trigger requirements generation for a project. Idempotent within one
 * heartbeat — returns alreadyRunning when a fresh invocation races with an
 * in-flight run that has no persisted terminal state yet.
 */
export function triggerRequirementsGeneration(projectId: number): TriggerResult {
  if (running.has(projectId)) return { ok: false, error: 'Already running' };

  const row = getProjectRow(String(projectId));
  if (!row) return { ok: false, error: 'Project not found' };

  // Check all 17 are approved
  const statuses = readStatuses(row.id);
  for (const artifact of BA_ARTIFACTS) {
    if ((statuses.get(artifact) ?? 'draft') !== 'approved') {
      return { ok: false, error: `Artifact ${artifact} is not Approved` };
    }
  }

  // Check context is confirmed
  const ctx = db
    .prepare('SELECT confirmed FROM ba_context WHERE project_id = ?')
    .get(projectId) as { confirmed: number } | undefined;
  if (!ctx || !ctx.confirmed) {
    return { ok: false, error: 'Project context not confirmed yet' };
  }

  // Re-check on disk (the DB status can lag the file system after manual edits)
  const prdDirPath = path.join(resolveProjectFolder(row), 'PRD');
  for (const artifact of BA_ARTIFACTS) {
    if (!fs.existsSync(path.join(prdDirPath, artifact))) {
      return { ok: false, error: `Artifact ${artifact} is missing from disk` };
    }
  }

  const existing = readReqGenState(projectId);
  // Stale pending/generating states were already reconciled to failed by the
  // read, so a server restart mid-run is re-triggerable here.
  if (existing && (existing.state === 'pending' || existing.state === 'generating')) {
    return { ok: false, error: 'Already running' };
  }
  // A completed run 409s rather than silently duplicating rows — unless the
  // user deleted every generated row, or an approved artifact reverted since
  // the run finished (artifactsChanged, set by the transition routes), in
  // which case the next run runs in reconcile mode: diff against the existing
  // origin=generated rows instead of appending duplicates.
  const reconcile = Boolean(existing?.artifactsChanged);
  if (existing && existing.state === 'done' && hasGeneratedRows(row) && !reconcile) {
    return {
      ok: false,
      error: 'Requirements already generated — delete the generated rows to regenerate.',
    };
  }

  // Init state (the trigger owns state init — routes must not pre-write).
  // A failed run's completed sections carry over so the retry only generates
  // the missing ones (no duplicated rows); a done run starts fresh. A
  // reconcile run always starts fresh — "pass through all" is the contract
  // (every section reconsiders the full desired set, not just missing ones).
  // A failed reconcile retry also re-enters reconcile: the flag below keeps
  // `artifactsChanged` true on the failed state, so this must not depend on
  // the previous run's state being 'done'.
  const reconcileMode = reconcile;
  const sectionsDone =
    !reconcileMode && existing && existing.state === 'failed' ? (existing.sectionsDone ?? []) : [];
  writeReqGenState(projectId, {
    state: 'pending',
    generated: 0,
    total: REQ_GEN_SECTIONS.length,
    currentSection: null,
    startedAt: Date.now(),
    lastHeartbeatAt: Date.now(),
    error: null,
    sectionsDone,
    // Carry the stale flag through the run — every mid-run write spreads the
    // last persisted state, so dropping it here would lose it on a failed
    // run (only terminal 'done' clears it explicitly, below).
    artifactsChanged: reconcileMode,
    // Persisted so the status route can label the run and a crashed job's
    // retry (failed state) still knows how it was running.
    mode: reconcileMode ? 'reconcile' : 'generate',
  });

  running.add(projectId);
  void runRequirementsJob(projectId)
    .catch((err) => {
      console.error('[agent-invoker] req-gen job crashed:', err);
      // Spread the job's last persisted write so mode + artifactsChanged
      // survive a crash — a retry must resume the same mode, and a reconcile
      // run must stay re-triggerable from the confirmed card (a failed run
      // never clears the flag; only terminal 'done' does).
      const last = readReqGenState(projectId);
      const done = last?.sectionsDone ?? sectionsDone;
      writeReqGenState(projectId, {
        ...last,
        state: 'failed',
        generated: done.length,
        total: REQ_GEN_SECTIONS.length,
        currentSection: null,
        startedAt: last?.startedAt ?? Date.now(),
        error: 'Generation crashed — retry to continue.',
        sectionsDone: done,
      });
    })
    .finally(() => running.delete(projectId));

  return { ok: true, generationId: `${projectId}-${Date.now()}` };
}

function fileHasGeneratedRows(filePath: string): boolean {
  try {
    return fs.existsSync(filePath) && fileTextHasGeneratedRows(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return true; // can't prove the rows are gone — fail safe against duplication
  }
}

// Any persisted origin=generated marker (feature/AC/TR meta, or BR meta)
// means generated rows are still present on disk.
function hasGeneratedRows(row: ProjectRow): boolean {
  const dir = path.join(resolveProjectFolder(row), 'PRD');
  return (
    fileHasGeneratedRows(path.join(dir, 'features.md')) ||
    fileHasGeneratedRows(path.join(dir, 'prd.md'))
  );
}

// ── Context assembly (approved artifacts as prompt context, PRD-weighted) ──

function buildContext(row: ProjectRow): string | null {
  try {
    const lines: string[] = [];
    const folder = resolveProjectFolder(row);
    const prdDirPath = path.join(folder, 'PRD');

    // Read idea.md first — it is the primary seed.
    const ideaPath = path.join(folder, 'idea.md');
    if (fs.existsSync(ideaPath)) {
      lines.push('## Project Idea (seed)');
      lines.push(fs.readFileSync(ideaPath, 'utf-8').trim());
      lines.push('');
    }

    // PRD-weighted ordering (spec §3): the core-PRD artifacts the output
    // leans on come immediately after the seed, so the character cap below
    // truncates the tail bands — never the PRD.
    const coreFirst = ['prd.md', 'user-journeys.md', 'personas.md'];
    const ordered = [
      ...coreFirst.filter((f) => BA_ARTIFACTS.includes(f)),
      ...BA_ARTIFACTS.filter((f) => !coreFirst.includes(f)),
    ];
    for (const artifact of ordered) {
      const filePath = path.join(prdDirPath, artifact);
      if (!fs.existsSync(filePath)) continue;
      lines.push(`## ${artifact}`);
      lines.push(fs.readFileSync(filePath, 'utf-8').trim());
      lines.push('');
    }

    const full = lines.join('\n').slice(0, MAX_CONTEXT_CHARS);
    return full || null;
  } catch (err) {
    console.error('[agent-invoker] failed to build context:', err);
    return null;
  }
}

// ── The async generation job ───────────────────────────────────────────────

async function runRequirementsJob(projectId: number): Promise<void> {
  const row = getProjectRow(String(projectId));
  if (!row) {
    writeReqGenState(projectId, {
      state: 'failed',
      generated: 0,
      total: REQ_GEN_SECTIONS.length,
      currentSection: null,
      startedAt: Date.now(),
      error: 'Project not found for generation',
    });
    return;
  }

  const prdDirPath = path.join(resolveProjectFolder(row), 'PRD');
  const featuresPath = prdFilePath(prdDirPath, 'features.md');
  const prdPath = prdFilePath(prdDirPath, 'prd.md');

  const existing = readReqGenState(projectId);
  if (!existing) {
    writeReqGenState(projectId, {
      state: 'failed',
      generated: 0,
      total: REQ_GEN_SECTIONS.length,
      currentSection: null,
      startedAt: Date.now(),
      error: 'No generation state found — this should not happen.',
    });
    return;
  }

  const context = buildContext(row);
  if (!context) {
    writeReqGenState(projectId, {
      ...existing,
      state: 'failed',
      currentSection: null,
      error: 'Could not assemble prompt context',
    });
    return;
  }

  // Bidirectional resume reconcile (pure fn in req-gen-splice.ts): rows on
  // disk ⇒ done even if the crash lost the marker (retry must not re-run the
  // section — nextFreeId would duplicate); marked but rows deleted ⇒
  // regenerate. Also rehydrates the generated feature ids so a BR-only retry
  // still links its BRs. A reconcile run bypasses the resume *decision* but
  // keeps the feature-id rehydration: its seed set below starts EMPTY because
  // rows on disk are its INPUT, not evidence of completion — every section
  // always runs ("pass through all" is the reconcile contract), and seeding
  // the completion set from disk would classify a run whose first section
  // failed as done (set pre-populated full → done write → clears
  // artifactsChanged → stale flag lost on a failed reconcile).
  const isReconcile = existing.mode === 'reconcile';
  const reconciled = reconcileSectionsDone(
    fs.existsSync(featuresPath) ? fs.readFileSync(featuresPath, 'utf-8') : '',
    fs.existsSync(prdPath) ? fs.readFileSync(prdPath, 'utf-8') : '',
    isReconcile ? [] : (existing.sectionsDone ?? []),
  );
  const sectionsDone = new Set<string>(isReconcile ? [] : reconciled.sectionsDone);
  const todo = isReconcile
    ? [...REQ_GEN_SECTIONS]
    : REQ_GEN_SECTIONS.filter((s) => !sectionsDone.has(s));
  if (!isReconcile && todo.length === 0) {
    writeReqGenState(projectId, { ...existing, state: 'done', currentSection: null, error: null });
    return;
  }

  // Heartbeat: keeps lastHeartbeatAt fresh while an Ollama call runs, so the
  // stale-detection window in req-gen-state.ts stays tight without
  // false-failing slow-but-alive jobs. startedAt stays pinned for elapsedMs.
  const startedAt = existing.startedAt;
  const heartbeat = setInterval(() => {
    try {
      const s = readReqGenState(projectId);
      if (s) writeReqGenState(projectId, { ...s, startedAt, lastHeartbeatAt: Date.now() });
    } catch { /* heartbeat is best-effort */ }
  }, HEARTBEAT_MS);

  // Feature ids for BR linking: rehydrated from the previous run's generated
  // features when the features section carried over, else filled by this run's
  // features section. A reconcile run REPLACES this with the post-reconcile
  // desired-order ids (reconcileFeatures returns the full set). Local to this
  // run: concurrent runs for different projects must not cross-link.
  let featureIds: string[] = [...reconciled.featureIds];
  // Written into EVERY persisted state write below (entry, completion,
  // terminal) so the phase-aware banner shows live row counts mid-run — a
  // generating run's result is "what has landed so far", not just the
  // finished run's counts.
  const result = { featuresGenerated: 0, brsGenerated: 0, trsGenerated: 0, acsGenerated: 0 };
  let lastError: string | null = null;

  try {
    for (let i = 0; i < todo.length; i++) {
      const section = todo[i];
      writeReqGenState(projectId, {
        ...existing,
        state: 'generating',
        generated: sectionsDone.size,
        currentSection: section,
        // Bounds this section at SECTION_STALL_MS for the stale-read — a
        // wedged run with fresh heartbeats must still fail (the round-4
        // deadlock had exactly that shape for 3.4h).
        sectionStartedAt: Date.now(),
        lastHeartbeatAt: Date.now(),
        error: null,
        result,
        sectionsDone: [...sectionsDone],
      });

      try {
        if (section === FEATURES_SECTION) {
          // Fresh read at section start — nothing else writes during a run
          // (the transition routes 409 while a run is active), so reading
          // before the model call is equivalent to reading after.
          // A project whose generation has never run has no features.md
          // (it is not part of the 17-artifact scaffold). Reading it as ''
          // splices cleanly — the splice creates the file. Same guard as the
          // reconcile sectionsDone read above.
          const features = fs.existsSync(featuresPath) ? fs.readFileSync(featuresPath, 'utf-8') : '';
          const existingGenFeatures = isReconcile
            ? parseFeatures(features).features.filter((f) => f.origin === 'generated')
            : [];
          if (isReconcile && existingGenFeatures.length > 0) {
            // Reconcile path: the model returns the FULL desired set (echoed
            // ids stay, omitted ids are removed, new ones are appended).
            // Unchanged content outside touched scopes stays byte-identical
            // (the AC-9 bar); a zero-diff result writes nothing.
            const { entries, keepFeIds } = await callModelFeaturesReconcile(context, existingGenFeatures);
            const rec = reconcileFeatures(features, entries, keepFeIds);
            if (rec.text !== features) {
              // Direct write — atomicWritePrd takes the PRD lock itself. PR
              // #26 round-4 bug: wrapping it in an outer withPrdLock on the
              // SAME path was a nested same-key acquire that queued behind
              // its own slot forever (non-reentrant mutex, deadlock).
              await atomicWritePrd(featuresPath, rec.text);
            }
            featureIds = rec.featureIds;
            result.featuresGenerated = rec.ops.added + rec.ops.updated;
            result.acsGenerated = rec.acCount;
            result.trsGenerated = rec.trCount;
          } else {
            // requireRows: a call that yields zero parseable rows must FAIL
            // the section — a silent empty advance would be marked done and
            // retry would skip it forever, generating nothing. (Reconcile
            // skips this only when NO generated rows exist — that degenerate
            // case is plain generation and keeps the same protection.)
            const feats = requireRows(await callModelFeatures(context), 'features');
            const spliced = spliceFeatures(features, feats);
            if (spliced.feIds.length !== feats.length) {
              throw new Error('Feature splice inserted fewer blocks than the model generated');
            }
            // Same round-4 fix: atomicWritePrd locks; never nest withPrdLock.
            await atomicWritePrd(featuresPath, spliced.text);
            featureIds.push(...spliced.feIds);
            result.featuresGenerated = spliced.feIds.length;
            result.acsGenerated = spliced.acCount;
            result.trsGenerated = spliced.trCount;
          }
        } else {
          const prd = fs.readFileSync(prdPath, 'utf-8');
          // FRESH read: in reconcile mode this reflects the features section's
          // post-reconcile file, so BR linking resolves against the final
          // feature set.
          const existingGenBrs = isReconcile
            ? parseBusinessReqs(prd).rows.filter((r) => r.origin === 'generated')
            : [];
          if (isReconcile && existingGenBrs.length > 0) {
            const { entries, keepBrIds } = await callModelBusinessReqsReconcile(context, featureIds, existingGenBrs);
            const rec = reconcileBusinessReqs(prd, entries, keepBrIds);
            if (rec.text !== prd) {
              // Same round-4 fix: atomicWritePrd locks; never nest withPrdLock.
              await atomicWritePrd(prdPath, rec.text);
            }
            result.brsGenerated = rec.ops.added + rec.ops.updated;
          } else {
            const brs = requireRows(await callModelBusinessReqs(context, featureIds), 'business requirements');
            const spliced = spliceBusinessReqs(prd, brs, featureIds);
            if (spliced.brIds.length !== brs.length) {
              // businessReqInsertIndex found no §8 to write into — nothing
              // landed, so failing the section is safe (no partial insert).
              throw new Error('BR splice inserted fewer rows than the model generated — prd.md has no §8 section');
            }
            // Same round-4 fix: atomicWritePrd locks; never nest withPrdLock.
            await atomicWritePrd(prdPath, spliced.text);
            result.brsGenerated = spliced.brIds.length;
          }
        }
        sectionsDone.add(section);
      } catch (err) {
        lastError = `Could not generate ${section}: ${err instanceof Error ? err.message : String(err)}`;
        break; // a failed section stops the run — retry generates only the rest
      }

      writeReqGenState(projectId, {
        ...existing,
        state: 'generating',
        generated: sectionsDone.size,
        // Next section started at the completion write — the elapsed clock
        // ticks from here (undefined on the last section, which is null).
        sectionStartedAt: todo[i + 1] ? Date.now() : undefined,
        currentSection: todo[i + 1] ?? null,
        lastHeartbeatAt: Date.now(),
        result,
        sectionsDone: [...sectionsDone],
      });
    }

    if (sectionsDone.size === REQ_GEN_SECTIONS.length) {
      writeReqGenState(projectId, {
        ...existing,
        state: 'done',
        currentSection: null,
        sectionStartedAt: undefined,
        error: null,
        result,
        sectionsDone: [...sectionsDone],
        // The pre-run `existing` spread carries artifactsChanged: true — a
        // completed reconcile/generate run has now absorbed the artifact
        // changes, so the stale flag clears here and ONLY here (a failed run
        // keeps it true so the reconcile stays re-triggerable).
        artifactsChanged: false,
      });
    } else {
      writeReqGenState(projectId, {
        ...existing,
        state: 'failed',
        currentSection: null,
        sectionStartedAt: undefined,
        error:
          lastError ??
          'Generation finished with missing sections — retry generates only the missing ones.',
        result,
        sectionsDone: [...sectionsDone],
        // artifactsChanged stays true via the spread — retry re-enters
        // reconcile so the remaining sections still diff, not append.
      });
    }
  } finally {
    clearInterval(heartbeat);
  }
}

// ── Prompt + Ollama call ────────────────────────────────────────────────────
// The model NEVER writes file text — it returns JSON row inputs, and the
// server allocates ids and renders the grammar (req-gen-splice.ts). Asking
// for the markdown grammar directly would risk malformed rows that the
// Requirements parser silently drops.

function modelSystemPrompt(): string {
  return (
    'You are the Business Analyst agent of the Idea-to-Web-Solution framework. ' +
    'Respond with a single JSON object and nothing else — no markdown fences, no commentary. ' +
    'Ground every detail in the project context provided — never invent features not described.'
  );
}

async function callModelFeatures(context: string): Promise<GenFeature[]> {
  const user =
    `## Context (all approved artifacts)\n\n${context}\n\n## Task\n\n` +
    `Write the feature specs for this project. A feature is a user-facing capability with acceptance criteria. Respond with JSON: ` +
    `{"features":[{"title":"short feature title","description":"what the feature does and why","source":"user-journeys.md §3",` +
    `"priority":"must|should|could","acs":[{"text":"acceptance criterion"}]` +
    `,"trs":[{"text":"technical requirement supporting this feature","priority":"must|should|could"}]}]}\n\n` +
    `Include 5-10 features covering the happy paths and the main failure paths. ` +
    `Each feature needs at least one acceptance criterion and at least one technical requirement. ` +
    `"source" is optional: a path (doc + section) into the approved artifacts that grounds the feature.`;
  const parsed = await callModelJson(user);
  const rawFeatures = Array.isArray(parsed?.features) ? parsed.features : [];
  const features: GenFeature[] = [];
  for (const f of rawFeatures) {
    if (!f || typeof f !== 'object') continue;
    const o = f as Record<string, unknown>;
    const title = str(o.title);
    const description = str(o.description);
    if (!title || !description) continue; // incomplete feature → skipped, not half-inserted
    const source = str(o.source) || null;
    const acs = Array.isArray(o.acs)
      ? o.acs
          .map((a) =>
            a && typeof a === 'object' && str((a as Record<string, unknown>).text)
              ? { text: str((a as Record<string, unknown>).text) }
              : null,
          )
          .filter((a): a is GenAc => !!a && !!a.text)
      : [];
    const trs = Array.isArray(o.trs)
      ? o.trs
          .map((t) =>
            t && typeof t === 'object'
              ? { text: str((t as Record<string, unknown>).text), priority: (t as Record<string, unknown>).priority }
              : null,
          )
          .filter((t): t is { text: string; priority: unknown } => !!t && !!t.text)
      : [];
    features.push({ title, description, source, priority: o.priority, acs, trs });
  }
  return features;
}

async function callModelBusinessReqs(context: string, featureIds: string[]): Promise<GenBr[]> {
  const featureList = featureIds.length
    ? `\n\nThe following features were just generated (index → id): ` +
      featureIds.map((id, i) => `${i} → ${id}`).join(', ') +
      `\nLink each business requirement to the feature it serves via "featureIndex" (the number before the arrow), or null when it serves none.`
    : '';
  const user =
    `## Context (all approved artifacts)\n\n${context}\n\n## Task\n\n` +
    `Write the business requirements for this project — testable statements grouped by functional area. ` +
    `Respond with JSON: {"requirements":[{"text":"requirement text","priority":"must|should|could","featureIndex":null}]}${featureList}`;
  const parsed = await callModelJson(user);
  const rawReqs = Array.isArray(parsed?.requirements) ? parsed.requirements : [];
  const brs: GenBr[] = [];
  for (const r of rawReqs) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    const text = str(o.text);
    if (!text) continue;
    const idx = o.featureIndex;
    const featureIndex =
      typeof idx === 'number' && Number.isInteger(idx) && idx >= 0 && idx < featureIds.length ? idx : null;
    brs.push({ text, priority: o.priority, featureIndex });
  }
  return brs;
}

// ── Reconcile-mode calls ────────────────────────────────────────────────────
// The model sees the CURRENT generated rows and returns the FULL desired set:
// echoed ids stay (reused or revised), omitted ids are removed, id-less
// entries are new. It never writes grammar — reconcileFeatures/
// reconcileBusinessReqs own ids, ids allocation and file text.

function renderExistingFeatureForPrompt(f: FeatureRow): string {
  const acs = f.acs
    .map((a) => `  - ${a.id} [${a.status}]: ${a.text}`)
    .join('\n');
  const trs = f.reqs
    .map((r) => `  - ${r.id} [${r.priority}]: ${r.text}`)
    .join('\n');
  return `${f.feId} [${f.priority}]: ${f.title} — ${f.description}${f.source ? `\n  source: ${f.source}` : ''}` +
    `${acs ? `\n${acs}` : ''}${trs ? `\n${trs}` : ''}`;
}

async function callModelFeaturesReconcile(
  context: string,
  existing: FeatureRow[],
): Promise<{ entries: DesiredFeature[]; keepFeIds: string[] }> {
  const current =
    existing.length
      ? `\n\n## Current generated features (id → current definition, with ACs and TRs)\n\n` +
        existing.map(renderExistingFeatureForPrompt).join('\n\n') +
        `\n\n## Task\n\nReconcile these features against the context above. Return the FULL desired set as JSON: ` +
        `{"features":[{"feId":"FE-01","title":"short feature title","description":"what the feature does and why",` +
        `"source":"user-journeys.md §3","priority":"must|should|could",` +
        `"acs":[{"acId":"AC-001","text":"acceptance criterion"}],` +
        `"trs":[{"trId":"TR-001","text":"technical requirement","priority":"must|should|could"}]}]}\n` +
        `- Echo "feId" (and each AC's "acId" and TR's "trId") for a feature you are keeping — unchanged or revised. Keep ids stable unless the meaning changed.\n` +
        `- Omit a feature (or an AC/TR inside one) to REMOVE it — removal is expected when the updated artifacts no longer support it. Removing all features is valid.\n` +
        `- A new feature, AC, or TR has no id.\n` +
        `- Echo ONLY ids from the generated list above — human-authored features are managed by people, never touch them.\n` +
        `- Every previously generated feature is reconsidered: keep, update, remove, or add as the context requires.`
      : '';
  const user =
    `## Context (all approved artifacts)\n\n${context}\n\n## Task\n\n` +
    `Write the feature specs for this project. Respond with JSON: ` +
    `{"features":[{"title":"short feature title","description":"what the feature does and why","source":"user-journeys.md §3",` +
    `"priority":"must|should|could","acs":[{"text":"acceptance criterion"}]` +
    `,"trs":[{"text":"technical requirement supporting this feature","priority":"must|should|could"}]}]}` + current;
  const parsed = await callModelJson(user);
  const rawFeatures = Array.isArray(parsed?.features) ? parsed.features : [];
  const entries: DesiredFeature[] = [];
  // Echoed ids are recorded even when their entry is skipped for
  // incompleteness — one garbled entry must not silently delete an existing
  // generated row (the reconcile keeps every echoed id that still parses).
  const keepFeIds: string[] = [];
  for (const f of rawFeatures) {
    if (!f || typeof f !== 'object') continue;
    const o = f as Record<string, unknown>;
    const feId = str(o.feId);
    if (feId) keepFeIds.push(feId);
    const title = str(o.title);
    const description = str(o.description);
    // Same completeness bar as generate mode: an incomplete entry is dropped.
    if (!title || !description) continue;
    const source = str(o.source) || null;
    const acs = Array.isArray(o.acs)
      ? o.acs
          .map((a) =>
            a && typeof a === 'object'
              ? { acId: str((a as Record<string, unknown>).acId) || null, text: str((a as Record<string, unknown>).text) }
              : null,
          )
          .filter((a): a is DesiredAc => !!a && !!a.text)
      : [];
    const trs = Array.isArray(o.trs)
      ? o.trs
          .map((t) =>
            t && typeof t === 'object'
              ? { trId: str((t as Record<string, unknown>).trId) || null, text: str((t as Record<string, unknown>).text), priority: (t as Record<string, unknown>).priority }
              : null,
          )
          .filter((t): t is DesiredTr => !!t && !!t.text)
      : [];
    entries.push({ feId: feId || null, title, description, source, priority: o.priority, acs, trs });
  }
  return { entries, keepFeIds };
}

function renderExistingBrForPrompt(r: ReqRow): string {
  return `${r.id}${r.featureId ? ` (serves ${r.featureId})` : ''} [${r.priority}]: ${r.text}`;
}

async function callModelBusinessReqsReconcile(
  context: string,
  featureIds: string[],
  existing: ReqRow[],
): Promise<{ entries: DesiredBr[]; keepBrIds: string[] }> {
  const featureList = featureIds.length
    ? `\n\nThe post-reconcile features (index → id): ` +
      featureIds.map((id, i) => `${i} → ${id}`).join(', ') +
      `\nLink each business requirement to the feature it serves via "featureIndex" (the number before the arrow), or null when it serves none.`
    : '';
  const current =
    existing.length
      ? `\n\n## Current generated business requirements (id → current definition)\n\n` +
        existing.map(renderExistingBrForPrompt).join('\n') +
        `\n\n## Task\n\nReconcile these business requirements against the context above. Return the FULL desired set as JSON: ` +
        `{"requirements":[{"brId":"BR-001","text":"requirement text","priority":"must|should|could","featureIndex":null}]}\n` +
        `- Echo "brId" for a requirement you are keeping — unchanged or revised.\n` +
        `- Omit a requirement to REMOVE it — removal is expected when the updated artifacts no longer support it. Removing all is valid.\n` +
        `- A new requirement has no id.\n` +
        `- Echo ONLY ids from the generated list above — human-authored requirements are managed by people, never touch them.\n` +
        `- Every previously generated requirement is reconsidered: keep, update, remove, or add as the context requires.` +
        featureList
      : '';
  const user =
    `## Context (all approved artifacts)\n\n${context}\n\n## Task\n\n` +
    `Write the business requirements for this project — testable statements grouped by functional area. ` +
    `Respond with JSON: {"requirements":[{"text":"requirement text","priority":"must|should|could","featureIndex":null}]}${current}`;
  const parsed = await callModelJson(user);
  const rawReqs = Array.isArray(parsed?.requirements) ? parsed.requirements : [];
  const entries: DesiredBr[] = [];
  const keepBrIds: string[] = [];
  for (const r of rawReqs) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    const brId = str(o.brId);
    if (brId) keepBrIds.push(brId);
    const text = str(o.text);
    if (!text) continue;
    const idx = o.featureIndex;
    const featureIndex =
      typeof idx === 'number' && Number.isInteger(idx) && idx >= 0 && idx < featureIds.length ? idx : null;
    entries.push({
      brId: brId || null,
      text,
      priority: o.priority,
      featureId: featureIndex === null ? null : (featureIds[featureIndex] ?? null),
    });
  }
  return { entries, keepBrIds };
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

// Tolerant JSON extraction: the model is asked for a bare object, but a
// fenced or prose-wrapped response still parses (first '{' to last '}').
async function callModelJson(user: string): Promise<Record<string, unknown> | null> {
  const raw = await callOllama(modelSystemPrompt(), user);
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

async function callOllama(system: string, user: string): Promise<string> {
  const res = await fetch(OLLAMA + '/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      stream: true,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
    signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
  });

  if (!res.ok || !res.body) {
    throw new Error(
      res.status === 404
        ? `Model '${MODEL}' not found — pull it with: ollama pull ${MODEL}`
        : `Ollama error (HTTP ${res.status})`,
    );
  }

  let full = '';
  const decoder = new TextDecoder();
  let buffer = '';
  for await (const chunk of res.body) {
    buffer += decoder.decode(chunk as Uint8Array, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      let evt: { message?: { content?: string }; error?: string };
      try {
        evt = JSON.parse(line) as typeof evt;
      } catch {
        continue;
      }
      if (evt.error) throw new Error(evt.error);
      if (evt.message?.content) full += evt.message.content;
    }
  }
  return full;
}

// ── Helpers exported for testing / introspection ────────────────────────────

export function calculateElapsedMs(projectId: number): number {
  const s = readReqGenState(projectId);
  if (!s || !s.startedAt) return 0;
  return Date.now() - s.startedAt;
}
