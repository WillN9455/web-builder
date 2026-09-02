// Idea-intake — ported from idea-intake/server.js (commit 1d0af53).
//
// Captures a business idea via a chat interview with a local Ollama model
// acting as the BA Agent. Validates a project folder, scaffolds framework
// files into it, pins the workspace root for future Claude Code sessions,
// streams chat tokens as NDJSON, and writes `idea.md` when the assistant
// emits a closing ```idea``` fence.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

// ── Config ─────────────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Framework repo root — sits two directories up from this file
// (launcher/server/intake.ts → launcher/server → launcher → repo).
// `project-dir.txt` is written here so any future Claude Code session
// picks up the pinned workspace (CLAUDE.md §Workspace Root).
export const REPO_ROOT = path.resolve(__dirname, "..", "..");

export const MODEL = process.env.IDEA_MODEL ?? "qwen3.6:35b-extended";
export const OLLAMA = process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434";

export const MAX_BODY_BYTES = 512 * 1024;

// Conversation caps. Three layered guards keep the payload sent to the local
// Ollama model inside a ~100k-token context window:
//   • MAX_MESSAGE_CHARS  — per-message size (a single paste can't blow the window).
//   • MAX_CONTEXT_CHARS  — total chars across every message. At ~3.5 chars/token
//     (markdown/JSON content is denser than prose), 320k chars ≈ 91k tokens; plus
//     the ~1.8k-token SYSTEM_PROMPT that is prepended on every turn, we land at
//     ~93k tokens — under the 100k target with margin.
//   • MAX_MESSAGES       — count cap. A generous ceiling for an intake interview
//     (realistically 40–60 messages across 8 topics); the char guard is what
//     actually enforces the token budget, this just stops a 1000-tiny-message
//     conversation from sneaking through.
//
// WARN_THRESHOLD is the message count at which the chat UI starts telling the
// user they're approaching the limit. Surfaced to the client via /api/init and
// /api/projects/:id/resume so the server stays the single source of truth.
export const MAX_MESSAGES = 150;
export const MAX_MESSAGE_CHARS = 8000;
export const MAX_CONTEXT_CHARS = 320_000;
export const WARN_THRESHOLD = 120;

// ── Project scaffolding (mirrors init-frame.js) ────────────────────────────
//
// Structure contract: this file does NOT hardcode framework layout. It reads
// `framework/manifest.json` from the repo root and uses it to scaffold the
// new project — same contract as init-frame.js, same loader shape, same
// per-stage tri-fold guarantee. Skip-on-existing and project-dir.txt pinning
// stay here because they are launcher-specific (intake tolerates partial
// pre-existing projects), not part of the structure contract.

type ManifestStage = { folder: string; skills?: string[]; config?: string[]; agents?: string[]; templates?: string[]; shared_inputs?: string[] };
type Manifest = {
  export_root: string;
  root_files: string[];
  stages: Record<string, ManifestStage>;
  shared?: { skills?: string[] };
  outside_export_root?: Record<string, string>;
};

export const MANIFEST_PATH = path.join(REPO_ROOT, "framework", "manifest.json");

/** Load and validate framework/manifest.json. Throws on missing/bad JSON — fail fast. */
export function loadManifest(): Manifest {
  if (!fs.existsSync(MANIFEST_PATH)) {
    throw new Error("Framework manifest not found at " + MANIFEST_PATH + " — init-frame.js and the launchers all read framework/manifest.json; it is no longer hardcoded.");
  }
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf-8"));
  } catch (err) {
    throw new Error("framework/manifest.json is not valid JSON: " + (err as Error).message);
  }
  const m = raw as Partial<Manifest>;
  if (!m.export_root || typeof m.stages !== "object" || m.stages === null) {
    throw new Error('manifest.json must define "export_root" and a "stages" object (see framework/MANIFEST.md).');
  }
  if (!Array.isArray(m.root_files) || m.root_files.length === 0) {
    throw new Error('manifest.json must define a non-empty "root_files" array (see framework/MANIFEST.md).');
  }
  for (const [id, stage] of Object.entries(m.stages)) {
    if (!stage || typeof stage.folder !== "string") {
      throw new Error('manifest stage "' + id + '" is missing its "folder" path (see framework/MANIFEST.md).');
    }
  }
  return m as Manifest;
}

