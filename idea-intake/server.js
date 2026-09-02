#!/usr/bin/env node

/**
 * idea-intake/server.js — Chat-based idea capture for the Idea-to-Web-Solution Framework.
 *
 * Serves a chat UI and proxies it to a local Ollama model acting as the BA Agent.
 * Before the interview starts, the user picks a project folder: the server creates it,
 * scaffolds the framework structure into it (like init-frame.js), and every write
 * (idea.md, backups) lands there — the framework repo itself is never modified.
 *
 * The agent interviews the user (progressively, per questions.md) until the content is
 * sufficient to seed a PRD — or the user tells it to proceed and fill gaps itself. When
 * the agent is done it emits a fenced `idea` JSON block; the server parses it, backs up
 * any existing idea.md in the project folder, and writes the new one.
 *
 * Zero dependencies: Node 18+ (uses global fetch).
 *
 * Config via env:
 *   IDEA_MODEL   Ollama model name (default: qwen3.6:35b-extended)
 *   OLLAMA_HOST  Ollama API base URL (default: http://127.0.0.1:11434)
 *   PORT         Listen port (default: 4310)
 */

import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

// ── Config ─────────────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "public");
const REPO_ROOT = path.resolve(__dirname, "..");

const MODEL = process.env.IDEA_MODEL || "qwen3.6:35b-extended";
const OLLAMA = process.env.OLLAMA_HOST || "http://127.0.0.1:11434";
const PORT = Number(process.env.PORT || 4310);

const MAX_BODY_BYTES = 512 * 1024;
const MAX_MESSAGES = 200;
const MAX_MESSAGE_CHARS = 8000;

/** sessionId -> projectDir. Created by /api/init; required by /api/chat. */
const sessions = new Map();

// ── Project scaffolding (mirrors init-frame.js) ────────────────────────────
//
// Structure contract: this file does NOT hardcode framework layout. It reads
// `framework/manifest.json` from the repo root and uses it to scaffold the
// new project — same contract as init-frame.js, same loader shape, same
// per-stage tri-fold guarantee. Skip-on-existing stays here because it is
// launcher-specific (intake tolerates partial pre-existing projects), not part
// of the structure contract.

const MANIFEST_PATH = path.join(REPO_ROOT, "framework", "manifest.json");

/** Load and validate framework/manifest.json. Throws on missing/bad JSON — fail fast. */
function loadManifest() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    throw new Error("Framework manifest not found at " + MANIFEST_PATH + " — init-frame.js and the launchers all read framework/manifest.json; it is no longer hardcoded.");
  }
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf-8"));
  } catch (err) {
    throw new Error("framework/manifest.json is not valid JSON: " + err.message);
  }
  if (!raw.export_root || typeof raw.stages !== "object" || raw.stages === null) {
    throw new Error('manifest.json must define "export_root" and a "stages" object (see framework/MANIFEST.md).');
  }
  if (!Array.isArray(raw.root_files) || raw.root_files.length === 0) {
    throw new Error('manifest.json must define a non-empty "root_files" array (see framework/MANIFEST.md).');
  }
  for (const [id, stage] of Object.entries(raw.stages)) {
    if (!stage || typeof stage.folder !== "string") {
      throw new Error('manifest stage "' + id + '" is missing its "folder" path (see framework/MANIFEST.md).');
    }
  }
  return raw;
}

/** Never scaffold dependency/build artifacts (the starter's node_modules alone is ~800 MB). */
const SKIP_DIRS = new Set(["node_modules", ".git", ".next", "dist", "build", "coverage"]);

/**
 * Stage folders are contract content (framework/build is the Build stage), so a
 * name in SKIP_DIRS only prunes when it is NOT a manifest-promised stage folder
 * or a descendant of one. `protectedDirs` holds the absolute source paths of the
 * manifest stage folders under the export root.
 */
function isProtectedDir(src, protectedDirs) {
  for (const dir of protectedDirs) {
    // Strip trailing separators: manifest folder values are written like
    // "build/" and path.join preserves that slash, which would defeat the
    // prefix comparison below ("dir" + sep would look for a double slash).
    const clean = dir.replace(/[\\/]+$/, "");
    if (src === clean || src.startsWith(clean + path.sep)) return true;
  }
  return false;
}

