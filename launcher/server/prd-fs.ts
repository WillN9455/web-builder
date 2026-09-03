// Shared PRD-file write helper. Spec SEC: "Both writes are atomic (write to
// .tmp + rename) so a crash never leaves the PRD half-updated." Extracted so
// the Requirements routes (#20) and the BA Workspace save (#18) share one
// implementation — no behavior change beyond atomicity.
//
// The caller owns containment (which file may be written); this module only
// guarantees the write lands whole or not at all.

import fs from 'node:fs';
import path from 'node:path';

export function atomicWritePrd(filePath: string, content: string): void {
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
}

// The only two files the Requirements routes may ever touch (R1 containment —
// the filenames come from these constants, never from the request).
export type PrdFile = 'prd.md' | 'user-journeys.md';

export function prdFilePath(dir: string, file: PrdFile): string {
  return path.join(dir, file);
}