const SKIP_DIRS = new Set(["node_modules", ".git", ".next", "dist", "build", "coverage"]);

/**
 * Stage folders are contract content (framework/build is the Build stage), so a
 * name in SKIP_DIRS only prunes when it is NOT a manifest-promised stage folder
 * or a descendant of one. `protectedDirs` holds the absolute source paths of the
 * manifest stage folders under the export root.
 */
function isProtectedDir(src: string, protectedDirs: ReadonlySet<string>): boolean {
  for (const dir of protectedDirs) {
    // Strip trailing separators: manifest folder values are written like
    // "build/" and path.join preserves that slash, which would defeat the
    // prefix comparison below ("dir" + sep would look for a double slash).
    const clean = dir.replace(/[\\/]+$/, "");
    if (src === clean || src.startsWith(clean + path.sep)) return true;
  }
  return false;
}

function copyRecursiveSkippingExisting(
  src: string,
  dest: string,
  stats: { copied: number; skipped: number },
  protectedDirs: ReadonlySet<string> = new Set(),
): void {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    if (SKIP_DIRS.has(path.basename(src)) && !isProtectedDir(src, protectedDirs)) return;
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursiveSkippingExisting(path.join(src, entry), path.join(dest, entry), stats, protectedDirs);
    }
    return;
  }
  const name = path.basename(src);
  if (name === "init-frame.js" || name === "idea.md" || name === "Modelfile" || name === ".DS_Store") return;
  if (fs.existsSync(dest)) {
    stats.skipped++;
    return;
  }
  fs.copyFileSync(src, dest);
  stats.copied++;
}

/**
 * Check every path the manifest lists (stage skills/config/agents/templates,
 * shared_inputs, shared.skills) against the scaffolded export. Paths are
 * relative to export_root. Missing entries are warned about so the gap between
 * contract and tree is visible at every bootstrap. Warnings, not failures —
 * a missing template should be visible, not block a bootstrap.
 */
function validateManifestExport(abs: string, manifest: Manifest): void {
  const listed: string[] = [];
  for (const stage of Object.values(manifest.stages)) {
    for (const key of ["skills", "config", "agents", "shared_inputs", "templates"] as const) {
      for (const rel of stage[key] ?? []) listed.push(rel);
    }
  }
  if (manifest.shared && Array.isArray(manifest.shared.skills)) {
    for (const rel of manifest.shared.skills) listed.push(rel);
  }

  const missing = listed.filter(
    (rel) => !fs.existsSync(path.join(abs, manifest.export_root, rel)),
  );
  if (missing.length > 0) {
    console.warn("\nWarning: manifest lists entries missing from the export (contract ≠ tree):");
    for (const rel of missing) console.warn("  - " + rel);
  }
}

