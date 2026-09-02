// Gate state for the four context-locked project tabs (Sprint, Design, Build,
// QA) — see launcher/CLAUDE.md §Per-project model and mockups.html N11b.
//
// No confirmation API exists yet: the sitemap's State D "Project context
// ready" confirmation view (one-shot unlock after all 17 Project Background
// docs are Approved) will own this per project. Until it lands, the gate is
// a single compile-time constant so the locked-row UI is fully wired and
// only the source of the flag has to change.
// TODO(sitemap State D): replace with the project context-confirmation field
// from the API once that endpoint exists.
export const CONTEXT_CONFIRMED = false;