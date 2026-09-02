// {{PROJECT_NAME}} landing page. Replace the placeholder copy with the
// project's PRD §1 feature summary; keep the landmark structure (header →
// main → h1) — accessibility-guidelines.md §Semantic Structure requires it.
// Placeholders are wrapped in string literals so the scaffold compiles
// as-is before token replacement.
export default function Home() {
  return (
    <div className="min-h-screen bg-neutral-50 px-6 py-16">
      <main className="mx-auto max-w-3xl">
        <h1 className="text-4xl font-bold text-neutral-900">{'{{PROJECT_NAME}}'}</h1>
        <p className="mt-4 text-lg text-neutral-600">{'{{DESCRIPTION}}'}</p>
        <p className="mt-8 text-sm text-neutral-400">
          Scaffolded from <code>framework/templates/nextjs-starter/</code> — replace
          the <code>&#123;&#123;PLACEHOLDER&#125;&#125;</code> tokens per the template
          selection rules (<code>framework/templates/docs/template-selection.md</code>)
          before shipping.
        </p>
      </main>
    </div>
  );
}