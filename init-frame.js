#!/usr/bin/env node

/**
 * init-frame.js — Bootstrap mechanism for the Idea-to-Web-Solution Framework.
 *
 * Gap 1 remedy: gives users a single entry point to initialize the framework
 * in any target directory and answer the foundational questions that drive all
 * downstream stages (PRD, design, code selection).
 *
 * Maps to questions.md: condenses 68 questions into 15 by collapsing each stage
 * into one conversation. Suggestions guide the user toward useful answers without
 * feeling like a form. Unused sections are skipped silently.
 *
 * MVP additions covered: #1 bootstrap mechanism, #6 stack selection questionnaire.
 * Also seeds idea.md with initial answers so the Main Orchestrator has signal to work from.
 *
 * Structure contract: this script does NOT hardcode the framework layout. It reads
 * framework/manifest.json (schema: framework/MANIFEST.md) — the export root is
 * copied wholesale, stage folders are validated against it, and outside-export
 * artifacts are referenced from its outside_export_root map. Structure evolves
 * via the manifest, not via launcher code changes.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";

// ── Helpers ────────────────────────────────────────────────────────────────

const cwd = process.cwd();
const rl = createInterface({ input: process.stdin, output: process.stdout });

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => resolve(answer.trim()));
  });
}

function confirm(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt + " [y/N]: ", (answer) => {
      resolve(["y", "yes"].includes(answer.toLowerCase()));
    });
  });
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ── Framework manifest (the only structure contract) ───────────────────────

// Framework repo root — this script lives at the repo root.
const SOURCE_DIR = path.dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = path.join(SOURCE_DIR, "framework", "manifest.json");

/**
 * Load and validate framework/manifest.json. Fail fast — before the interview —
 * so the user never answers 15 questions only to hit a broken scaffold.
 */
function loadManifest() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    console.error("Error: framework manifest not found at " + MANIFEST_PATH);
    console.error("init-frame.js reads framework/manifest.json for the structure — it is no longer hardcoded.");
    process.exit(1);
  }
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf-8"));
  } catch (err) {
    console.error("Error: framework/manifest.json is not valid JSON: " + err.message);
    process.exit(1);
  }
  if (!manifest.export_root || typeof manifest.stages !== "object" || manifest.stages === null) {
    console.error('Error: manifest.json must define "export_root" and a "stages" object (see framework/MANIFEST.md).');
    process.exit(1);
  }
  if (!Array.isArray(manifest.root_files) || manifest.root_files.length === 0) {
    console.error('Error: manifest.json must define a non-empty "root_files" array (see framework/MANIFEST.md).');
    process.exit(1);
  }
  for (const [id, stage] of Object.entries(manifest.stages)) {
    if (!stage || typeof stage.folder !== "string") {
      console.error('Error: manifest stage "' + id + '" is missing its "folder" path (see framework/MANIFEST.md).');
      process.exit(1);
    }
  }
  return manifest;
}

// ── The 15 questions (consolidated from questions.md) ──────────────────────

