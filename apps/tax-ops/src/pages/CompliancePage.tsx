const workflow = [
  ['Connect', 'Upload or connect transaction, tax, and general-ledger exports for a defined filing period.'],
  ['Normalize', 'Map source fields into a consistent model while preserving the original values and source identity.'],
  ['Reconcile', 'Apply versioned rules and compare expected tax against source documents and ledger postings.'],
  ['Investigate', 'Prioritize exceptions, assemble supporting evidence, and record explanations without overwriting source data.'],
  ['Approve', 'Route material judgments to a named reviewer. No agent can silently approve its own conclusion.'],
  ['Package', 'Produce a traceable workpaper and evidence package for filing, review, or later audit response.'],
] as const;

export default function CompliancePage() {
  return (
    <>
      <section className="mx-auto max-w-6xl px-6 pb-16 pt-16 lg:pt-24">
        <p className="font-mono text-xs uppercase tracking-[0.14em] text-amber-acc">Compliance automation</p>
        <h1 className="mt-6 max-w-4xl font-display text-5xl font-semibold leading-[1.05] tracking-[-0.035em] sm:text-6xl">
          Turn source exports into a reviewable close.
        </h1>
        <p className="mt-7 max-w-3xl text-xl leading-8 text-slate">
          The first TaxBrains workflow is designed for indirect-tax teams that spend too much time moving data, finding differences, and rebuilding evidence every filing period.
        </p>
      </section>

      <section className="border-y border-line bg-white">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <div className="mb-10 max-w-3xl">
            <p className="font-mono text-xs uppercase tracking-[0.12em] text-amber-acc">The controlled workflow</p>
            <h2 className="mt-3 font-display text-3xl font-semibold">Six stages, one evidence chain</h2>
          </div>
          <ol className="grid gap-px overflow-hidden rounded-lg border border-line bg-line md:grid-cols-2 lg:grid-cols-3">
            {workflow.map(([title, description], index) => (
              <li key={title} className="bg-white p-7">
                <span className="font-mono text-xs text-amber-acc">{String(index + 1).padStart(2, '0')}</span>
                <h3 className="mt-5 font-display text-xl font-semibold">{title}</h3>
                <p className="mt-3 text-base leading-7 text-slate">{description}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-10 px-6 py-16 lg:grid-cols-2">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.12em] text-amber-acc">Pilot shape</p>
          <h2 className="mt-3 font-display text-3xl font-semibold">Prove value on one recurring close.</h2>
          <p className="mt-4 text-base leading-7 text-slate">
            A pilot starts with a bounded entity, jurisdiction, filing period, and source-data set. Success is measured by time saved, exceptions surfaced, and evidence completeness—not by how many autonomous actions an agent performs.
          </p>
        </div>
        <div className="rounded-lg border border-line bg-white p-8">
          <h2 className="font-display text-2xl font-semibold">A good pilot has</h2>
          <ul className="mt-5 space-y-3 text-base leading-7 text-slate">
            <li>• A repeatable compliance process with a clear owner</li>
            <li>• Exportable transaction and ledger data</li>
            <li>• A reviewer who can validate exceptions and evidence</li>
            <li>• A measurable baseline for effort and rework</li>
          </ul>
          <a
            href="mailto:hello@taxbrains.ai?subject=TaxBrains%20compliance%20pilot"
            className="mt-7 inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-6 py-3 text-base font-semibold text-white transition-colors hover:bg-primary-dark"
          >
            Discuss a compliance pilot
          </a>
        </div>
      </section>
    </>
  );
}
