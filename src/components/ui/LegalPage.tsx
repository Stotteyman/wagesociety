import PageHeader from './PageHeader';

/**
 * Shared shell for the legal pages, so Terms and Privacy stay visually identical
 * and neither drifts into its own layout.
 */
export function LegalPage({
  eyebrow, title, lede, updated, children,
}: {
  eyebrow: string;
  title: string;
  lede: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mx-auto max-w-[760px] px-5 py-14">
      <PageHeader eyebrow={eyebrow} title={title} lede={lede} />
      <p className="wage-num mt-4 text-[13px] text-wage-muted-2">Last updated {updated}</p>
      <div className="mt-10 grid gap-9">{children}</div>
    </section>
  );
}

export function Clause({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="font-body text-[19px] font-bold normal-case tracking-normal">
        <span className="wage-num mr-2.5 text-wage-amber-2">{n}.</span>
        {title}
      </h2>
      <div className="mt-3 grid gap-3 text-[15px] leading-relaxed text-wage-muted [&_a]:text-wage-paper [&_a]:underline [&_b]:text-wage-paper [&_strong]:text-wage-paper">
        {children}
      </div>
    </section>
  );
}

export function Bullets({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="grid gap-2 pl-1">
      {items.map((it, i) => (
        <li key={i} className="flex gap-2.5">
          <span aria-hidden="true" className="mt-[9px] h-[5px] w-[5px] shrink-0 bg-wage-amber" />
          <span>{it}</span>
        </li>
      ))}
    </ul>
  );
}
