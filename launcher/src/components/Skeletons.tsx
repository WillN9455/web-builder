// Skeleton placeholders while /api/projects is loading.

export function TilesSkeleton() {
  return (
    <div className="tile-grid">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="skeleton" style={{ height: 158 }} />
      ))}
    </div>
  );
}

export function RingSkeleton() {
  return <div className="skeleton" style={{ height: 140 }} />;
}

export function TableSkeleton() {
  return (
    <div style={{ background: 'rgba(255,255,255,0.55)', borderRadius: 'var(--r-lg)', padding: 14 }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="skeleton" style={{ height: 44, marginBottom: 10 }} />
      ))}
    </div>
  );
}
