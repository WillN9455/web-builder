// Build-tab markdown helpers (build-story-requirements.md §6 — notes are
// markdown-safe, rules/guidelines render headings + lists).
//
// Local to the build tab: DesignStoryScreen keeps its own private markdownLite
// (a design-owned file the build branch must not edit — SA-R-01), so a shared
// module is created here instead of cross-copying between the two Build
// components. Every renderer escapes HTML first — the server already rejects
// '<' in note bodies (assertion 5), so escape-then-format is defense in depth;
// these functions never render raw stored bytes as HTML.

// Escape HTML entities before any formatting so stored text can never inject
// markup into the rendered DOM.
export function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function inline(s: string): string {
  return s
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

// Markdown-lite for note bodies: **bold**, *italic*, `code`. No links, no
// headings — the notes surface is lightweight by design (FR-16).
export function markdownLite(raw: string): string {
  return (esc(raw) as string)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

export function NoteBody({ body }: { body: string }) {
  const html = markdownLite(body);
  // eslint-disable-next-line react/no-danger
  return <p dangerouslySetInnerHTML={{ __html: html }} />;
}

// Markdown body for the rules / per-agent guideline cards (FR-9/FR-10):
// headings (#/##/###), `- ` bullet lists, bold, italic, code, blank-line
// paragraph breaks. Escape-then-format — input is never trusted as HTML.
function renderMarkdownBlock(raw: string): string {
  const safe = esc(raw);
  const lines = safe.split('\n');
  const out: string[] = [];
  let inList = false;
  const closeList = (): void => {
    if (inList) {
      out.push('</ul>');
      inList = false;
    }
  };
  for (const line of lines) {
    let m: RegExpMatchArray | null;
    if ((m = line.match(/^### (.*)$/))) {
      closeList();
      out.push(`<h3>${inline(m[1])}</h3>`);
    } else if ((m = line.match(/^## (.*)$/))) {
      closeList();
      out.push(`<h2>${inline(m[1])}</h2>`);
    } else if ((m = line.match(/^# (.*)$/))) {
      closeList();
      out.push(`<h1>${inline(m[1])}</h1>`);
    } else if ((m = line.match(/^- (.*)$/))) {
      if (!inList) {
        out.push('<ul>');
        inList = true;
      }
      out.push(`<li>${inline(m[1])}</li>`);
    } else if (!line.trim()) {
      closeList();
    } else {
      closeList();
      out.push(`<p>${inline(line)}</p>`);
    }
  }
  closeList();
  return out.join('\n');
}

export function MarkdownBody({ text }: { text: string }) {
  const html = renderMarkdownBlock(text);
  // eslint-disable-next-line react/no-danger
  return <div className="md-rendered" dangerouslySetInnerHTML={{ __html: html }} />;
}

// Relative "x·x ago" formatting for note timestamps (client-local — no server
// timezone math, code-quality timezone rules). Mirrored from the design story
// screen (which keeps its own private copy).
export function formatTs(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const diff = Math.max(0, Date.now() - then);
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}
