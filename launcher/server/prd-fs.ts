// Shared PRD-file write helper. Spec SEC: "Both writes are atomic (write to
// .tmp + rename) so a crash never leaves the PRD half-updated." Extracted so
// the Requirements routes (#20) and the BA Workspace save (#18) share one
// implementation — no behavior change beyond atomicity.
//
// Writes are also serialized through a path-keyed mutex: two writers to the
// same PRD file queue FIFO behind each other instead of racing (review B1 —
// the BA auto-draft job's write moment and the Requirements routes'
// read-splice-write must not interleave on prd.md / user-journeys.md).
//
// The caller owns containment (which file may be written); this module only
// guarantees the write lands whole or not at all, one at a time per file.

import fs from 'node:fs';
import path from 'node:path';

// One promise-chain slot per absolute path. The tail never rejects (errors
// are swallowed for chaining only — every caller still sees its own result),
// so one failed write cannot poison the next queued one.
const prdLocks = new Map<string, Promise<unknown>>();

export function withPrdLock<T>(filePath: string, fn: () => T | Promise<T>): Promise<T> {
  const key = path.resolve(filePath);
  const prev = prdLocks.get(key) ?? Promise.resolve();
  const run = prev.then(fn, fn);
  const tail = run.then(
    () => undefined,
    () => undefined,
  );
  prdLocks.set(key, tail);
  // Drop the map entry once this call is the last in the chain — the map
  // never grows with idle locks.
  void tail.then(() => {
    if (prdLocks.get(key) === tail) prdLocks.delete(key);
  });
  return run;
}

export async function atomicWritePrd(filePath: string, content: string): Promise<void> {
  await withPrdLock(filePath, () => {
    const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
    try {
      fs.writeFileSync(tmp, content, 'utf-8');
      fs.renameSync(tmp, filePath);
    } catch (err) {
      try {
        fs.unlinkSync(tmp);
      } catch {
        // tmp may never have been created — cleanup is best-effort
      }
      throw err;
    }
  });
}

// The only two files the Requirements routes may ever touch (R1 containment —
// the filenames come from these constants, never from the request).
export type PrdFile = 'prd.md' | 'user-journeys.md';

export function prdFilePath(dir: string, file: PrdFile): string {
  return path.join(dir, file);
}