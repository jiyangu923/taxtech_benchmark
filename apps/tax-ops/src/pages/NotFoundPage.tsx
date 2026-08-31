import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-24">
      <p className="font-mono text-xs uppercase tracking-[0.14em] text-amber-acc">404 · Page not found</p>
      <h1 className="mt-5 font-display text-5xl font-semibold tracking-tight">This page is not part of the close.</h1>
      <p className="mt-5 max-w-2xl text-lg leading-8 text-slate">Return to TaxBrains or explore the compliance-automation workflow.</p>
      <Link
        to="/"
        className="mt-8 inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-6 py-3 text-base font-semibold text-white transition-colors hover:bg-primary-dark"
      >
        Return home
      </Link>
    </section>
  );
}
