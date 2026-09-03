// Filter bar (plan AC-3): type segments + multi-select status chips + search
// over the parsed list (client-side, plan §0b — no endpoint param). The
// mockup's `.req-filter .ba-tabs` styling is re-issued here as `.req-type-tabs`
// (app.css has no .ba-tabs — own classes, plan §3.6). ⌘F / Ctrl-F focuses the
// search; Esc clears it.

import { useEffect, useRef } from 'react';
import { REQ_STATUSES, type ReqStatus } from '../../../server/requirements-model';
import type { FilterState, TypeFilter } from './storyModel';
import { statusDotClass } from './storyModel';

type Props = {
  filter: FilterState;
  onChange: (next: FilterState) => void;
  // Live result counts for the active type segment + visible chip counts.
  counts: { all: number; business: number; technical: number; byStatus: Record<ReqStatus, number> };
};

const STATUS_LABELS: Record<ReqStatus, string> = {
  draft: 'Draft',
  in_review: 'In review',
  approved: 'Approved',
  done: 'Done',
  blocked: 'Blocked',
  returned: 'Returned',
  on_hold: 'On hold',
  cancelled: 'Cancelled',
};

export function FilterBar({ filter, onChange, counts }: Props) {
  const searchRef = useRef<HTMLInputElement>(null);

  // ⌘F / Ctrl-F focuses search (spec UX); Esc inside search clears.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
        const tag = (e.target as HTMLElement | null)?.tagName;
        if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
          e.preventDefault();
          searchRef.current?.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const setType = (type: TypeFilter) => onChange({ ...filter, type });
  const toggleStatus = (s: ReqStatus) => {
    const has = filter.statuses.includes(s);
    onChange({ ...filter, statuses: has ? filter.statuses.filter((x) => x !== s) : [...filter.statuses, s] });
  };

  const types: { key: TypeFilter; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: counts.all },
    { key: 'business', label: 'Business', count: counts.business },
    { key: 'technical', label: 'Technical', count: counts.technical },
  ];

  return (
    <div className="req-filter" role="group" aria-label="Filter requirements">
      <div className="req-filter-left">
        <div className="req-type-tabs" role="group" aria-label="Filter by requirement type">
          {types.map((t) => (
            <button
              key={t.key}
              type="button"
              aria-pressed={filter.type === t.key}
              className={filter.type === t.key ? 'active' : undefined}
              onClick={() => setType(t.key)}
            >
              {t.label}
              <span className="filter-count">{t.count}</span>
            </button>
          ))}
        </div>
        <div className="req-filter-sep" aria-hidden="true" />
        <div className="req-chips" role="group" aria-label="Filter by status">
          {REQ_STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              className={filter.statuses.includes(s) ? 'req-chip active' : 'req-chip'}
              aria-pressed={filter.statuses.includes(s)}
              onClick={() => toggleStatus(s)}
            >
              <span className={`file-status ${statusDotClass(s)}`} aria-hidden="true" />
              {STATUS_LABELS[s]}
              {counts.byStatus[s] > 0 && <b>{counts.byStatus[s]}</b>}
            </button>
          ))}
        </div>
      </div>
      <div className="req-filter-right">
        <div className="req-search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} width={14} height={14} aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
          <input
            ref={searchRef}
            type="search"
            placeholder="Search requirements…  ⌘F"
            aria-label="Search requirements and user stories"
            value={filter.query}
            onChange={(e) => onChange({ ...filter, query: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.stopPropagation();
                onChange({ ...filter, query: '' });
              }
            }}
          />
        </div>
      </div>
    </div>
  );
}