/** Each entry: { key, label, hint, suggest — one per grouped question from questions.md } */
const QUESTION_GROUPS = [
  // Group A: Core Idea (PRD §1-4)
  {
    key: "problemStatement",
    label: "Problem & Value",
    desc: "What core problem are you solving, and for whom?",
    suggest: "(e.g. Small businesses waste 5+ hours/week manually reconciling invoices across spreadsheets)",
    source: "questions.md Q1, Q2, Q5",
  },
  {
    key: "problemLandscape",
    label: "Problem & Evidence",
    desc: "What do people use today to solve this, and what tells you it's worth solving?",
    suggest: "(e.g. 'Currently using Excel + QuickBooks — no automation; spoke with 12 accountants all using the same workaround; market growing 23% YoY')",
    source: "questions.md Q3, Q4",
  },

  // Group B: Users (PRD §5)
  {
    key: "personas",
    label: "Target Users",
    desc: "Who are the main personas? Describe each briefly.",
    suggest: "(e.g. Freelance accountant — tech comfort: medium; Bookkeeping firm owner — tech comfort: low to medium; End customer whose invoices get processed — rarely sees the tool)",
    source: "questions.md Q7, Q8, Q9",
  },

  // Group C: Features & Scope (PRD §6-8, 10)
  {
    key: "features",
    label: "Key Features",
    desc: "What should the app do? List features in rough priority order.",
    suggest: "(e.g. 1) Invoice OCR scan — 2) Recurring invoice scheduling — 3) Client portal for payments — 4) Export to QuickBooks)",
    source: "questions.md Q13, Q14",
  },
  {
    key: "outOfScope",
    label: "Out of Scope",
    desc: "What should NOT be built in this phase? (helps the BA Agent know what to ignore)",
    suggest: "(e.g. Mobile app — desktop-only for now; Multi-currency — v2; AI categorization — too risky for MVP)",
    source: "questions.md Q18",
  },

  // Group D: Business Rules & Data (PRD §6, 12)
  {
    key: "businessRules",
    label: "Business Rules",
    desc: "What rules govern how features work? (permissions, automations, calculations)",
    suggest: "(e.g. Only account owners can delete invoices; Invoices auto-send reminders at day 7 overdue; Prices always round to 2 decimal places)",
    source: "questions.md Q19, Q20",
  },
  {
    key: "dataModel",
    label: "Data & Content",
    desc: "What data will users create, read, or manage? Any file/media uploads?",
    suggest: "(e.g. Invoices — client_id, amount, due_date; Clients — name, email; Uploads: PDF invoices up to 10MB, receipt photos JPEG/PNG)",
    source: "questions.md Q15, Q25, Q26",
  },

  // Group D continued: Compliance & Security (PRD §6, 12; security.md)
  {
    key: "compliance",
    label: "Compliance & Security",
    desc: "Any compliance needs or data sensitivity to account for?",
    suggest: "(e.g. GDPR if handling EU customer data — collect consent; PCI-DSS if processing payments; HIPAA if health data; Otherwise standard TLS + encrypt sensitive fields)",
    source: "questions.md Q21, Q44",
  },

  // Group F: Design & Brand (Design Agent)
  {
    key: "brandPrefs",
    label: "Brand & Design",
    desc: "Any brand guidelines or visual direction? If not, describe the mood you want.",
    suggest: "(e.g. Colors: navy + white + green accent; Minimal, professional — like Stripe's dashboard; OR 'I have no preferences — surprise me' (Design Agent will define a palette))",
    source: "questions.md Q29, Q31",
  },
  {
    key: "designRefs",
    label: "Design References",
    desc: "Any sites or apps you admire that could inform the visual direction? (optional)",
    suggest: "(e.g. The clean tables in Airtable; the onboarding flow in Notion — nothing too playful, keep it professional)",
    source: "questions.md Q30",
  },

  // Group G: Tech Stack (Code Builder config)
  {
    key: "frontend",
    label: "Frontend Framework",
    desc: "Frontend framework preference? (or let the Main Orchestrator recommend)",
    options: [
      "[1] Next.js / React   SSR, largest ecosystem, best for SEO",
      "[2] Vue / Nuxt       Gentle learning curve, great DX",
      "[3] SvelteKit        Smallest bundle, fastest runtime",
      "[4] Angular          Enterprise-grade, opinionated",
    ],
    suggest: "If unsure: Next.js/React is the safest default — big community, lots of templates.",
    map: { "1": "Next.js / React", "2": "Vue / Nuxt", "3": "SvelteKit", "4": "Angular" },
    source: "questions.md Q36",
  },
  {
    key: "database",
    label: "Database",
    desc: "Database preference?",
    options: [
      "[1] PostgreSQL       Relational, ACID, best for complex queries",
      "[2] SQLite           Lightweight, embedded, great for small apps",
      "[3] MongoDB          Document store, flexible schema",
      "[4] Supabase         Managed PostgreSQL with auth + realtime",
    ],
    suggest: "If unsure: PostgreSQL is the default — works for almost everything.",
    map: { "1": "PostgreSQL", "2": "SQLite", "3": "MongoDB", "4": "Supabase" },
    source: "questions.md Q37",
  },
  {
    key: "hosting",
    label: "Hosting Platform",
    desc: "Where should this be hosted?",
    options: [
      "[1] Vercel           Zero-config deployment (Next.js native)",
      "[2] Railway          Full-stack PaaS, supports all frameworks",
      "[3] Netlify          Static + serverless functions",
      "[4] Self-hosted      Full control, your own infrastructure",
    ],
    suggest: "If unsure: Vercel for Next.js apps — it's zero-config.",
    map: { "1": "Vercel", "2": "Railway", "3": "Netlify", "4": "Self-hosted" },
    source: "questions.md Q38",
  },
  {
    key: "auth",
    label: "Authentication",
    desc: "How should users log in?",
    options: [
      "[1] Clerk            Easy setup, social logins out of the box",
      "[2] NextAuth (Auth.js)  Open-source, provider-rich",
      "[3] Supabase Auth    If using Supabase DB",
      "[4] Custom JWT       Full control, more implementation work",
    ],
    suggest: "If unsure: Clerk — handles email/password + Google/Apple/SSO with minimal setup.",
    map: { "1": "Clerk", "2": "NextAuth (Auth.js)", "3": "Supabase Auth", "4": "Custom JWT" },
    source: "questions.md Q39, Q40",
  },

  // Group H: Timeline & Constraints (PRD §3, 10-12)
  {
    key: "timeline",
    label: "Timeline & Constraints",
    desc: "Target launch date? Team skills? Budget? Biggest risks?",
    suggest: "(e.g. 'Demo in 4 weeks; team only knows React; budget under $50/mo hosting; biggest risk is OCR accuracy')",
    source: "questions.md Q55, Q56, Q65, Q67",
  },
];

