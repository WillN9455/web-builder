# Idea Intake — Chat UI for Stage 0

A zero-dependency chat interface where a user types a business idea and a local LLM
(Ollama), acting as the framework's **BA Agent**, interviews them until there is enough
content to seed a PRD — or until the user says *"just proceed / fill it in yourself"*.

## Project folder first

Before the interview starts, the UI asks **where the project should live**. The server:
- creates the folder if needed (**must be outside the framework repo** — writes inside it
  would overwrite the framework itself, so those paths are rejected);
- scaffolds the framework structure into it (`skills/`, `design-system/`, `PRD/`,
  `code-builder/`, `testing/`, `workflows/` + root docs) — **skipping any existing file**;
- writes the captured `idea.md` there (backing up an existing one to
  `idea.md.bak.<ts>`), never touching the framework repo's artifacts;
- pins the choice by writing `project-dir.txt` (one line: the absolute path) into the
  **framework repo root**. Per `CLAUDE.md` §Workspace Root, any agent session launched
  from the framework repo then directs all artifact writes to that folder. Delete
  `project-dir.txt` to make the framework repo its own workspace again.

Result: a self-contained project folder you open in Claude Code to run the framework stages —
and a pointer so orchestration from this repo targets it too.

## Run it

```bash
ollama serve                          # if not already running
node idea-intake/server.js
# open http://127.0.0.1:4310
```

No `npm install` needed — Node 18+ only (uses global `fetch`).

## Config (env vars)

| Var | Default | Purpose |
|-----|---------|---------|
| `IDEA_MODEL` | `qwen3.6:35b-extended` | Ollama model the BA Agent uses |
| `OLLAMA_HOST` | `http://127.0.0.1:11434` | Ollama API base URL |
| `PORT` | `4310` | Listen port (bound to 127.0.0.1 only) |

## How finishing works

1. The agent asks 2–3 progressive questions per turn (problem → users → features/scope →
   rules/data → compliance → brand → tech → timeline — condensed from `questions.md`).
2. When it judges the content sufficient (at minimum: problem, personas, core features,
   scope) it asks to generate. It also finalizes immediately if the user tells it to
   proceed or asks it to populate the document itself.
3. Finalization = a ```` ```idea ```` fenced JSON block at the end of the reply.
   The server parses it, **backs up any existing `idea.md` in the project folder**, and
   writes the new file. Fields the agent invented are listed under an **Assumptions**
   section so the user can confirm or correct them.
4. The UI shows a success banner with the file path and the next step
   (open the project folder in Claude Code → Stage 1 PRD).

## Relationship to `init-frame.js`

Both do the same job — bootstrap a project folder and seed `idea.md`:

- `init-frame.js` — CLI: 15 static questions, linear, form-like.
- `idea-intake/` — conversational: dynamic interview driven by the model, better for
  exploration, with an explicit "let the agent fill the gaps" escape hatch.

Both produce the same `idea.md` shape and scaffold the same framework structure.
Use whichever fits the moment.