function copyRecursiveSkippingExisting(src, dest, stats, protectedDirs = new Set()) {
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
 * Validate a user-supplied project path, create it, and scaffold the framework in.
 * Rules: no targets at or inside the framework repo (self-copy hazard + clobber risk),
 * ~ expansion allowed, existing folders are fine (scaffold only fills gaps).
 */
function initProjectDir(rawInput) {
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

  // Materialise the project folder itself when the user typed a path that does
  // not exist yet — the intake is what "creates a folder when a path is
  // provided" (same contract as init-frame.js, which mkdirs its target before
  // scaffolding). Without this, the first copyFileSync below throws ENOENT and
  // the whole scaffold aborts for a brand-new directory.
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

  return { abs, existed, ...stats };
}

// ── BA Agent system prompt ─────────────────────────────────────────────────
// Interview checklist mirrors questions.md stages 1–13, condensed.
// Output contract: the `idea` fence keys mirror init-frame.js writeIdeaTxt sections.

const SYSTEM_PROMPT = `You are the BA Agent of the "Idea-to-Web-Solution" framework — a business analyst whose
only job in this conversation is to interview the user about a business idea and capture enough
detail to seed a Product Requirements Document (PRD).

HOW TO INTERVIEW
- Start by inviting the user to describe their idea in their own words.
- Then ask clarifying questions — at most 2-3 per reply, never a wall of questions.
- Ask progressively, in roughly this order (skip what the user already covered):
  1. Problem: what pain point, who feels it, how often, what do people use today, evidence it's real.
  2. Users: personas, their goals, tech comfort, whether accounts/login are needed.
  3. Features: what the app must do, rough priority, feature dependencies, what is explicitly OUT of scope.
  4. Rules & data: business rules (permissions, automations, calculations), data entities, file uploads.
  5. Compliance: GDPR / PCI / HIPAA / none.
  6. Brand & design: brand guidelines, mood, sites they admire.
  7. Tech preferences (optional): frontend framework, database, hosting, auth — offer to recommend if unsure.
  8. Timeline & constraints: launch target, budget, team skills, biggest risks.
- Be conversational and concrete. Suggest examples when the user is vague ("e.g. ...").
- Challenge gently when answers are thin: "Who specifically feels this most?" beats accepting hand-waving.

WHEN TO FINISH
- You have enough when you can confidently fill: the problem statement, at least one persona,
  the core feature list, and rough scope. Other fields may be best-effort.
- At that point, SAY SO and ask: "Shall I generate the idea document now?" — wait for confirmation.
- EXCEPTION: if the user at any point says to just proceed / move forward / "you fill it in" /
  "populate it yourself" (or similar), do NOT ask more questions. Immediately finalize, filling
  any gaps with sensible, clearly-labeled assumptions.

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
  "assumptions": ["each gap you filled yourself, labeled as an assumption"]
}
\`\`\`

Rules for the block: valid JSON (double quotes, no comments, no trailing commas); empty string ""
for technical preferences the user deferred; put everything you invented into "assumptions";
never include the block in a normal interview reply — only when finalizing.`;

// ── idea.md writer (mirrors init-frame.js writeIdeaTxt sections) ──────────

function asList(value) {
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  if (typeof value === "string" && value.trim()) {
    // Split on newlines; keep "a; b; c" as one line unless it has newlines
    return value.split("\n").map((v) => v.trim()).filter(Boolean);
  }
  return [];
}

function asText(value, fallback) {
  if (Array.isArray(value)) return value.map((v) => "- " + v).join("\n");
  if (typeof value === "string" && value.trim()) return value.trim();
  return fallback;
}

function buildIdeaTxt(idea) {
  const lines = [];
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
  const stack = [["Frontend", idea.frontend], ["Database", idea.database], ["Hosting", idea.hosting], ["Auth", idea.auth]];
  const stackLines = stack.filter(([, v]) => typeof v === "string" && v.trim()).map(([k, v]) => "- " + k + ": " + v.trim());
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

/** Parse the trailing ```idea fence from a completed assistant reply. Returns null if absent/invalid. */
function extractIdea(fullText) {
  const match = fullText.match(/```idea\s*([\s\S]*?)```/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1]);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeIdeaFile(projectDir, idea) {
  const content = buildIdeaTxt(idea);
  const target = path.join(projectDir, "idea.md");
  let backupPath = null;
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

// ── HTTP helpers ───────────────────────────────────────────────────────────

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("Request too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml" };

function serveStatic(req, res) {
  let urlPath = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  if (urlPath === "/") urlPath = "/index.html";
  const filePath = path.join(PUBLIC_DIR, path.normalize(urlPath));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendJson(res, 403, { error: "Forbidden" });
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      sendJson(res, 404, { error: "Not found" });
      return;
    }
    res.writeHead(200, { "Content-Type": MIME[path.extname(filePath)] || "application/octet-stream" });
    res.end(data);
  });
}

// ── Routes ─────────────────────────────────────────────────────────────────

async function handleHealth(res) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const r = await fetch(OLLAMA + "/api/tags", { signal: controller.signal });
    clearTimeout(timer);
    if (!r.ok) throw new Error("Ollama returned HTTP " + r.status);
    const data = await r.json();
    const names = (data.models || []).map((m) => m.name);
    sendJson(res, 200, {
      ok: true,
      model: MODEL,
      modelPresent: names.includes(MODEL),
      availableModels: names,
    });
  } catch {
    sendJson(res, 503, {
      ok: false,
      model: MODEL,
      message: "Cannot reach Ollama at " + OLLAMA + ". Start it with: ollama serve",
    });
  }
}

