# Idea-to-Web-Solution Framework

An intelligent multi-agent system that takes a business idea and produces a fully specified, designed, coded, and tested web application.

## How It Works

```
Idea (idea.txt)
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

```
├── idea.txt                     # Living idea document (source of truth)
├── CLAUDE.md                    # Framework rules and workflow docs
├── AGENTS.md                    # Agent roles, states, communication
├── PRD/                         # Product requirements per project
│   └── templates/               # PRD template for BA Agent
├── design-system/               # Design specs per project
│   ├── tokens/                  # Color, typography, spacing tokens
│   ├── components/              # Component specifications
│   └── states/                  # Interaction state definitions
├── code-builder/                # Code generation tools
│   ├── config-rules.md          # Tech stack selection guide
│   └── templates/               # Starter project scaffolds
├── skills/                      # Agent skill base (every agent references these)
│   ├── coding-guidelines.md
│   ├── security-guidelines.md
│   ├── accessibility-guidelines.md
│   └── general-best-practices.md
├── testing/                     # Test generation and execution
│   └── playwright/              # UI test patterns and helpers
└── workflows/                   # Orchestration scripts for agent coordination
```

## Getting Started

1. Update `idea.txt` with your business idea, target audience, and pain points
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
