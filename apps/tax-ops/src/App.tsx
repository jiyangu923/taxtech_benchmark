const workflowSteps = [
  ['01', 'Normalize', 'Bring transaction and general-ledger exports into one reviewable data model.'],
  ['02', 'Reconcile', 'Compare recorded tax, expected treatment, and ledger postings with deterministic rules.'],
  ['03', 'Review', 'Resolve exceptions with source evidence and named human approval.'],
  ['04', 'Package', 'Generate filing workpapers with every number linked to its source transactions.'],
] as const;

export default function App() {
  return (
    <div className="min-h-screen bg-canvas text-ink">
      <div className="h-[3px] bg-primary" />

      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <a href="/" className="font-display text-xl font-semibold tracking-tight text-primary">
          taxbrains.ai
        </a>
        <a
          href="https://taxbenchmark.ai"
          className="font-mono text-xs uppercase tracking-[0.1em] text-slate hover:text-primary"
        >
          Explore taxbenchmark →
        </a>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl gap-14 px-6 pb-20 pt-14 lg:grid-cols-[1.25fr_0.75fr] lg:items-end lg:pt-24">
          <div>
            <p className="mb-6 font-mono text-[11px] uppercase tracking-[0.14em] text-amber-acc">
              Indirect tax · Compliance operations
            </p>
            <h1 className="max-w-4xl font-display text-5xl font-semibold leading-[1.02] tracking-[-0.035em] sm:text-7xl">
              Close indirect tax with an evidence trail.
            </h1>
          </div>
          <div className="border-l-2 border-amber-acc pl-6">
            <p className="text-lg leading-8 text-slate">
              A human-approved workspace for reconciling tax, reviewing exceptions, and producing traceable filing workpapers.
            </p>
            <p className="mt-5 font-mono text-xs uppercase tracking-[0.1em] text-primary">
              Compliance pilot in development
            </p>
          </div>
        </section>

        <section className="border-y border-line bg-white">
          <div className="mx-auto max-w-6xl px-6 py-16">
            <div className="mb-10 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-amber-acc">The first workflow</p>
                <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight">From exports to review-ready workpapers</h2>
              </div>
              <p className="max-w-md text-sm leading-6 text-slate">
                Deterministic tax tools perform the calculations. AI helps organize, explain, and route the work. People approve the result.
              </p>
            </div>

            <ol className="grid border-l border-t border-line sm:grid-cols-2 lg:grid-cols-4 lg:border-l-0">
              {workflowSteps.map(([number, title, description]) => (
                <li key={number} className="border-b border-r border-line p-6">
                  <span className="font-mono text-xs text-amber-acc">{number}</span>
                  <h3 className="mt-8 font-display text-xl font-semibold">{title}</h3>
                  <p className="mt-3 text-sm leading-6 text-slate">{description}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-16 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-display text-2xl font-semibold">Built from real tax operations work.</p>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate">
              TaxBrains is the commercial operations layer. Taxbenchmark remains the community and benchmarking layer that helps teams understand where automation creates value.
            </p>
          </div>
          <a
            href="https://taxbenchmark.ai"
            className="inline-flex shrink-0 items-center justify-center rounded-md bg-primary px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
          >
            Join the benchmark community
          </a>
        </section>
      </main>

      <footer className="border-t border-line bg-white py-8">
        <div className="mx-auto flex max-w-6xl flex-col justify-between gap-2 px-6 text-xs text-slate sm:flex-row">
          <span>© {new Date().getFullYear()} Seven Twenty Two LLC</span>
          <span>Human-approved · Deterministic tools · Traceable evidence</span>
        </div>
      </footer>
    </div>
  );
}
