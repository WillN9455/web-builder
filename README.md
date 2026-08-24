# Idea-to-Web-Solution Framework

An intelligent multi-agent system that takes a business idea and produces a fully specified, designed, coded, and tested web application.

## How It Works

```
Idea (idea.md)
    ↓
[Stage 1] Product Requirements → PRD/<project>/prd.md
    ↓
[Stage 2] Design System → design-system/<project>/
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
├── idea.md                     # Living idea document (source of truth) → feeds PRD template
├── CLAUDE.md                    # Framework rules and workflow docs
├── FRAMEWORK-FLOW.md            # Complete file dependency / cross-reference table (moved from CLAUDE.md)
├── AGENTS.md                    # Agent roles, states, communication (+ agent-specific file references in each row)
├── PRD/                         # Product requirements per project
│   └── templates/prd-template.md # PRD template with input/output chain cross-references
├── design-system/               # Design specs per project
│   ├── tokens/                  # Color, typography, spacing tokens (each has "Related Files" → components/skills)
│   │   ├── README.md            # Token index + downstream consumer links to templates/components
│   │   ├── color.md             # Semantic palette → state docs (error/warning/info colors)
│   │   ├── typography.md        # Type scale → component specs (button/card/form-nav text sizes)
│   │   └── spacing.md           # Spacing scale → component padding/border-radius/gap values
│   ├── components/              # Component specifications (each has "Related Files" → tokens/states/skills)
│   │   ├── README.md            # Component index + cross-reference map table for every component's token/state deps
│   │   ├── button.md            # CTA spec — links to color tokens, all states, accessibility guidelines
│   │   ├── card.md              # Data display spec — links to neutral colors, empty/loading states
│   │   ├── form-input.md        # Input spec — links to validation state, semantic colors, UI best practices
│   │   └── navigation.md        # Nav spec — links to brand colors, interaction states, accessibility guidelines
│   └── states/                  # Interaction state definitions (each has "Cross-References" → tokens/components/QA)
│       ├── README.md            # State index + mapping table for each file's token/color/component/QA cross-refs
│       ├── error.md             # Error banner spec — links to semantic palette, UI best practices §2
│       ├── loading.md           # Skeleton/spinner spec — links to neutral brand colors, UI best practices §1
│       ├── success.md           # Success banner spec — links to semantic success palette, UI best practices §3
│       ├── empty.md             # Empty content spec — links to neutral-600/400 colors, UI best practices §2.5
│       ├── validation.md        # Form validation spec — links to semantic palette, form-input component, UI best practices §7
│       └── interaction.md       # All interactive states — links to brand colors, accessibility guidelines, all components
├── code-builder/                # Code generation tools
│   ├── config-rules.md          # Tech stack selection guide (→ PRD §3 Constraints; → templates)
│   └── templates/               # Starter project scaffolds (→ config-rules selection; → each skill file)
│       ├── README.md            # Template index + template→skill mapping table + cross-references for stack selection
│       └── nextjs-starter/      # Scaffolded project (layout.tsx/globals.css have inline cross-reference comments)
├── skills/                      # Agent skill base (each has "Related Files" → other files)
│   ├── coding-guidelines.md     # File structure/naming (+ links to templates, testing, security)
│   ├── security-guidelines.md   # Security standards (+ links to security.md detailed checklist, workflow 4)
│   ├── accessibility-guidelines.md # WCAG guidelines (+ links to token contrast decisions, state docs, ui-best-practices)
│   ├── general-best-practices.md # Cross-agent rules (+ links to PRD template, AGENTS.md, workflows)
│   ├── code-quality.md          # Duplication/race/timezone prevention (+ links to PRD scope, coding-guidelines, testing)
│   ├── feature-fidelity.md      # Design drift/regression prevention (+ links to component specs, token files, ui-best-practices)
│   ├── security.md              # Detailed security checklist with examples (+ referenced by all agents via AGENTS.md triggers)
│   └── ui-best-practices.md     # UI completeness checklist (+ links to state docs, accessibility guidelines, form-input component)
├── testing/                     # Test generation and execution
│   └── playwright/README.md     # Playwright patterns (→ PRD user stories; → state docs for each test type; → CLAUDE.md workflows)
└── workflows/                   # Orchestration scripts for agent coordination
    └── README.md                # Workflow patterns with file dependency map (§all 5 workflows: reads-from / writes-to / triggers)
```

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
Tech stack confirmed via `code-builder/config-rules.md`. Scaffolded from templates. Three Code Agents build features in parallel on separate branches with unit tests.

### Stage 4: Review
Three Dev Reviewers check code across dimensions (maintainability, security, accessibility). BA + Design agents verify output via Playwright runs.

### Stage 5: QA Testing
Full Playwright UI test suite generated per feature. Tests against PRD requirements. Pass → deploy. Fail → back to dev with details.

### Stage 6: Deployment
All artifacts documented. Summary of what was built, tested, and known limitations produced.

## Contributing to the Framework

This framework is designed to evolve. When you discover gaps during projects:

- **New skill needed?** Add to `skills/`
- **New component pattern?** Add to `design-system/components/`
- **New interaction state?** Add to `design-system/states/`
- **New tech stack option?** Update `code-builder/templates/` and `config-rules.md`
- **PRD template gap?** Extend `PRD/templates/prd-template.md`

## License

MIT — see [`LICENSE`](./LICENSE)
