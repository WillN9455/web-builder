// Compiled-output equivalence gate (plan §4.6).
//
// Compiles launcher/src/styles/app.scss with Dart Sass and compares it,
// normalized, against the original hand-written stylesheet pair (tokens.css +
// app.css, in the original main.tsx import order) from the pinned pre-split
// baseline commit.
//
// Normalization strips block comments, @charset metadata, and whitespace —
// the three artifacts of a Sass compile that carry no behavior. What must
// match is the rule/selector sequence: cascade order IS behavior (plan
// locked decision 2).
//
// The comparison is a selector-order-preservation check: every pre-existing
// entry from the baseline — normalized selector text AND declarations, with
// at-rules (@keyframes, @media…) matched atomically as one header+body unit —
// must appear in the compiled candidate in the same relative order. New rules
// may be inserted anywhere: an insertion cannot change the precedence of any
// pre-existing rule, so it is additive and tolerated by design. The check
// fails only on a real divergence: a baseline entry that no longer matches in
// order (its selector sequence moved, merged, renamed, or dropped) or whose
// declarations changed under an existing selector (an edit, which is
// behavior).
//
// Rationale (2026-09-12, SA): the original implementation pinned the baseline
// as a byte-prefix of the candidate and allowed exactly one declared delta
// (the N3 icon block, appended at the end). Any insertion anywhere — including
// the mid-block .state-d-* rules added in 86f3e19 (PR #27) — read as "a
// selector moved" and failed the gate even though the pre-existing selector
// sequence was untouched (verified: 548/548 baseline entries match in order, 0
// changed bodies; only +3 entries = the two .state-d-* rules + the N3 icon
// rule). The baseline commit is NOT re-pinned: locked decision 2 is honored by
// preserving the baseline sequence exactly, and the N3-append exception is
// subsumed by the general insertion rule.
//
// Known limitation: two baseline entries with identical normalized header+body
// are indistinguishable, so swapping two identical rules is not detected.
// This is explicit rather than implicit and strictly less lossy than the
// byte-prefix check for the practical failure (a selector moved or edited).
//
// Exceptions:
//   --strict — byte-identical after normalization (no insertions allowed).
//
// Exit 0 = equivalent; exit 1 = divergence (first divergence printed with
// context); exit 2 = setup error.

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile } from 'sass';

const stylesDir = resolve(import.meta.dirname, '../src/styles');
const APP_SCSS = resolve(stylesDir, 'app.scss');
const STRICT = process.argv.includes('--strict');
const repoRoot = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
// git pathspecs resolve against cwd; git show needs a repo-root-relative path.
const relAppCss = relative(repoRoot, resolve(stylesDir, 'app.css')).split('\\').join('/');