export function initProjectDir(rawInput: unknown): { abs: string; existed: boolean; copied: number; skipped: number } {
  if (typeof rawInput !== "string" || !rawInput.trim()) throw new Error("Enter a folder path first.");
  let p = rawInput.trim();
  if (p.includes("\0")) throw new Error("Invalid path.");
  if (p.startsWith("~")) p = path.join(os.homedir(), p.slice(1));
  const abs = path.resolve(p);

  if (abs === REPO_ROOT || abs.startsWith(REPO_ROOT + path.sep)) {
    throw new Error("Pick a folder outside the framework repo — " + abs + " is inside it, and writes there would overwrite the framework itself.");
  }
  if (fs.existsSync(abs) && !fs.statSync(abs).isDirectory()) {
    throw new Error(abs + " already exists and is a file, not a folder.");
  }

  const existed = fs.existsSync(abs);
  const manifest = loadManifest();

  // 0. Materialise the project folder itself when the user typed a path that
  //    does not exist yet — the launcher is what "creates a folder when a path
  //    is provided" (same contract as init-frame.js, which mkdirs its target
  //    before scaffolding). Without this, the first copyFileSync below throws
  //    ENOENT and the whole scaffold aborts for a brand-new directory.
  fs.mkdirSync(abs, { recursive: true });

  // 0. Root files: framework-meta docs copied from the manifest list.
  const stats = { copied: 0, skipped: 0 };
  for (const file of manifest.root_files) {
    const src = path.join(REPO_ROOT, file);
    const dest = path.join(abs, file);
    if (!fs.existsSync(src)) continue;
    if (fs.existsSync(dest)) { stats.skipped++; continue; }
    fs.copyFileSync(src, dest);
    stats.copied++;
  }

  // 1. Copy the export root wholesale — every stage folder + shared/ + templates/.
  //    Stage folders are protected from the SKIP_DIRS prune: framework/build is
  //    a stage named "build", not a build-output directory, and pruning it
  //    silently dropped the entire Build stage (Code Agent files included).
  const exportSrc = path.join(REPO_ROOT, manifest.export_root);
  if (fs.existsSync(exportSrc)) {
    const stageDirs = new Set(
      Object.values(manifest.stages).map((stage) => path.resolve(exportSrc, stage.folder)),
    );
    copyRecursiveSkippingExisting(exportSrc, path.join(abs, manifest.export_root), stats, stageDirs);
  }

  // 2. Guarantee the per-stage tri-fold (skills/, config/, agents/) even where
  //    git could not carry empty directories — the manifest promises it.
  for (const stage of Object.values(manifest.stages)) {
    for (const leaf of ["skills", "config", "agents"]) {
      fs.mkdirSync(path.join(abs, manifest.export_root, stage.folder, leaf), { recursive: true });
    }
  }

  // 3. Reference outside_export_root artifacts (PRD/templates, workflows) at
  //    scaffold time — same as init-frame.js, so a chat-initiated project and
  //    a CLI-initiated project end up with the same layout.
  for (const entry of Object.values(manifest.outside_export_root || {})) {
    if (typeof entry !== "string" || !entry) continue;
    const src = path.join(REPO_ROOT, entry);
    if (fs.existsSync(src)) {
      copyRecursiveSkippingExisting(src, path.join(abs, entry), stats);
    }
  }

  // 4. Validate the export against the manifest — every file the contract
  //    promises must exist in the scaffolded project. Same check as
  //    init-frame.js step 4, so all three launch paths warn symmetrically.
  validateManifestExport(abs, manifest);

  return { abs, existed, ...stats };
}

// ── BA Agent system prompt ─────────────────────────────────────────────────
// Verbatim port — same wording keeps the interview style identical.

