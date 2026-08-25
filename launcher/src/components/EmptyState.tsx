// Shown when the API returns zero projects — Screen 2 in the v5 plan.

type Props = { onNewIdea: () => void };

export function EmptyState({ onNewIdea }: Props) {
  return (
    <div
      style={{
        margin: '40px auto',
        maxWidth: 520,
        textAlign: 'center',
        padding: '48px 36px',
        background: 'rgba(255,255,255,0.55)',
        borderRadius: 'var(--r-2xl)',
        border: '1px solid rgba(50,42,92,0.04)',
      }}
    >
      <div
        aria-hidden
        style={{
          width: 96, height: 96, borderRadius: 24, margin: '0 auto 20px',
          background: 'linear-gradient(135deg, var(--peach), var(--lavender))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--ink)',
        }}
      >
        <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}>
          <path d="M12 4v16 M4 12h16" />
        </svg>
      </div>
      <h2 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 600 }}>Start your first project</h2>
      <p style={{ margin: '0 0 24px', color: 'var(--ink-2)', fontSize: 13.5 }}>
        Capture a business idea and the BA Agent will interview you to turn it into a PRD.
      </p>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 10 }}>
        <button className="btn btn-primary btn-pill" onClick={onNewIdea}>+ New idea</button>
        <button className="btn btn-soft btn-pill">Import a folder</button>
      </div>
    </div>
  );
}