function normalize(css) {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '') // block comments
    .replace(/@charset\s+["'][^"']*["'];/g, '') // compile metadata
    .replace(/\s+/g, ' ')
    .replace(/,\s+/g, ',') // Sass normalizes spacing after commas
    .replace(/\[([^\]]*)\]/g, (m, inner) => '[' + inner.replace(/["']/g, '') + ']') // Sass unquotes attribute values
    .replace(/"/g, "'") // Sass normalizes string quoting (content: '' → "")
    .replace(/(\.\d*?)0+(?![\d.])/g, '$1') // Sass trims trailing decimal zeros (0.10 → 0.1)
    .trim();
}

function firstDivergence(base, cand) {
  let i = 0;
  while (i < base.length && i < cand.length && base[i] === cand[i]) i++;
  const from = Math.max(0, i - 80);
  return {
    at: i,
    base: base.slice(from, i + 120),
    cand: cand.slice(from, i + 120),
  };
}

// Parse CSS into top-level block entries, each {header, body}. At-rules
// (@keyframes, @media, @supports, …) are matched ATOMICALLY: their nested
// blocks stay an opaque body rather than being recursed, so editing inside a
// keyframe or media query changes its body and fails the check — the
// conservative reading of "cascade order IS behavior" for frame/transform
// sequences. Sass output has balanced braces, so this simple depth-counted
// tokenizer is sufficient.
function parseEntries(css) {
  const entries = [];
  let depth = 0;
  let headerStart = -1;
  const stack = [];
  for (let i = 0; i < css.length; i++) {
    const ch = css[i];
    if (ch === '{') {
      if (depth === 0) {
        const header = css.slice(headerStart, i).trim();
        stack.push({ header, body: '', open: i + 1 });
      }
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) {
        const entry = stack.pop();
        entry.body = css.slice(entry.open, i);
        entries.push(entry);
        headerStart = null;
      }
    } else if (depth === 0 && headerStart === null) {
      headerStart = i;
    }
  }
  return entries;
}

// Greedy forward subsequence check: every baseline entry (normalized header +
// body) must be found in candidate at or after the current cursor, consuming
// the candidate entry it matches on. Candidate-only entries are skipped —
// insertions are safe. Returns the list of baseline entries that could not be
// matched, each annotated with whether a same-header entry exists later
// (=> declarations changed) or not at all (=> selector moved/merged/dropped).
function matchBaseline(baseEntries, candEntries) {
  let cursor = 0;
  const missing = [];
  for (const b of baseEntries) {
    let found = -1;
    for (let j = cursor; j < candEntries.length; j++) {
      const c = candEntries[j];
      if (c.header === b.header && c.body === b.body) {
        found = j;
        break;
      }
    }
    if (found === -1) {
      let headerOnly = -1;
      for (let j = cursor; j < candEntries.length && headerOnly === -1; j++) {
        if (candEntries[j].header === b.header) headerOnly = j;
      }
      missing.push({ b, headerOnly, index: baseEntries.indexOf(b) });
    } else {
      cursor = found + 1;
    }
  }
  return missing;
}

let git;
try {
  // stderr is silenced: git's raw `fatal:` lines printed ahead of this
  // script's friendly setup messages (review polish from #24, §5.6).
  git = (cmd) => execSync(`git ${cmd}`, { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
} catch {
  console.error('verify-css-equivalence: must run inside the git repository (launcher/ or its parent).');
  process.exit(2);
}

// Baseline: the original stylesheet pair, in the original main.tsx import
// order (tokens.css, then app.css). The pre-split commit is PINNED rather
// than discovered via `git log -- <old-path>`: the split renamed both files
// in its own commit, so the rename lands as the last commit touching each
// old path and the lookup points at a ref where the file no longer exists
// (caught in the PR #24 review). Override with CSS_BASELINE=<sha> to run the
// gate against an earlier baseline.
const PINNED_BASELINE = process.env.CSS_BASELINE ?? '5c08322';
const relTokensCss = relative(repoRoot, resolve(stylesDir, 'tokens.css')).split('\\').join('/');
let baselineSha;
try {
  baselineSha = git(`rev-parse ${PINNED_BASELINE}^{commit}`).trim();
} catch {
  console.error(`verify-css-equivalence: pinned baseline ${PINNED_BASELINE} not found in this history.`);
  console.error('Set CSS_BASELINE=<sha> to a commit containing src/styles/tokens.css + app.css.');
  process.exit(2);
}
let baseline;
try {
  baseline =
    git(`show ${baselineSha}:${relTokensCss}`) + '\n' + git(`show ${baselineSha}:${relAppCss}`);
} catch {
  console.error(`verify-css-equivalence: pinned baseline ${baselineSha} does not contain ${relTokensCss} / ${relAppCss}.`);
  console.error('Set CSS_BASELINE=<sha> to a commit containing src/styles/tokens.css + app.css.');
  process.exit(2);
}

const result = compile(APP_SCSS);
const candidate = result.css;

const baseN = normalize(baseline);
const candN = normalize(candidate);

// Strict mode: no insertions allowed at all — normalized output must be
// byte-identical to the baseline.
if (STRICT) {
  if (baseN === candN) {
    console.log(`verify-css-equivalence: OK (strict) — normalized compiled output byte-identical (${candN.length} chars).`);
    process.exit(0);
  }
  const d = firstDivergence(baseN, candN);
  console.error('verify-css-equivalence: FAILED (strict mode).');
  console.error(`  baseline ${baselineSha} vs app.scss compile, first divergence at char ${d.at}:`);
  console.error(`  baseline: ...${d.base}`);
  console.error(`  candidate: ...${d.cand}`);
  process.exit(1);
}

// Default mode: selector-order preservation (see header comment).
const baseEntries = parseEntries(baseline).map((e) => ({ header: normalize(e.header), body: normalize(e.body) }));
const candEntries = parseEntries(candidate).map((e) => ({ header: normalize(e.header), body: normalize(e.body) }));
const missing = matchBaseline(baseEntries, candEntries);

if (missing.length === 0) {
  const inserted = candEntries.length - baseEntries.length;
  console.log(`verify-css-equivalence: OK — every baseline rule preserved in candidate order (${baseEntries.length} baseline entries, ${candEntries.length} candidate, ${inserted >= 0 ? inserted + ' inserted rule(s) tolerated' : 'some candidate entries lost'}).`);
  console.log(`  baseline: ${baselineSha} (${baseN.length} chars), candidate: ${candN.length} chars.`);
  process.exit(0);
}

// Failing path: at least one baseline entry is no longer preserved in order.
const first = missing[0];
const b = first.b;
console.error(`verify-css-equivalence: FAILED — ${missing.length} of ${baseEntries.length} baseline entries not preserved in candidate order.`);
console.error(`  first at baseline entry #${first.index + 1} (the ${first.index} before it matched in order).`);
console.error(`  baseline entry:  ${showEntry(b)}`);
if (first.headerOnly === -1) {
  console.error('  no candidate entry with this selector at/after the match position — selector moved, merged, renamed, or dropped.');
} else {
  console.error(`  a candidate entry with this selector exists later but its declarations DIFFER:`);
  console.error(`    candidate: ${showEntry(candEntries[first.headerOnly])}`);
  console.error('  (cascade order IS behavior — editing declarations under an existing selector is a real divergence.)');
}
if (missing.length > 1) {
  console.error(`  remaining ${missing.length - 1} unmatched baseline entries: ${missing.map((m) => m.b.header).slice(1, 6).map((h) => h.slice(0, 60)).join(' | ')}${missing.length > 6 ? ' | …' : ''}`);
}
process.exit(1);

function showEntry(e) {
  const h = e.header.length > 90 ? e.header.slice(0, 90) + '…' : e.header;
  const body = e.body.length > 200 ? e.body.slice(0, 200) + '…' : e.body;
  return `${h} { ${body} }`;
}