const SYSTEM_PROMPT = `You are the BA Agent of the "Idea-to-Web-Solution" framework — a business analyst whose
only job in this conversation is to interview the user about a business idea and capture enough
detail to seed a Product Requirements Document (PRD).

HOW TO INTERVIEW
- Start by inviting the user to describe their idea in their own words.
- Then ask clarifying questions — at most 2-3 per reply, never a wall of questions.
- Move through these topics in order. Cover ALL of them before finalising — the user can skip
  any one with the word "skip", but you must still touch each topic so the idea doc is complete:
  1. Problem: what pain point, who feels it, how often, what do people use today, evidence it's real.
  2. Users & scale: personas, their goals, tech comfort, whether accounts/login are needed.
  3. MVP scope: what the app must do, rough priority, feature dependencies, what is OUT of scope.
  4. Business rules: permissions, automations, calculations, data entities, file uploads.
  5. Compliance: GDPR / PCI / HIPAA / none.
  6. Brand & design: brand guidelines, mood, sites they admire.
  7. Tech stack (optional): frontend, database, hosting, auth — offer to recommend if unsure.
  8. Timeline & constraints: launch target, budget, team skills, biggest risks.
- Be conversational and concrete. Suggest examples when the user is vague ("e.g. ...").
- Challenge gently when answers are thin: "Who specifically feels this most?" beats accepting hand-waving.
- Acknowledge what the user just said BEFORE moving to the next topic — short callbacks make the
  interview feel less like a checklist.

TOPIC TRANSITIONS
- A single topic may need 1, 2, or 3+ rounds of back-and-forth. Do NOT move on until you have
  enough to fill the field — but don't pad either; once you have what you need, transition.
- When you transition from one topic to the next (or accept a skip and move on), end that SAME
  reply with exactly one sentinel line:
    ::topic=N::
  where N is the 1-based index of the topic you are NOW starting. For example, the reply that
  wraps up Topic 1 and starts Topic 2 should look like:
      "Got it — sounds like freelance designers are feeling this most. Quick pivot: roughly how
      many users do you expect in the first 3 months?
      ::topic=2::"
  The user never sees the ::topic= line; the sidebar uses it to advance.
- The opener reply (which starts Topic 1) does NOT need a marker — the sidebar starts at Topic 1.
- Skip behaviour: when the user says "skip", briefly acknowledge ("No worries, I'll fill that
  in.") and STILL append ::topic=N:: for the NEXT topic. The transcript shows the skip; the
  sidebar still advances to the next item.
- Strict rules for the marker:
    • Place it on its OWN line at the very end of the reply.
    • Use lowercase ::topic=N:: (no spaces around the \`=\`; one or two closing colons).
    • Optional topic summary: you may append a one-line summary of the topic you JUST
      completed, as a second segment on the SAME line as the marker:
      ::topic=4::tenant submits, manager assigns, tech resolves::
      The sidebar shows it as the completed topic's detail. Keep it under 140 characters, no colons.
      The bare form stays valid when you have nothing to add.
    • Never put a marker inside the final \`\`\`idea\`\`\` fence.
    • Never put more than one topic marker in a single reply.

OUTSTANDING QUESTIONS
- When the user defers a genuinely blocking question — one they can't answer right now but that
  will block a requirement or design decision later — log it so it isn't lost. Append exactly one
  sentinel line (its own line, no markdown inside the fields):
    ::oq-add::{"id":"OQ-1","question":"How do tenants authenticate — phone, email, magic link?","blockerFor":"Requirements","blocksStory":"ONB-04"}::
  • id: a stable id of your choosing (OQ-1, OQ-2, …). Reuse the SAME id when the question is
    answered later. Never re-add an id that is already on the list.
  • blockerFor: short group label ("Requirements", "Design", "Compliance", …).
  • blocksStory: the story id this question blocks (e.g. "ONB-04"), or "-" when none.
- When the user answers an outstanding question (in chat), resolve it by appending exactly one
  sentinel line: ::oq-resolve::OQ-1::
- Keep the list short — 10 or fewer open at once. Resolve, then add new ones; don't accumulate.
  The user never sees the sentinel lines; the Outstanding-questions panel in the sidebar uses them.
- Strict rules for these sentinels: one per line; one or two closing colons; never inside the
  final \`\`\`idea\`\`\` fence; payload JSON with double quotes and no newlines.

HANDLING "SKIP"
- If the user says "skip" (alone or as part of a longer message), accept it gracefully: confirm
  you'll fill in that field yourself, then move directly to the NEXT topic in the list above. Do
  NOT re-ask the skipped topic, and do NOT linger on it. The skipped value will land in the
  "assumptions" list in the final idea doc.
- If the user types something else but clearly doesn't want to engage with the current question
  (e.g. "no idea", "you decide"), treat that as a skip too.

WHEN TO FINISH
- You have enough when you have touched every topic above (skipped or answered) AND can confidently
  fill: the problem statement, at least one persona, the core feature list, and rough scope.
  Other fields may be best-effort.
- At that point, SAY SO and ask: "Shall I generate the idea document now?" — wait for confirmation.
- EXCEPTION: if the user at any point says to just proceed / move forward / "you fill it in" /
  "populate it yourself" (or similar), do NOT ask more questions. Immediately finalize, filling
  any gaps with sensible, clearly-labeled assumptions — and make sure every skipped topic is
  listed under "assumptions".

HOW TO FINISH (the output contract)
When finalizing, write one short closing message (1-3 sentences, no questions), then append exactly
one fenced block, and nothing after it:

\`\`\`idea
{
  "projectName": "string",
  "problemStatement": "string",
  "problemLandscape": "string — current solutions + evidence the problem is real",
  "personas": ["string", "..."],
  "features": ["string, priority order", "..."],
  "outOfScope": "string or array",
  "businessRules": "string or array",
  "dataModel": "string — entities and uploads",
  "compliance": "string",
  "frontend": "string or empty",
  "database": "string or empty",
  "hosting": "string or empty",
  "auth": "string or empty",
  "brandPrefs": "string",
  "designRefs": "string or empty",
  "timeline": "string",
  "assumptions": ["each gap you filled yourself, labeled as an assumption — include every topic the user skipped"]
}
\`\`\`

Rules for the block: valid JSON (double quotes, no comments, no trailing commas); empty string ""
for technical preferences the user deferred; put everything you invented into "assumptions"
(including every topic the user skipped — e.g. "Skipped brand & design — recommended a calm,
minimalist tone"); never include the block in a normal interview reply — only when finalizing.`;

