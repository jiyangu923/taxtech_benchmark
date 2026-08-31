const benchmarkAreas = [
  ['Operating model', 'Understand how ownership, handoffs, and review responsibilities compare across tax teams.'],
  ['Process maturity', 'Identify which recurring tasks are standardized, controlled, and ready for automation.'],
  ['Technology', 'Map the systems and data constraints that affect the path from source records to workpapers.'],
  ['AI readiness', 'Assess where governed assistance can help without weakening review, provenance, or accountability.'],
] as const;

export default function BenchmarkPage() {
  return (
    <>
      <section className="mx-auto max-w-6xl px-6 pb-16 pt-16 lg:pt-24">
        <p className="font-mono text-xs uppercase tracking-[0.14em] text-amber-acc">Benchmark intelligence</p>
        <h1 className="mt-6 max-w-4xl font-display text-5xl font-semibold leading-[1.05] tracking-[-0.035em] sm:text-6xl">
          Know where tax operations stand before deciding what to automate.
        </h1>
        <p className="mt-7 max-w-3xl text-xl leading-8 text-slate">
          TaxBrains uses benchmark questions to diagnose process maturity and shape an automation roadmap. The public Taxbenchmark community remains a separate place to participate and learn.
        </p>
      </section>

      <section className="border-y border-line bg-white">
        <div className="mx-auto grid max-w-6xl gap-px bg-line sm:grid-cols-2">
          {benchmarkAreas.map(([title, description]) => (
            <article key={title} className="bg-white p-8">
              <h2 className="font-display text-2xl font-semibold">{title}</h2>
              <p className="mt-4 text-base leading-7 text-slate">{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-8 px-6 py-16 lg:grid-cols-[1fr_auto] lg:items-center">
        <div>
          <h2 className="font-display text-3xl font-semibold">Taxbenchmark stays independent.</h2>
          <p className="mt-4 max-w-3xl text-base leading-7 text-slate">
            Its existing website and deployment are not changed by this unified TaxBrains workspace. This page provides a bridge from diagnosis to a practical compliance-automation pilot.
          </p>
        </div>
        <a
          href="https://taxbenchmark.ai"
          className="inline-flex min-h-11 items-center justify-center rounded-md border border-primary px-6 py-3 text-base font-semibold text-primary transition-colors hover:bg-primary hover:text-white"
        >
          Visit taxbenchmark.ai
        </a>
      </section>
    </>
  );
}
