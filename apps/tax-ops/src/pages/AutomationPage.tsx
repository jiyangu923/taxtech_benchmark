import { Link } from 'react-router-dom';

const productLayers = [
  {
    stage: 'First',
    title: 'Compliance close',
    description: 'Normalize source data, reconcile tax, review exceptions, and assemble filing workpapers.',
    status: 'Pilot workflow',
  },
  {
    stage: 'Next',
    title: 'Audit and notice response',
    description: 'Retrieve the evidence behind a position, organize the response, and preserve the approval trail.',
    status: 'Planned',
  },
  {
    stage: 'Later',
    title: 'Planning intelligence',
    description: 'Model tax decisions using governed inputs after the compliance data foundation is trustworthy.',
    status: 'Roadmap',
  },
] as const;

export default function AutomationPage() {
  return (
    <>
      <section className="mx-auto max-w-6xl px-6 pb-16 pt-16 lg:pt-24">
        <p className="font-mono text-xs uppercase tracking-[0.14em] text-amber-acc">Agentic tax operations</p>
        <h1 className="mt-6 max-w-4xl font-display text-5xl font-semibold leading-[1.05] tracking-[-0.035em] sm:text-6xl">
          Automate the monthly tax close first.
        </h1>
        <p className="mt-7 max-w-3xl text-xl leading-8 text-slate">
          TaxBrains combines deterministic calculations, governed AI assistance, and human approval. The goal is less manual preparation without turning tax judgment into a black box.
        </p>
      </section>

      <section className="border-y border-line bg-white">
        <div className="mx-auto grid max-w-6xl gap-px bg-line md:grid-cols-3">
          {productLayers.map((layer) => (
            <article key={layer.title} className="bg-white px-6 py-10">
              <div className="flex items-center justify-between gap-4">
                <span className="font-mono text-xs uppercase tracking-[0.12em] text-amber-acc">{layer.stage}</span>
                <span className="rounded-full bg-canvas px-3 py-1 text-sm text-slate">{layer.status}</span>
              </div>
              <h2 className="mt-8 font-display text-2xl font-semibold">{layer.title}</h2>
              <p className="mt-4 text-base leading-7 text-slate">{layer.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-8 px-6 py-16 lg:grid-cols-[1fr_auto] lg:items-center">
        <div>
          <h2 className="font-display text-3xl font-semibold">A narrow first product, with room to expand.</h2>
          <p className="mt-4 max-w-3xl text-base leading-7 text-slate">
            The initial pilot focuses on one close workflow and one accountable reviewer. Every derived amount retains its source links, rule version, and approval history.
          </p>
        </div>
        <Link
          to="/automation/compliance"
          className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-6 py-3 text-base font-semibold text-white transition-colors hover:bg-primary-dark"
        >
          Explore compliance automation
        </Link>
      </section>
    </>
  );
}