export { SYSTEM_PROMPT };

// ── BA sentinels ───────────────────────────────────────────────────────────
//
// The BA Agent signals side-channel state by appending sentinel lines to its
// replies. The user never sees them — the server strips them from the token
// stream and turns each one into a typed NDJSON event. Mirrors the established
// ::topic=N:: conventions (SYSTEM_PROMPT §TOPIC TRANSITIONS):
//
//   ::topic=N::                       → topic event (sidebar advances)
//   ::topic=N::summary::              → topic event + summary of the topic the
//                                       BA just completed (sidebar detail)
//   ::oq-add::{json}::                → oq_add event (outstanding-questions panel)
//   ::oq-resolve::ID::                → oq_resolve event (panel item removed)

// Topic sentinel. Group 1 = the 1-based topic index; group 2 (optional) = a
// one-line summary of the topic the BA just completed. The marker's own
// closing `::` doubles as the summary's opener, so the two branches are:
//   extended  ::topic=N::Summary text::   — the summary stays on the marker's
//                                          line (`[^\S\n]`, never `\s`, so a
//                                          newline after the bare marker
//                                          proves there is no summary) and
//                                          must end its line (`(?=\s|$)`
//                                          lookahead), which keeps this form
//                                          from swallowing the next
//                                          sentinel's opener
//   bare      ::topic=N::
// The summary may not contain `:` or newlines: those terminate it.
export const TOPIC_SENTINEL_RE =
  /::\s*topic\s*=\s*(\d+)\s*(?:::[^\S\n]*([^:\n]{1,140})[^\S\n]*::(?=\s|$)|::)/gi;

// Outstanding-question sentinels. The oq-add payload is flat JSON with
// double-quoted string fields only (see parseOqAddPayload); `::` never occurs
// inside it, so a non-greedy match up to the first `}::` is safe. An invalid
// payload never leaks: the sentinel is stripped either way.
export const OQ_ADD_SENTINEL_RE = /::\s*oq-add\s*::\s*(\{[\s\S]*?\})\s*::/gi;
export const OQ_RESOLVE_SENTINEL_RE = /::\s*oq-resolve\s*::\s*([A-Za-z0-9_-]{1,32})\s*::/gi;

// Combined stream-matching form used by the chat handler (server/index.ts) so
// a single carry-buffer pass catches every sentinel kind. Alternation order is
// irrelevant here — the three forms cannot share a prefix.
export const SENTINEL_RE = new RegExp(
  TOPIC_SENTINEL_RE.source + '|' + OQ_ADD_SENTINEL_RE.source + '|' + OQ_RESOLVE_SENTINEL_RE.source,
  'gi',
);

// Strip every sentinel from free text (human-readable transcript.md, resume
// payloads). Built from the same precise forms as SENTINEL_RE — a greedy
// `[^\n]*::` here would swallow all prose between two sentinels on one line.
// Case-insensitive to match SENTINEL_RE (`/gi`): the streaming path accepts
// `::TOPIC=3::` etc., so the strip must remove the same forms it accepts.
// A malformed near-miss (`::topic=2` with no closing `::`) survives as plain
// text, which beats eating the rest of the line.
export const SENTINEL_STRIP_RE = new RegExp(
  TOPIC_SENTINEL_RE.source + '|' + OQ_ADD_SENTINEL_RE.source + '|' + OQ_RESOLVE_SENTINEL_RE.source,
  'gi',
);

