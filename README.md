# Idea-to-Web-Solution Framework

An intelligent multi-agent system that takes a business idea and produces a fully specified, designed, coded, and tested web application.

## How It Works

```
Idea (idea.md)
    ↓
[Stage 1] Product Requirements → PRD/<project>/prd.md
    ↓
[Stage 2] Design System → design-system/
    ↓
[Stage 3] Code Generation → Feature branches
    ↓
[Stage 4] Review → Dev reviewers + BA/Design agents
    ↓
[Stage 5] QA Testing → Playwright UI tests
    ↓
[Stage 6] Deployment → Ready for staging/prod
```

## Project Structure

All files below link to each other via cross-references defined in [`FRAMEWORK-FLOW.md`](./FRAMEWORK-FLOW.md) and throughout each file's "Related Files" / "Cross-references" sections. See that table for the complete dependency graph.

```
<project-repo>/
├── idea.md                      # Living idea document (source of truth) → feeds PRD template
├── CLAUDE.md                    # Framework rules and workflow docs
├── FRAMEWORK-FLOW.md            # Complete file dependency / cross-reference table
├── AGENTS.md                    # Agent roles, states, communication (+ agent-specific file references in each row)
├── PRD/                         # Product requirements per project (copied at export time)
│   └── templates/prd-template.md # PRD template with input/output chain cross-references
├── design-system/               # Design stage OUTPUT — created per project during the design stage
│   ├── tokens/                  # Color, typography, spacing tokens (each has "Related Files" → components/skills)
│   ├── components/              # Component specifications (each has "Related Files" → tokens/states/skills)
│   └── states/                  # Interaction state definitions (each has "Cross-References" → tokens/components/QA)
├── framework/                   # The stage rule library (copied at export time; contract: framework/manifest.json)
│   ├── design/                  #   Design stage — skills/ (a11y, UI), config/, agents/
│   ├── build/                   #   Build stage — skills/ (coding, quality, fidelity), config/, agents/
│   ├── qa/                      #   QA stage — skills/ (testing guidelines + playwright helpers), config/, agents/
│   ├── review/                  #   Review stage — config/ (review bar, severity ladder), agents/
│   ├── shared/                  #   Rule bodies consumed by 2+ stages (security, general best practices)
│   └── templates/               #   Starter scaffolds (nextjs-starter/) + template-selection doc
└── workflows/                   # Orchestration scripts for agent coordination (copied at export time)
    └── README.md                # Workflow patterns with file dependency map (§all 5 workflows: reads-from / writes-to / triggers)
```

Skills and stage configs live inside `framework/` — stage rulebooks in `framework/<stage>/`, shared bodies in `framework/shared/skills/`, starter scaffolds in `framework/templates/`.

## How Cross-References Work

Every major file in this framework has a **"Related Files"** or **"Cross-references"** section that explicitly maps:

1. **Input chain** — which upstream files feed into this file (what it reads from)
2. **Output chain** — which downstream files consume this file's output
3. **Related files** — which other files are complementary (e.g., a skill file and the state docs it governs)

The canonical index of all cross-references is in [`FRAMEWORK-FLOW.md`](./FRAMEWORK-FLOW.md). This is the single source of truth for "what does what file need to build X?".

## Getting Started

1. Update `idea.md` with your business idea, target audience, and pain points
2. Run the framework — Claude Code agents will guide you through each stage
3. The framework handles requirements gathering, design, code generation, review, testing, and deployment prep

## Agent Roles

| Role | Purpose | Count |
|------|---------|-------|
| Main Orchestrator | Manages task flow between stages | 1 |
| BA Agent | Writes PRDs from ideas/personas | 1 |
| Requirements Reviewer | Adversarially critiques requirements | 1 |
| Design Agents | Creates designs, peer reviews each other | 2 |
| Code Agents | Builds features in parallel | 3 |
| Dev Reviewers | Reviews code for maintainability, security, accessibility | 3 |
| QA Agent | Tests features against requirements with Playwright | 1 |

See [`AGENTS.md`](./AGENTS.md) for detailed specifications.

## Framework Phases

### Stage 1: Requirements Gathering
BA Agent asks clarifying questions, fills the PRD template, then Requirements Reviewer adversarially critiques until agreement.

### Stage 2: Design Generation
Design Agents define tokens (colors, typography, spacing), create component specs with all interaction states, and peer-review each other's work. WCAG AA compliance is verified.

### Stage 3: Code Generation
Tech stack confirmed via `framework/build/config/config-rules.md`. Scaffolded from templates. Three Code Agents build features in parallel on separate branches with unit tests.

### Stage 4: Review
Three Dev Reviewers check code across dimensions (maintainability, security, accessibility). BA + Design agents verify output via Playwright runs.

### Stage 5: QA Testing
Full Playwright UI test suite generated per feature. Tests against PRD requirements. Pass → deploy. Fail → back to dev with details.

### Stage 6: Deployment
All artifacts documented. Summary of what was built, tested, and known limitations produced.

## Contributing to the Framework

This framework is designed to evolve. When you discover gaps during projects:

- **New skill needed?** Add to the owning stage's `framework/<stage>/skills/` (or `framework/shared/skills/` when 2+ stages consume it)
- **New component pattern?** Add to `design-system/components/`
- **New interaction state?** Add to `design-system/states/`
- **New tech stack option?** Update `framework/templates/` and `framework/build/config/config-rules.md`
- **PRD template gap?** Extend `PRD/templates/prd-template.md`

## License

MIT — see [`LICENSE`](./LICENSE)