// ── Interactive questions ──────────────────────────────────────────────────

async function askFoundation() {
  console.log("");
  console.log("=".repeat(60));
  console.log("  Idea-to-Web-Solution Framework -- Bootstrap");
  console.log("=".repeat(60));
  console.log("");

  // Target directory
  let targetDir = await question("Target directory for the framework: ");
  if (!targetDir) {
    targetDir = ".";
  }
  const absTarget = path.resolve(cwd, targetDir);

  if (!fs.existsSync(absTarget)) {
    const create = await confirm("Create directory " + absTarget + "?");
    if (!create) {
      console.log("Aborted. Run again with a valid or new directory.");
      process.exit(1);
    }
    ensureDir(absTarget);
  }

  console.log("");
  console.log("Framework will be initialized in: " + absTarget);
  console.log("");

  // Project name
  let projectName = await question("Project / business name: ");
  if (!projectName) {
    projectName = "My App";
  }

  return { targetDir, absTarget, projectName };
}

/**
 * Ask the consolidated 15 questions across grouped stages.
 * Each stage gets a heading + brief intro; individual questions are numbered per-stage.
 * Suggestions appear as grey hints below each prompt. Empty answers use TBD.
 */
async function askAllQuestions() {
  const vars = {};

  let stageNum = 0;
  for (let groupIdx = 0; groupIdx < QUESTION_GROUPS.length; groupIdx++) {
    const g = QUESTION_GROUPS[groupIdx];

    // Print stage heading when it changes
    if (stageNum !== g.label) {
      stageNum = g.label;
      console.log("");
      console.log("-".repeat(60));
      console.log("  Stage: " + g.label);
      console.log("-".repeat(60));
      console.log("");
    }

    // Show description and suggestion
    console.log(g.desc);
    if (g.suggest) {
      console.log("  Suggestion: " + g.suggest);
    }

    // Show options if applicable
    if (g.options) {
      console.log(g.options.join("\n"));
    }

    const answer = await question("   > ");
    vars[g.key] = answer || "(TBD -- BA Agent will follow up during Stage 1)";
  }

  // Clean up: remove TBD answers so they don't pollute idea.md
  Object.keys(vars).forEach((k) => {
    if (vars[k].startsWith("(TBD")) delete vars[k];
  });

  return vars;
}

// ── Scaffold & file writing ────────────────────────────────────────────────

