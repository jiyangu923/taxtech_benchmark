import { NavLink, Outlet } from 'react-router-dom';

const navClassName = ({ isActive }: { isActive: boolean }) =>
  [
    'rounded-md px-3 py-2 text-base font-medium transition-colors',
    isActive ? 'bg-primary/8 text-primary' : 'text-slate hover:bg-white hover:text-primary',
  ].join(' ');

export default function SiteLayout() {
  return (
    <div className="min-h-screen bg-canvas text-ink">
      <div className="h-[3px] bg-primary" />

      <header className="border-b border-line/70 bg-canvas/95">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-5">
          <NavLink to="/" className="font-display text-xl font-semibold tracking-tight text-primary">
            taxbrains.ai
          </NavLink>
          <nav aria-label="Primary" className="flex flex-wrap items-center gap-1">
            <NavLink to="/" end className={navClassName}>
              Home
            </NavLink>
            <NavLink to="/automation" className={navClassName}>
              Automation
            </NavLink>
            <NavLink to="/benchmark" className={navClassName}>
              Benchmark
            </NavLink>
            <a
              href="mailto:hello@taxbrains.ai?subject=TaxBrains%20compliance%20pilot"
              className="ml-2 inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 py-2 text-base font-semibold text-white transition-colors hover:bg-primary-dark"
            >
              Discuss a pilot
            </a>
          </nav>
        </div>
      </header>

      <main>
        <Outlet />
      </main>

      <footer className="border-t border-line bg-white py-8">
        <div className="mx-auto flex max-w-6xl flex-col justify-between gap-3 px-6 text-sm text-slate sm:flex-row">
          <span>© {new Date().getFullYear()} Seven Twenty Two LLC</span>
          <span>Human-approved · Deterministic tools · Traceable evidence</span>
        </div>
      </footer>
    </div>
  );
}
