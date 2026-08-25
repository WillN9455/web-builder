// Wipes the dev DB and reseeds it. Useful when iterating on the schema.

import { unlinkSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dataDir = resolve(__dirname, '..', 'data');

for (const f of ['launcher.db', 'launcher.db-shm', 'launcher.db-wal']) {
  const p = resolve(dataDir, f);
  if (existsSync(p)) {
    unlinkSync(p);
    console.log(`[reset] Removed ${p}`);
  }
}

// Re-import seed to recreate
await import('./seed-db.js');
