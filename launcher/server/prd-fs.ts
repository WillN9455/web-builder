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
//
// Re-entrancy (PR #26 round 4): withPrdLock is a NON-reentrant mutex, and
// atomicWritePrd takes the lock itself — so a caller that wrapped
// atomicWritePrd in an outer withPrdLock on the SAME path queued behind its
// own slot forever (deterministic self-deadlock; the BA auto-draft job hit
// this exactly). The lock is now re-entrant per async chain via
// AsyncLocalStorage: a nested acquire of a key the SAME chain already holds
// runs inline instead of enqueuing. A separate caller (even one the current
// holder awaits on) has no shared chain store and still queues FIFO behind the
// slot — the two load-bearing invariants below are unchanged for that case.

import fs from 'node:fs';
import path from 'node:path';
import { AsyncLocalStorage } from 'node:async_hooks';

// Keys the CURRENT async chain already holds. Membership lives only inside the
// lockChain.run() that wraps a queued fn's execution — a caller's own store is
// never mutated, so a completed nested turn cannot leave a stale key behind
// that would make a later acquire of the same key run inline while another
// chain owns the slot.
const lockChain = new AsyncLocalStorage<Set<string>>();

function withKey(store: Set<string> | undefined, key: string): Set<string> {
  const next = new Set(store);
  next.add(key);
  return next;
}

// One promise-chain slot per PRD file path. The two load-bearing invariants a
// future reader must not break:
//
// 1. FIFO without head-of-line blocking — `prev.then(fn, fn)` runs `fn` on
//    BOTH arms, so a prior writer's failure does not block the next caller;
//    every queued caller still sees its own error (the swallowed-rejection
//    tail is only what keeps the chain itself from turning rejected).
// 2. The map stores `tail`, never `run` — a third writer calling while two
//    are queued enqueues behind the settled tail slot, not behind the first
//    writer's body. The chain stays finite and the queue stays correct under
//    bursty writes, and the cleanup below can drop the slot once this call
//    is the last in the chain.
//
// `path.resolve(filePath)` is the canonicalization boundary: relative and
// absolute spellings of the same file (`./PRD/prd.md` vs an absolute path)
// collapse to one key, so callers can't race across spellings.
const prdLocks = new Map<string, Promise<unknown>>();

export function withPrdLock<T>(filePath: string, fn: () => T | Promise<T>): Promise<T> {
  const key = path.resolve(filePath);
  const held = lockChain.getStore();
  // Same async chain already holds this file's lock — run fn inline rather
  // than enqueueing behind our own slot (which would never settle). Only the
  // immediate chain level answers: a fresh caller has held === undefined.
  if (held?.has(key)) return Promise.resolve().then(fn);
  const prev = prdLocks.get(key) ?? Promise.resolve();
  // Invariant 1 — both arms run fn: a failed write never blocks the queue.
  // The chain that OWNS this acquire runs fn inside lockChain.run so the
  // re-entrant branch above sees its key for the duration of THE fn only.
  const run = prev.then(
    () => lockChain.run(withKey(held, key), fn),
    () => lockChain.run(withKey(held, key), fn),
  );
  const tail = run.then(
    () => undefined,
    () => undefined,
  );
  // Invariant 2 — store tail, not run, so later callers enqueue behind the
  // settled slot instead of the first writer's body.
  prdLocks.set(key, tail);
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

// The only files the Requirements routes may ever touch (R1 containment —
// the filenames come from these constants, never from the request).
export type PrdFile = 'prd.md' | 'user-journeys.md' | 'features.md';

export function prdFilePath(dir: string, file: PrdFile): string {
  return path.join(dir, file);
}