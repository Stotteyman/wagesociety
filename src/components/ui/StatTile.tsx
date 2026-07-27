/**
 * Stat tile. A zero states WHY it's zero and what to do next — never a bare 0.
 * See docs/BRAND_GUIDE.md §3 rule 3 (say the real number, including zero).
 */
export default function StatTile({
  label,
  value,
  detail,
  tone = 'default',
}: {
  label: string;
  value: string | number;
  detail?: string;
  tone?: 'default' | 'gold' | 'live' | 'idle';
}) {
  const valueTone =
    tone === 'gold' ? 'text-wage-amber-2'
    : tone === 'live' ? 'text-wage-amber-2'
    : tone === 'idle' ? 'text-wage-muted-2'
    : 'text-wage-paper';

  return (
    <div className="wage-card px-5 py-4">
      <div className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-wage-muted-2">
        {label}
      </div>
      <div className={`wage-num mt-2 text-[28px] leading-none ${valueTone}`}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
      {detail && <div className="mt-2 text-[12.5px] text-wage-muted-2">{detail}</div>}
    </div>
  );
}