// Shape caps for the oq-add payload — the sentinel is untrusted model output,
// so every field is bounded before it is ever emitted to a client (security.md
// §Server-Side Input Validation). askedAt is server-stamped, never BA-supplied.
export const MAX_OQ_ID_CHARS = 32;
export const MAX_OQ_QUESTION_CHARS = 300;
export const MAX_OQ_BLOCKER_CHARS = 60;
export const MAX_OQ_BLOCKS_STORY_CHARS = 32;
// Hard cap on the persisted/returned outstanding-questions list. The BA prompt
// asks for ≤10; anything past this during a very long session is dropped.
export const MAX_OQ_LIST = 25;

export type OutstandingQuestion = {
  /** BA-chosen stable id, e.g. "OQ-3". */
  id: string;
  /** One line, no markdown. */
  question: string;
  /** Group label: "Requirements", "Design", … */
  blockerFor: string;
  /** Story id the question blocks, e.g. "ONB-04" — "—" when none. */
  blocksStory: string;
  /** Server-stamped ISO timestamp. */
  askedAt: string;
};

export const OQ_ID_RE = /^[A-Za-z0-9_-]{1,32}$/;

/** True when `value` is a single line (no \r / \n) after collapsing whitespace. */
function isOneLine(value: string): boolean {
  return !/[\r\n]/.test(value);
}

/**
 * Parse + validate the BA's ::oq-add:: sentinel payload. Returns the
 * validated fields (askedAt still open — the caller stamps it) or null when
 * the payload is invalid. Invalid payloads are dropped, never forwarded raw
 * and never persisted.
 */
export function parseOqAddPayload(payload: string): Omit<OutstandingQuestion, 'askedAt'> | null {
  let raw: unknown;
  try {
    raw = JSON.parse(payload);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;

  const str = (v: unknown): string | null =>
    typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : null;

  const id = str(r.id);
  const question = str(r.question);
  const blockerFor = str(r.blockerFor);
  const blocksStory = str(r.blocksStory);
  if (!id || !question || !blockerFor || !blocksStory) return null;
  if (!OQ_ID_RE.test(id)) return null;
  if (!isOneLine(question)) return null;

  return {
    id,
    question: question.slice(0, MAX_OQ_QUESTION_CHARS),
    blockerFor: blockerFor.slice(0, MAX_OQ_BLOCKER_CHARS),
    blocksStory: blocksStory.slice(0, MAX_OQ_BLOCKS_STORY_CHARS),
  };
}

/**
 * Rebuild the outstanding-questions list from a persisted transcript. Scans
 * assistant messages (oldest first) for ::oq-add:: / ::oq-resolve:: sentinels
 * and replays them in order — the same shape /api/chat emits live, so a
 * resumed session shows exactly the panel state the user left behind.
 *
 * `resolveTimestamps` maps an assistant message to a fallback askedAt for
 * markers that predate askedAt stamping (older transcripts) — callers pass the
 * per-message JSONL timestamps.
 */
export function deriveOutstandingQuestions(
  messages: Array<{ role: string; content: string }>,
  resolveTimestamps?: (index: number) => string | undefined,
): OutstandingQuestion[] {
  const list: OutstandingQuestion[] = [];
  messages.forEach((m, i) => {
    if (m.role !== 'assistant') return;
    // Per-message guard set, mirroring the live path's per-request
    // `resolvedIds`: ids resolved in THIS reply may not re-add in the same
    // reply, while a re-add in a LATER reply is a fresh decision the live
    // path allows (fresh per-request set) — so the replay allows it too.
    const seen = new Set<string>();
    // Replay adds and resolves in positional order within the message —
    // collecting all adds before all resolves would miss a resolve that must
    // mark the guard set (or remove a question) before a later add in the
    // same reply.
    const events: Array<{ at: number; kind: 'add' | 'resolve'; match: RegExpExecArray }> = [];
    OQ_ADD_SENTINEL_RE.lastIndex = 0;
    let add: RegExpExecArray | null;
    while ((add = OQ_ADD_SENTINEL_RE.exec(m.content)) !== null) {
      events.push({ at: add.index, kind: 'add', match: add });
    }
    OQ_RESOLVE_SENTINEL_RE.lastIndex = 0;
    let res: RegExpExecArray | null;
    while ((res = OQ_RESOLVE_SENTINEL_RE.exec(m.content)) !== null) {
      events.push({ at: res.index, kind: 'resolve', match: res });
    }
    events.sort((a, b) => a.at - b.at);
    for (const evt of events) {
      if (evt.kind === 'add') {
        const parsed = parseOqAddPayload(evt.match[1]);
        if (!parsed || list.length >= MAX_OQ_LIST) continue;
        // Same guards as the live add path (server/index.ts): the question
        // must not already be on the panel (duplicate suppression across
        // replies) and must not be in this reply's resolved guard set.
        if (seen.has(parsed.id) || list.some((q) => q.id === parsed.id)) continue;
        seen.add(parsed.id);
        list.push({
          ...parsed,
          askedAt: embeddedAskedAt(evt.match) ?? resolveTimestamps?.(i) ?? new Date().toISOString(),
        });
      } else {
        const id = evt.match[1];
        const at = list.findIndex((q) => q.id === id);
        if (at >= 0) list.splice(at, 1);
        // Mirror the live resolve path: every resolve marks the id in this
        // reply's guard set, even for ids that were never added — a re-add
        // after such a resolve in the same reply is a model stutter.
        seen.add(id);
      }
    }
  });
  return list;
}

// Extracts an embedded askedAt from a persisted (server-enriched) oq-add
// sentinel. The chat handler rewrites the BA's raw marker into
// ::oq-add::{"id":…,"askedAt":"…"}:: before it lands in the JSONL, so a
// resumed panel shows the original ask time instead of the resume time.
function embeddedAskedAt(match: RegExpExecArray): string | null {
  try {
    const enriched = JSON.parse(match[1]) as { askedAt?: unknown };
    if (typeof enriched.askedAt === 'string' && !Number.isNaN(Date.parse(enriched.askedAt))) {
      return enriched.askedAt;
    }
  } catch {
    // fall through — caller falls back to the message timestamp
  }
  return null;
}

// ── idea.md writer ─────────────────────────────────────────────────────────

function asList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  if (typeof value === "string" && value.trim()) {
    return value.split("\n").map((v) => v.trim()).filter(Boolean);
  }
  return [];
}

