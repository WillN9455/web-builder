// Compiled-output equivalence gate (plan §4.6).
//
// Compiles launcher/src/styles/app.scss with Dart Sass and compares it,
// normalized, against the original hand-written stylesheet pair (tokens.css +
// app.css, in the original main.tsx import order) from the pinned pre-split
// baseline commit.
//
// Normalization strips block comments, @charset metadata, and whitespace —
// the three artifacts of a Sass compile that carry no behavior. What must
// match byte-for-byte is the rule/selector sequence: cascade order IS
// behavior (plan locked decision 2).
//
// Exceptions:
//   default  — allows exactly one delta: the N3 icon consolidation block
//              (partials/_icons.scss) appended after the requirements rules.
//              The expected expansion is pinned below; if _icons.scss
//              changes, update this constant in the same commit.
//   --strict — no exceptions; everything must be byte-identical after
//              normalization (use this from phase B on, where every delta
//              must be explained per-commit).
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

// Declared exception (plan §4.4): the fe-icon mixin expansion from
// partials/_icons.scss, as compiled. Normalized form (comments/whitespace
// stripped). Keep in sync with _icons.scss.
const N3_ICON_BLOCK = normalize(
  '.req-action svg,.req-add-bar .btn-primary svg,.req-empty .btn-primary svg { ' +
  'stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }',
);

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

let git;
try {
  git = (cmd) => execSync(`git ${cmd}`, { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
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
const baseline =
  git(`show ${baselineSha}:${relTokensCss}`) + '\n' + git(`show ${baselineSha}:${relAppCss}`);

const result = compile(APP_SCSS);
const candidate = result.css;

const baseN = normalize(baseline);
let candN = normalize(candidate);

// The declared exception is only valid as a pure append: baseline must be a
// byte-prefix of candidate, with the N3 block as the entire remainder.
if (!STRICT && candN.startsWith(baseN)) {
  const tail = candN.slice(baseN.length).trim();
  if (tail && tail !== N3_ICON_BLOCK) {
    const d = firstDivergence(N3_ICON_BLOCK, tail);
    console.error('verify-css-equivalence: FAILED — delta after the baseline is not the declared N3 icon block.');
    console.error(`  expected: ${d.base}`);
    console.error(`  actual:   ${d.cand}`);
    process.exit(1);
  }
  if (tail === N3_ICON_BLOCK) {
    console.log(`verify-css-equivalence: OK (N3 exception) — identical except the declared N3 icon block, appended at the end (${N3_ICON_BLOCK.length} chars).`);
    console.log(`  baseline: ${baselineSha} (${baseN.length} chars), candidate: ${candN.length} chars.`);
    process.exit(0);
  }
}

if (baseN === candN) {
  console.log(`verify-css-equivalence: OK (strict) — normalized compiled output byte-identical (${candN.length} chars).`);
  process.exit(0);
}

// Failing path: either a strict run, or a non-appended delta (selector moved).
const strictFailure = STRICT && !candN.startsWith(baseN);
const d = firstDivergence(baseN, candN);
console.error(`verify-css-equivalence: FAILED (${strictFailure ? 'strict mode' : 'non-appended delta — a selector moved'}).`);
console.error(`  baseline ${baselineSha} vs app.scss compile, first divergence at char ${d.at}:`);
console.error(`  baseline: ...${d.base}`);
console.error(`  candidate: ...${d.cand}`);
process.exit(1);