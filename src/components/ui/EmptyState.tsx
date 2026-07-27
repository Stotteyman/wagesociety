import type { ReactNode } from 'react';

/**
 * Empty state — state the fact, then give the action.
 * No illustrations, no apologies, no invented counts. docs/BRAND_GUIDE.md §3, §10.
 */
export default function EmptyState({
  title,
  detail,
  action,
}: {
  title: string;
  detail?: string;
  action?: ReactNode;
}) {
  return (
    <div className="wage-card px-6 py-10 text-center">
      <p className="text-[15px] font-semibold text-wage-paper">{title}</p>
      {detail && <p className="mx-auto mt-2 max-w-[46ch] text-sm text-wage-muted">{detail}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}
