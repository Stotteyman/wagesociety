import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import PageHeader, { CardSkeleton } from '../components/ui/PageHeader';
import EmptyState from '../components/ui/EmptyState';

type Item = {
  id: string; name: string; description: string | null;
  price_cents: number; image_url: string | null; url: string | null;
};

export default function Merch() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from('wagesociety_merch').select('*').order('sort_order')
      .then(({ data }) => { setItems((data as Item[]) ?? []); setLoading(false); });
  }, []);

  return (
    <section className="mx-auto max-w-6xl px-5 py-14">
      <PageHeader
        eyebrow="Marketplace"
        title="Creator storefronts"
        lede="Everything here is sold by a WAGE creator. They set the price and they keep the revenue."
      />

      <div className="mt-9 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {loading ? (
          <CardSkeleton count={4} height={280} />
        ) : items.length === 0 ? (
          <div className="sm:col-span-2 lg:col-span-4">
            <EmptyState
              title="No items listed yet."
              detail="Creators on the Pro tier can open a storefront — products appear here the moment they publish one."
            />
          </div>
        ) : (
          items.map((it) => (
            <a
              key={it.id}
              href={it.url || '#'}
              target="_blank"
              rel="noreferrer"
              className="wage-card wage-card-hover overflow-hidden"
            >
              <div className="grid aspect-square place-items-center bg-wage-ink-2">
                {it.image_url ? (
                  <img src={it.image_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span aria-hidden="true" className="font-display text-[22px] text-wage-amber-2/60">WAGE</span>
                )}
              </div>
              <div className="p-4">
                <div className="truncate text-[14.5px] font-semibold">{it.name}</div>
                {it.description && (
                  <p className="mt-1 line-clamp-2 text-[13px] text-wage-muted">{it.description}</p>
                )}
                <div className="wage-num mt-2 text-[17px] text-wage-amber-2">
                  ${(it.price_cents / 100).toFixed(2)}
                </div>
              </div>
            </a>
          ))
        )}
      </div>
    </section>
  );
}