function asText(value: unknown, fallback: string): string {
  if (Array.isArray(value)) return value.map((v) => "- " + v).join("\n");
  if (typeof value === "string" && value.trim()) return value.trim();
  return fallback;
}

type IdeaJson = {
  projectName?: string;
  problemStatement?: string;
  problemLandscape?: string;
  personas?: unknown;
  features?: unknown;
  outOfScope?: unknown;
  businessRules?: unknown;
  dataModel?: string;
  compliance?: string;
  frontend?: string;
  database?: string;
  hosting?: string;
  auth?: string;
  brandPrefs?: string;
  designRefs?: string;
  timeline?: string;
  assumptions?: unknown;
};

export function buildIdeaTxt(idea: IdeaJson): string {
  const lines: string[] = [];
  lines.push("# " + (idea.projectName || "Untitled Idea"));
  lines.push("");
  lines.push("> Captured via idea-intake chat UI (BA Agent interview) on " + new Date().toISOString().split("T")[0]);
  lines.push("");
  lines.push("## Problem Statement");
  lines.push(asText(idea.problemStatement, "TBD — BA Agent will fill during Stage 1."));
  lines.push("");
  lines.push("## Target Users / Personas");
  const personas = asList(idea.personas);
  if (personas.length) personas.forEach((p) => lines.push("- " + p));
  else lines.push("- TBD");
  lines.push("");
  lines.push("## Current Solutions & Evidence");
  lines.push(asText(idea.problemLandscape, "TBD — BA Agent will capture during Stage 1."));
  lines.push("");
  lines.push("## Key Features (Priority Order)");
  const features = asList(idea.features);
  if (features.length) features.forEach((f) => lines.push("- " + f));
  else lines.push("- TBD");
  lines.push("");
  lines.push("## Out of Scope");
  lines.push(asText(idea.outOfScope, "- None specified"));
  lines.push("");
  lines.push("## Business Rules");
  lines.push(asText(idea.businessRules, "- TBD — BA Agent will capture during Stage 1."));
  lines.push("");
  lines.push("## Data Entities");
  lines.push(asText(idea.dataModel, "- TBD"));
  lines.push("");
  lines.push("## Compliance & Security");
  lines.push(asText(idea.compliance, "- Standard TLS + encryption at rest assumed unless specified"));
  lines.push("");
  lines.push("## Tech Stack Preferences");
  const stack: Array<[string, string | undefined]> = [
    ["Frontend", idea.frontend],
    ["Database", idea.database],
    ["Hosting", idea.hosting],
    ["Auth", idea.auth],
  ];
  const stackLines = stack
    .filter(([, v]) => typeof v === "string" && v.trim())
    .map(([k, v]) => "- " + k + ": " + (v as string).trim());
  if (stackLines.length) lines.push(...stackLines);
  else lines.push("- TBD — Main Orchestrator will recommend");
  lines.push("");
  lines.push("## Brand & Design Direction");
  lines.push(asText(idea.brandPrefs, "- TBD — Design Agent will define palette and style"));
  lines.push("");
  if (typeof idea.designRefs === "string" && idea.designRefs.trim()) {
    lines.push("## Design References");
    lines.push(idea.designRefs.trim());
    lines.push("");
  }
  lines.push("## Timeline & Constraints");
  lines.push(asText(idea.timeline, "- TBD — BA Agent will capture during Stage 1."));
  lines.push("");
  const assumptions = asList(idea.assumptions);
  if (assumptions.length) {
    lines.push("## Assumptions (filled in by BA Agent — confirm these)");
    assumptions.forEach((a) => lines.push("- " + a));
    lines.push("");
  }
  lines.push("## Notes");
  lines.push("- Next step: open this project folder in Claude Code and run the framework (BA Agent → Stage 1 PRD).");
  return lines.join("\n") + "\n";
}