function scaffoldFramework(absTarget, vars, manifest) {
  process.chdir(absTarget);

  // Copy framework files from source repo into new directory
  if (fs.existsSync(SOURCE_DIR)) {
    // 0. Root files: framework-meta docs copied alongside the export root.
    //    The manifest lists them so the launcher never hardcodes filenames.
    for (const file of manifest.root_files) {
      const src = path.join(SOURCE_DIR, file);
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, path.join(absTarget, file));
      }
    }

    // 1. Copy the export root wholesale — everything under framework/ ships
    //    into the new project (settled position 7: manifest-driven, no dir list).
    const exportSrc = path.join(SOURCE_DIR, manifest.export_root);
    if (fs.existsSync(exportSrc)) {
      copyRecursive(exportSrc, path.join(absTarget, manifest.export_root));
    }

    // 2. Guarantee the per-stage tri-fold (skills/, config/, agents/) even where
    //    git could not carry empty directories — the manifest promises it.
    for (const stage of Object.values(manifest.stages)) {
      for (const leaf of ["skills", "config", "agents"]) {
        ensureDir(path.join(absTarget, manifest.export_root, stage.folder, leaf));
      }
    }

    // 3. Reference the outside-export-root artifacts. These have a different
    //    lifecycle than framework/ (settled position 4): the manifest lists them
    //    so the scaffold consumes exactly what it declares — no more, no less.
    for (const entry of Object.values(manifest.outside_export_root || {})) {
      if (typeof entry !== "string" || !entry) continue;
      const src = path.join(SOURCE_DIR, entry);
      if (fs.existsSync(src)) {
        copyRecursive(src, path.join(absTarget, entry));
      }
    }

    // 4. Validate the export against the manifest — every file the contract
    //    promises must exist in the scaffolded project. Warnings, not failures:
    //    a missing template should be visible, not block a bootstrap.
    validateManifestExport(absTarget, manifest);
  }

  console.log("\nFramework scaffolding created in: " + absTarget);

  return vars;
}

/**
 * Check every path the manifest lists (stage skills/config/agents/templates,
 * shared_inputs, shared.skills) against the scaffolded export. Paths are
 * relative to export_root. Missing entries are warned about so the gap between
 * contract and tree is visible at every bootstrap.
 */
function validateManifestExport(absTarget, manifest) {
  const listed = [];
  for (const stage of Object.values(manifest.stages)) {
    for (const key of ["skills", "config", "agents", "shared_inputs", "templates"]) {
      for (const rel of stage[key] || []) listed.push(rel);
    }
  }
  if (manifest.shared && Array.isArray(manifest.shared.skills)) {
    for (const rel of manifest.shared.skills) listed.push(rel);
  }

  const missing = listed.filter(
    (rel) => !fs.existsSync(path.join(absTarget, manifest.export_root, rel))
  );
  if (missing.length > 0) {
    console.warn("\nWarning: manifest lists entries missing from the export (contract ≠ tree):");
    for (const rel of missing) console.warn("  - " + rel);
  }
}

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    ensureDir(dest);
    const entries = fs.readdirSync(src);
    for (const entry of entries) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    // Skip init-frame.js itself to avoid recursion
    if (path.basename(src) === "init-frame.js") return;
    fs.copyFileSync(src, dest);
  }
}

function writeIdeaTxt(absTarget, vars) {
  const lines = [];
  const name = vars.projectName || "My App";
  lines.push("# " + name);
  lines.push("");
  lines.push("## Problem Statement");
  lines.push(vars.problemStatement || "TBD -- BA Agent will fill this during Stage 1.");
  lines.push("");
  lines.push("## Target Users / Personas");
  if (vars.personas) {
    vars.personas.split("\n").forEach((line) => lines.push("- " + line.trim()));
  } else {
    lines.push("- TBD");
  }
  lines.push("");
  lines.push("## Current Solutions & Evidence");
  lines.push(vars.problemLandscape || "TBD -- BA Agent will capture during Stage 1.");
  lines.push("");
  lines.push("## Key Features (Priority Order)");
  if (vars.features) {
    vars.features.split("\n").forEach((line) => lines.push("- " + line.trim()));
  } else {
    lines.push("- TBD");
  }
  lines.push("");
  lines.push("## Out of Scope");
  lines.push(vars.outOfScope || "- None specified");
  lines.push("");
  lines.push("## Business Rules");
  lines.push(vars.businessRules || "- TBD -- BA Agent will capture during Stage 1.");
  lines.push("");
  lines.push("## Data Entities");
  lines.push(vars.dataModel || "- TBD");
  lines.push("");
  lines.push("## Compliance & Security");
  lines.push(vars.compliance || "- Standard TLS + encryption at rest assumed unless specified");
  lines.push("");
  lines.push("## Tech Stack Preferences");
  if (vars.frontend)   lines.push("- Frontend: " + vars.frontend);
  if (vars.database)   lines.push("- Database: " + vars.database);
  if (vars.hosting)    lines.push("- Hosting: " + vars.hosting);
  if (vars.auth)       lines.push("- Auth: " + vars.auth);
  lines.push("");
  lines.push("## Brand & Design Direction");
  lines.push(vars.brandPrefs || "- TBD -- Design Agent will define palette and style");
  lines.push("");
  if (vars.designRefs) {
    lines.push("## Design References");
    lines.push(vars.designRefs);
    lines.push("");
  }
  lines.push("## Timeline & Constraints");
  lines.push(vars.timeline || "- TBD -- BA Agent will capture during Stage 1.");
  lines.push("");
  lines.push("## Notes");
  const today = new Date().toISOString().split("T")[0];
  lines.push("- Idea captured on " + today);
  lines.push("- Framework initialized via init-frame.js -- see questions.md for the full questionnaire (68 questions)");

  const content = lines.join("\n") + "\n";
  const dest = path.join(absTarget, "idea.md");
  fs.writeFileSync(dest, content, "utf-8");
}