async function handleInit(req, res) {
  let body;
  try {
    body = JSON.parse(await readBody(req));
  } catch {
    sendJson(res, 400, { error: "Invalid JSON body" });
    return;
  }
  try {
    const info = initProjectDir(body.dir);
    const sessionId = crypto.randomUUID();
    sessions.set(sessionId, info.abs);

    // Pin the workspace root for any framework session launched from this repo:
    // CLAUDE.md §Workspace Root tells every agent to read project-dir.txt and
    // direct all artifact writes there instead of into the framework repo.
    const pointerPath = path.join(REPO_ROOT, "project-dir.txt");
    fs.writeFileSync(pointerPath, info.abs + "\n", "utf-8");

    sendJson(res, 200, {
      ok: true,
      sessionId,
      dir: info.abs,
      existed: info.existed,
      filesCopied: info.copied,
      filesSkipped: info.skipped,
      workspacePinnedAt: pointerPath,
    });
  } catch (err) {
    sendJson(res, 400, { error: err.message });
  }
}

function validateMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return "Body must include a non-empty messages array.";
  if (messages.length > MAX_MESSAGES) return "Conversation too long (max " + MAX_MESSAGES + " messages). Start a new session.";
  for (const m of messages) {
    if (!m || (m.role !== "user" && m.role !== "assistant")) return "Each message needs role 'user' or 'assistant'.";
    if (typeof m.content !== "string" || !m.content.trim()) return "Each message needs non-empty string content.";
    if (m.content.length > MAX_MESSAGE_CHARS) return "A message exceeds " + MAX_MESSAGE_CHARS + " characters.";
  }
  return null;
}

/** Stream one NDJSON event object per line so the browser can parse incrementally. */
function sendEvent(res, obj) {
  res.write(JSON.stringify(obj) + "\n");
}

async function handleChat(req, res) {
  let body;
  try {
    body = JSON.parse(await readBody(req));
  } catch {
    sendJson(res, 400, { error: "Invalid JSON body" });
    return;
  }

  const projectDir = sessions.get(body.sessionId);
  if (!projectDir) {
    sendJson(res, 400, { error: "No active session — set a project folder first." });
    return;
  }

  const validationError = validateMessages(body.messages);
  if (validationError) {
    sendJson(res, 400, { error: validationError });
    return;
  }

  res.writeHead(200, { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache" });

  let ollamaRes;
  try {
    ollamaRes = await fetch(OLLAMA + "/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        stream: true,
        messages: [{ role: "system", content: SYSTEM_PROMPT }, ...body.messages],
      }),
    });
  } catch {
    sendEvent(res, { type: "error", message: "Cannot reach Ollama. Start it with: ollama serve" });
    res.end();
    return;
  }

  if (!ollamaRes.ok || !ollamaRes.body) {
    const hint = ollamaRes.status === 404
      ? "Model '" + MODEL + "' not found. Pull it with: ollama pull " + MODEL
      : "Ollama error (HTTP " + ollamaRes.status + ").";
    sendEvent(res, { type: "error", message: hint });
    res.end();
    return;
  }

  // Pipe Ollama's NDJSON stream through, accumulating the full reply so we can
  // detect the ```idea block after the stream finishes.
  let full = "";
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for await (const chunk of ollamaRes.body) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const evt = JSON.parse(line);
          const token = evt.message && evt.message.content;
          if (typeof token === "string" && token) {
            full += token;
            sendEvent(res, { type: "token", content: token });
          }
        } catch {
          // Partial line — ignore; remainder stays in buffer
        }
      }
    }
  } catch {
    sendEvent(res, { type: "error", message: "Lost connection to Ollama mid-response." });
    res.end();
    return;
  }

  let doneEvent = { type: "done", model: MODEL };
  const idea = extractIdea(full);
  if (idea) {
    try {
      const result = writeIdeaFile(projectDir, idea);
      doneEvent.ideaWritten = true;
      doneEvent.ideaPath = result.path;
      doneEvent.backupPath = result.backupPath;
      doneEvent.projectName = idea.projectName || null;
    } catch (err) {
      doneEvent.ideaWritten = false;
      doneEvent.ideaWriteError = "Reply looked final but idea.md could not be written: " + err.message;
    }
  }
  sendEvent(res, doneEvent);
  res.end();
}

// ── Server ─────────────────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url && req.url.startsWith("/api/health")) return void handleHealth(res);
  if (req.method === "POST" && req.url === "/api/init") return void handleInit(req, res);
  if (req.method === "POST" && req.url === "/api/chat") return void handleChat(req, res);
  if (req.method === "GET") return serveStatic(req, res);
  sendJson(res, 405, { error: "Method not allowed" });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log("idea-intake running at http://127.0.0.1:" + PORT);
  console.log("  model:  " + MODEL);
  console.log("  ollama: " + OLLAMA);
});
