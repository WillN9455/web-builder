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
export const MAX_MESSAGES = 200;
export const MAX_MESSAGE_CHARS = 8000;

// ── Project scaffolding (mirrors init-frame.js) ────────────────────────────

const FRAMEWORK_DIRS = [
  "PRD/templates",
  "design-system/tokens",
  "design-system/components",
  "design-system/states",
  "code-builder/templates/nextjs-starter",
  "code-builder/templates/vue-nuxt-starter",
  "code-builder/templates/svelte-kit-starter",
  "skills",
  "testing/playwright",
  "workflows",
];

const ROOT_FILES = ["CLAUDE.md", "AGENTS.md", "README.md", "FRAMEWORK-FLOW.md", "gaps.md", "questions.md", ".gitignore"];
const COPY_SUBDIRS = ["skills", "design-system", "PRD", "code-builder", "testing", "workflows"];

const SKIP_DIRS = new Set(["node_modules", ".git", ".next", "dist", "build", "coverage"]);

function copyRecursiveSkippingExisting(src: string, dest: string, stats: { copied: number; skipped: number }): void {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    if (SKIP_DIRS.has(path.basename(src))) return;
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursiveSkippingExisting(path.join(src, entry), path.join(dest, entry), stats);
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
  for (const dir of FRAMEWORK_DIRS) fs.mkdirSync(path.join(abs, dir), { recursive: true });

  const stats = { copied: 0, skipped: 0 };
  for (const file of ROOT_FILES) {
    const src = path.join(REPO_ROOT, file);
    const dest = path.join(abs, file);
    if (!fs.existsSync(src)) continue;
    if (fs.existsSync(dest)) { stats.skipped++; continue; }
    fs.copyFileSync(src, dest);
    stats.copied++;
  }
  for (const subdir of COPY_SUBDIRS) {
    const src = path.join(REPO_ROOT, subdir);
    if (fs.existsSync(src)) copyRecursiveSkippingExisting(src, path.join(abs, subdir), stats);
  }
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
    • Never put a marker inside the final \`\`\`idea\`\`\` fence.
    • Never put more than one marker in a single reply.

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
  for (const m of messages as ChatMessage[]) {
    if (!m || (m.role !== "user" && m.role !== "assistant")) return "Each message needs role 'user' or 'assistant'.";
    if (typeof m.content !== "string" || !m.content.trim()) return "Each message needs non-empty string content.";
    if (m.content.length > MAX_MESSAGE_CHARS) return "A message exceeds " + MAX_MESSAGE_CHARS + " characters.";
  }
  return null;
}

// ── Helpers ────────────────────────────────────────────────────────────────

export function newSessionId(): string {
  return crypto.randomUUID();
}