function writeQuickstart(absTarget) {
  const lines = [];
  lines.push("# Quick Start -- Using This Framework");
  lines.push("");
  lines.push("## First-Time Setup (you just did this)");
  lines.push("");
  lines.push("You ran `node init-frame.js` and answered the bootstrap questions.");
  lines.push("Your idea is stored in `idea.md`.");
  lines.push("");
  lines.push("## Next Steps");
  lines.push("");
  lines.push("1. **Open this project in Claude Code** -- run `claude` in this directory.");
  lines.push("2. **Tell Claude you want to use the framework** -- e.g. \"Run the Idea-to-Web-Solution Framework.\"");
  lines.push("3. The Main Orchestrator will read `idea.md`, spawn the BA Agent to fill out the PRD, then proceed through Design -> Code -> Review -> QA -> Deployment stages.");
  lines.push("");
  lines.push("## Stage Overview");
  lines.push("");
  lines.push("| Stage | What happens | Output |");
  lines.push("|-------|-------------|--------|");
  lines.push("| 1. Requirements | BA + Reviewer agents interview you, write PRD | `PRD/<project>/prd.md` |");
  lines.push("| 2. Design | Design agents create tokens, wireframes, states | `design-system/<project>/` |");
  lines.push("| 3. Code | 3 code agents build features in parallel | your chosen template with full code |");
  lines.push("| 4. Review | All agents review code adversarially | Reviewed + approved PR |");
  lines.push("| 5. QA | QA Agent runs Playwright tests against requirements | Test report, pass/fail |");
  lines.push("| 6. Deploy | Artifacts documented, summary written | Deployment guide |");
  lines.push("");
  lines.push("## If You Get Stuck");
  lines.push("");
  lines.push("- See `AGENTS.md` for agent roles and how they communicate.");
  lines.push("- See `CLAUDE.md` for the full framework philosophy and skill invocation rules.");
  lines.push("- `gaps.md` lists known gaps; see `README.md` for the project roadmap.");

  const content = lines.join("\n") + "\n";
  const dest = path.join(absTarget, "QUICKSTART.md");
  fs.writeFileSync(dest, content, "utf-8");
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  try {
    // Phase 0: Load the structure contract — fail fast, before the interview
    const manifest = loadManifest();

    // Phase 1: Foundation (target dir + project name)
    const foundation = await askFoundation();

    // Phase 2: The 15 consolidated questions (from questions.md)
    const vars = await askAllQuestions();
    // Merge foundation
    Object.assign(vars, foundation);

    // Phase 3: Scaffold the framework structure (manifest-driven)
    scaffoldFramework(foundation.absTarget, vars, manifest);

    // Write idea.md with gathered answers
    writeIdeaTxt(foundation.absTarget, vars);

    // Write QUICKSTART.md
    writeQuickstart(foundation.absTarget);

    rl.close();

    console.log("");
    console.log("=".repeat(60));
    console.log("  Bootstrap Complete!");
    console.log("=".repeat(60));
    console.log("");
    console.log("Framework initialized in: " + foundation.absTarget);
    console.log("");
    console.log("Next step: Open that directory and run 'claude' to invoke the framework.");
    console.log("(See QUICKSTART.md for full instructions.)");
    console.log("");
  } catch (err) {
    console.error("\nError during bootstrap:", err.message);
    process.exit(1);
  }
}

main();
