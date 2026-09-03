// Shared relative-time helper. Accepts an ISO instant string (UTC assumed
// when no offset is present — Date.parse treats a bare "YYYY-MM-DDTHH:MM:SS"
// as local time, so callers must pass the UTC instant, e.g. via
// dbTimestampToIso for SQLite `datetime('now')` values) and renders
// "just now" / "2m ago" / "5h ago" / "3d ago". `now` is passed in so callers
// can fix one instant per render and keep ages consistent across a list.
export function formatRelative(iso: string, now: number): string {
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return 'just now';
  const secs = Math.max(0, Math.round((now - ts) / 1000));
  if (secs < 60) return 'just now';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

// SQLite `datetime('now')` values are "YYYY-MM-DD HH:MM:SS" in UTC with no
// timezone designator, which Date.parse treats inconsistently across engines.
// Normalize to a UTC ISO instant so formatRelative sees the same instant the
// server wrote (timezones on the client, not the server).
export function dbTimestampToIso(ts: string): string {
  if (ts.includes('T')) return ts; // already ISO
  return ts.replace(' ', 'T') + 'Z';
}