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

// BA Workspace skeletons — Project Background's loading state (AC-11): the
// five-band file tree and the document editor load independently.

export function FileTreeSkeleton() {
  return (
    <div className="file-tree" aria-busy="true">
      <div className="file-tree-head">
        <div className="skeleton" style={{ height: 14, width: 96 }} />
        <div className="skeleton" style={{ height: 18, width: 54 }} />
      </div>
      {/* Band/row counts mirror the real tree's shape (3/5/4/4/1). */}
      {[3, 5, 4, 4, 1].map((rows, band) => (
        <div key={band}>
          <div className="skeleton" style={{ height: 12, width: 88, marginBottom: 6 }} />
          {Array.from({ length: rows }).map((_, row) => (
            <div key={row} className="skeleton" style={{ height: 36, marginBottom: 4 }} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function DocumentSkeleton() {
  return (
    <div className="ba-doc" aria-busy="true">
      <div className="ba-doc-head">
        <div className="skeleton" style={{ height: 32, width: '55%' }} />
      </div>
      <div className="ba-doc-body">
        <div className="skeleton" style={{ height: 24, width: '40%' }} />
        <div className="skeleton" style={{ height: 14 }} />
        <div className="skeleton" style={{ height: 14, width: '92%' }} />
        <div className="skeleton" style={{ height: 14, width: '78%' }} />
        <div className="skeleton" style={{ height: 14, width: '85%' }} />
        <div className="skeleton" style={{ height: 14, width: '64%' }} />
      </div>
    </div>
  );
}