export function extractIdea(fullText: string): IdeaJson | null {
  const match = fullText.match(/```idea\s*([\s\S]*?)```/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1]);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as IdeaJson;
  } catch {
    return null;
  }
}

export function writeIdeaFile(projectDir: string, idea: IdeaJson): { path: string; backupPath: string | null } {
  const content = buildIdeaTxt(idea);
  const target = path.join(projectDir, "idea.md");
  let backupPath: string | null = null;
  if (fs.existsSync(target)) {
    const existing = fs.readFileSync(target, "utf-8");
    if (existing !== content) {
      backupPath = target + ".bak." + Date.now();
      fs.copyFileSync(target, backupPath);
    }
  }
  fs.writeFileSync(target, content, "utf-8");
  return { path: target, backupPath };
}

// ── Validation ─────────────────────────────────────────────────────────────

export type ChatMessage = { role: "user" | "assistant"; content: string };

export function validateMessages(messages: unknown): string | null {
  if (!Array.isArray(messages) || messages.length === 0) return "Body must include a non-empty messages array.";
  if (messages.length > MAX_MESSAGES) return "Conversation too long (max " + MAX_MESSAGES + " messages). Start a new session.";
  let totalChars = 0;
  for (const m of messages as ChatMessage[]) {
    if (!m || (m.role !== "user" && m.role !== "assistant")) return "Each message needs role 'user' or 'assistant'.";
    if (typeof m.content !== "string" || !m.content.trim()) return "Each message needs non-empty string content.";
    if (m.content.length > MAX_MESSAGE_CHARS) return "A message exceeds " + MAX_MESSAGE_CHARS + " characters.";
    totalChars += m.content.length;
  }
  // Total-content guard — the real backstop for the ~100k-token context window.
  // MAX_MESSAGES alone can't guarantee that (150 short messages and 150 long
  // ones differ by orders of magnitude), so sum the actual chars and reject
  // when the conversation would no longer fit alongside the system prompt.
  if (totalChars > MAX_CONTEXT_CHARS) return "Conversation too long — it would exceed the model's context window. Start a new session.";
  return null;
}

// ── Helpers ────────────────────────────────────────────────────────────────

export function newSessionId(): string {
  return crypto.randomUUID();
}
