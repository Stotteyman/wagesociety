import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import PageHeader, { CardSkeleton } from '../components/ui/PageHeader';
import EmptyState from '../components/ui/EmptyState';

type Post = {
  slug: string; title: string; excerpt: string | null;
  cover_image_url: string | null; published_at: string; author_name: string | null;
};

export default function Blog() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from('wagesociety_blog').select('*').order('published_at', { ascending: false })
      .then(({ data }) => { setPosts((data as Post[]) ?? []); setLoading(false); });
  }, []);

  return (
    <section className="mx-auto max-w-4xl px-5 py-14">
      <PageHeader
        eyebrow="From the society"
        title="Blog"
        lede="Notes from building a platform where creators keep what they earn."
      />

      <div className="mt-9 grid gap-4">
        {loading ? (
          <CardSkeleton count={3} height={132} />
        ) : posts.length === 0 ? (
          <EmptyState
            title="Nothing published yet."
            detail="Posts written in the admin panel show up here as soon as they go live."
          />
        ) : (
          posts.map((p) => (
            <Link key={p.slug} to={`/blog/${p.slug}`} className="wage-card wage-card-hover block p-6">
              <div className="flex items-baseline justify-between gap-4">
                <h2 className="text-[22px] normal-case">{p.title}</h2>
                <time
                  dateTime={p.published_at}
                  className="shrink-0 font-mono text-[11.5px] text-wage-muted-2"
                >
                  {new Date(p.published_at).toLocaleDateString(undefined, {
                    year: 'numeric', month: 'short', day: 'numeric',
                  })}
                </time>
              </div>
              {p.excerpt && <p className="mt-2.5 text-[15px] leading-relaxed text-wage-muted">{p.excerpt}</p>}
              {p.author_name && (
                <p className="mt-3 font-mono text-[11.5px] tracking-[0.08em] text-wage-muted-2">
                  {p.author_name}
                </p>
              )}
            </Link>
          ))
        )}
      </div>
    </section>
  );
}
