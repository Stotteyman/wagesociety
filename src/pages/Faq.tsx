import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import PageHeader from '../components/ui/PageHeader';
import EmptyState from '../components/ui/EmptyState';

type Entry = { question: string; answer: string; sort_order: number };

export default function Faq() {
  const [items, setItems] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from('wagesociety_faq').select('*').order('sort_order')
      .then(({ data }) => { setItems((data as Entry[]) ?? []); setLoading(false); });
  }, []);

  return (
    <section className="mx-auto max-w-3xl px-5 py-14">
      <PageHeader eyebrow="Answers" title="Questions, answered" />

      <div className="mt-9 grid gap-2.5">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => <div key={i} className="wage-card h-[58px] animate-pulse" />)
        ) : items.length === 0 ? (
          <EmptyState
            title="No questions published yet."
            detail="Entries added in the admin panel appear here."
          />
        ) : (
          items.map((it, i) => (
            <details key={i} className="wage-card group px-5 py-4 [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[15.5px] font-semibold">
                {it.question}
                <span
                  aria-hidden="true"
                  className="shrink-0 font-mono text-wage-amber-2 transition-transform group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <p className="mt-3 max-w-[62ch] text-[15px] leading-relaxed text-[#C2BBCE]">{it.answer}</p>
            </details>
          ))
        )}
      </div>

      <div className="wage-card mt-8 flex flex-wrap items-center justify-between gap-4 px-6 py-5">
        <div>
          <div className="text-[15px] font-semibold">Still stuck?</div>
          <p className="mt-1 text-sm text-wage-muted">Ask in the Discord — someone answers most days.</p>
        </div>
        <Link to="/creators" className="wage-btn wage-btn-ghost">Browse creators</Link>
      </div>
    </section>
  );
}
