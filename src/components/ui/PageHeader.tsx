import type { ReactNode } from 'react';

/** Standard page opening: mono eyebrow, display headline, optional lede and action. */
export default function PageHeader({
  eyebrow,
  title,
  lede,
  action,
}: {
  eyebrow: string;
  title: string;
  lede?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-6">
      <div>
        <div className="flex items-center gap-2.5">
          <span aria-hidden="true" className="wage-chevron" />
          <span className="wage-eyebrow">{eyebrow}</span>
        </div>
        <h1 className="wage-cut mt-3 text-[clamp(30px,4vw,50px)]">{title}</h1>
        {lede && <p className="mt-3 max-w-[56ch] text-[17px] text-[#B7C2CC]">{lede}</p>}
      </div>
      {action}
    </div>
  );
}

/** Card-shaped placeholder used while a grid loads. */
export function CardSkeleton({ count = 4, height = 186 }: { count?: number; height?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="wage-card animate-pulse" style={{ height }} />
      ))}
    </>
  );
}
