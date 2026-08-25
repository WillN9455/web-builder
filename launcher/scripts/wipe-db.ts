// Wipes the dev DB only. Pair with `npm run db:seed` when you want to
// repopulate afterwards.

import { unlinkSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dataDir = resolve(__dirname, '..', 'data');

let removed = 0;
for (const f of ['launcher.db', 'launcher.db-shm', 'launcher.db-wal']) {
  const p = resolve(dataDir, f);
  if (existsSync(p)) {
    unlinkSync(p);
    console.log(`[wipe] Removed ${p}`);
    removed++;
  }
}

if (removed === 0) console.log('[wipe] No DB files present.');
else console.log(`[wipe] Removed ${removed} file(s).`);
