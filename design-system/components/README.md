# Design System Components

Component specifications that every Code Agent must implement faithfully. Each component includes structure, states, tokens used, and accessibility requirements.

## How to Use This Directory

Each component lives in its own file. Design Agents define these components for the project. Code Agents implement them exactly as specified.

## Component Index

| Component | File | Where Used |
|-----------|------|------------|
| Button | `button.md` | CTAs, actions, navigation |
| Card | `card.md` | Content containers, data displays |
| Form Input | `form-input.md` | All user input fields |
| Navigation | `navigation.md` | Headers, footers, sidebars, breadcrumbs |

## Component Rules (All Components)

1. **Every component must accept the `variant` prop** to switch between visual variants defined in the spec
2. **Every component must define all interaction states** from `states/` directory
3. **All tokens from `tokens/` directory are required inputs** — components reference them, never hardcode values
4. **Each component file must include**: props API, variant table, state table, accessibility notes, and a CSS implementation note
5. **Components are CSS-implementable only** — if a design requires JavaScript to achieve, flag it explicitly
