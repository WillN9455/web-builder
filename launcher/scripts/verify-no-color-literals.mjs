// Color-literal lint (plan §5.4, locked decision 1).
//
// Enforces "no color literals outside the token layer": every color value in
// the partials must come from the compile-time scalar layer in
// ../src/styles/tokens.scss (e.g. `rgba(tokens.$navy, 0.06)`), so the palette
// has exactly one home. Bare hex and rgba()/rgb()/hsl()/hsla() function
// literals in partials/**/*.scss are violations.
//
// Scope is partials only — tokens.scss IS the token layer (its :root block and
// compile-time mirror may contain literals by definition).
//
// Matching details:
//   - comments are stripped before matching (mockup-anchor comments like
//     "#s3" are not hex violations);
//   - the hex regex requires a word boundary AFTER the hex digits, so
//     longer identifiers are never truncated into false hexes;
//   - rgb(a)/hsl(a) are caught in functional form regardless of spacing.
//
// Exit 0 = clean; exit 1 = violations found (file:line:col list).

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const partialsDir = resolve(import.meta.dirname, '../src/styles/partials');

const HEX = /#[0-9a-fA-F]{3,8}\b/;
const FUNC = /\b(?:rgba?|hsla?)\(/;

function findPartials(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) out.push(...findPartials(join(dir, entry.name)));
    else if (entry.name.endsWith('.scss')) out.push(join(dir, entry.name));
  }
  return out;
}

function stripComments(css) {
  let s = css.replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length));
  return s
    .split('\n')
    .map((line) => line.replace(/(^|[^:])\/\/.*$/, (m, pre) => pre + ' '.repeat(m.length - pre.length)))
    .join('\n');
}

function violationsFor(text) {
  const stripped = stripComments(text);
  const lines = stripped.split('\n');
  const out = [];
  lines.forEach((line, idx) => {
    for (const rx of [HEX, FUNC]) {
      const re = new RegExp(rx.source, 'g');
      let m;
      while ((m = re.exec(line)) !== null) {
        out.push({ line: idx + 1, col: m.index + 1, match: m[0] });
      }
    }
  });
  return out;
}

const files = findPartials(partialsDir).sort();
const violations = [];
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  for (const v of violationsFor(text)) {
    violations.push({
      file: relative(partialsDir, file),
      ...v,
    });
  }
}

if (violations.length > 0) {
  const byFile = new Map();
  for (const v of violations) {
    if (!byFile.has(v.file)) byFile.set(v.file, []);
    byFile.get(v.file).push(v);
  }
  console.error(`verify-no-color-literals: FAILED — ${violations.length} color literal(s) outside the token layer:`);
  for (const [file, list] of byFile) {
    console.error(`  ${file}`);
    for (const v of list) {
      console.error(`    ${v.line}:${v.col}  ${v.match}`);
    }
  }
  console.error('  Every color must come from src/styles/tokens.scss (e.g. rgba(tokens.$navy, 0.06)).');
  process.exit(1);
}

console.log(`verify-no-color-literals: OK — ${files.length} partial(s) scanned, no color literals outside the token layer.`);
process.exit(0);