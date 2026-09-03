// Five-band file tree (left rail) — ported from background.html #s12's
// `.file-tree` block. 17 artifacts in the sitemap's canonical 5 bands (the
// s12 mockup omits personas.md; sitemap wins — plan §0/R3), plus the
// client-synthesized "Idea" band on top (plan §9.4 AC-22 — read-only
// reference material, excluded from the count chip and status dots). Each
// row: MD chip colored by status, status dot with an aria-label, and a coral
// dirty inset when that file has unsaved edits (screen 13's `.file.flag`).
//
// A11y per AC-12: role="tree"/"treeitem", aria-current on the selected row,
// keyboard nav (↑/↓/Home/End move, Enter/Space open).
import { useRef } from 'react';
import type { BaFile, BaStatus } from '../../lib/api';

type FileTreeProps = {
  bands: { key: string; label: string; files: BaFile[] }[];
  selected: string | null;
  // The file with unsaved edits (coral inset) — only ever the open one.
  dirtyFilename: string | null;
  onSelect: (filename: string) => void;
};

// Keyboard movement order = DOM order across all bands.
function flattenRows(bands: FileTreeProps['bands']): BaFile[] {
  return bands.flatMap((b) => b.files);
}

// The head count covers the reviewable artifacts only — idea.md is reference
// material and must not read as part of the 17-artifact set (AC-22).
function countReviewable(bands: FileTreeProps['bands']): number {
  return flattenRows(bands).filter((f) => !f.readOnly).length;
}

export function FileTree({ bands, selected, dirtyFilename, onSelect }: FileTreeProps) {
  const treeRef = useRef<HTMLDivElement>(null);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const rows = flattenRows(bands);
    const idx = rows.findIndex((f) => f.filename === selected);
    let next: number | null = null;
    if (e.key === 'ArrowDown') next = Math.min(rows.length - 1, idx + 1);
    else if (e.key === 'ArrowUp') next = Math.max(0, idx - 1);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = rows.length - 1;
    else return;
    e.preventDefault();
    if (next === null || next === idx) return;
    onSelect(rows[next].filename);
    // Move focus to the newly selected row so keyboard users stay oriented.
    const node = treeRef.current?.querySelector<HTMLElement>(
      `[data-filename="${CSS.escape(rows[next].filename)}"]`,
    );
    node?.focus();
  };

  const statusLabel = (s: BaStatus) =>
    s === 'draft' ? 'Draft' : s === 'in_review' ? 'In Review' : s === 'returned' ? 'Returned' : 'Approved';

  return (
    <div className="file-tree">
      <div className="file-tree-head">
        <h3>PRD artifacts</h3>
        <span className="count">{countReviewable(bands)} files</span>
      </div>
      <div
        ref={treeRef}
        role="tree"
        aria-label="PRD artifacts"
        onKeyDown={onKeyDown}
      >
        {bands.map((band) =>
          band.files.length === 0 ? null : (
            <div className="file-group" key={band.key}>
              <div className="file-group-label" role="presentation">
                {band.label}
              </div>
              {band.files.map((file) => {
                const isSelected = file.filename === selected;
                const isDirty = file.filename === dirtyFilename;
                return (
                  <div
                    key={file.filename}
                    role="treeitem"
                    data-filename={file.filename}
                    tabIndex={isSelected ? 0 : -1}
                    aria-selected={isSelected}
                    aria-current={isSelected ? 'true' : undefined}
                    className={`file${isSelected ? ' active' : ''}${isDirty ? ' flag' : ''}`}
                    onClick={() => onSelect(file.filename)}
                  >
                    <span className={`file-ico ${file.readOnly ? 'idea' : file.status}`} aria-hidden="true">
                      MD
                    </span>
                    <span className="file-name">{file.filename}</span>
                    {file.readOnly ? null : (
                      <span
                        className={`file-status ${file.status}`}
                        role="img"
                        aria-label={`Status: ${statusLabel(file.status)}`}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          ),
        )}
      </div>
    </div>
  );
}