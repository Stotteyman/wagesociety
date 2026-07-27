import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <section className="relative mx-auto flex max-w-2xl flex-col items-center overflow-hidden px-5 py-32 text-center">
      <div
        aria-hidden="true"
        className="wage-portal-glow pointer-events-none absolute left-1/2 top-1/2 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full"
      />
      <div className="relative">
        <span className="wage-eyebrow">Error 404</span>
        <h1 className="mt-4 text-[clamp(44px,8vw,84px)]">Nothing here</h1>
        <p className="mx-auto mt-4 max-w-[44ch] text-wage-muted">
          That page doesn't exist. It may have moved, or the link was mistyped.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link to="/" className="wage-btn wage-btn-primary">Back home</Link>
          <Link to="/creators" className="wage-btn wage-btn-ghost">Browse creators</Link>
        </div>
      </div>
    </section>
  );
}
