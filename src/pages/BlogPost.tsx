import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import EmptyState from '../components/ui/EmptyState';

type Post = {
  slug: string; title: string; body: string | null;
  cover_image_url: string | null; published_at: string; author_name: string | null;
};

export default function BlogPost() {
  const { slug } = useParams();
  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    supabase.from('wagesociety_blog').select('*').eq('slug', slug).maybeSingle()
      .then(({ data }) => { setPost(data as Post | null); setLoading(false); });
  }, [slug]);

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-16">
        <div className="wage-card h-[320px] animate-pulse" />
      </div>
    );
  }

  if (!post) {
    return (
      <div className="mx-auto max-w-2xl px-5 py-20">
        <EmptyState
          title="That post isn't here."
          detail="It may have been unpublished, or the link is wrong."
          action={<Link to="/blog" className="wage-btn wage-btn-ghost">Back to the blog</Link>}
        />
      </div>
    );
  }

  return (
    <article className="mx-auto max-w-3xl px-5 py-14">
      <Link to="/blog" className="text-sm text-wage-muted transition-colors hover:text-wage-paper">
        Back to the blog
      </Link>

      {post.cover_image_url && (
        <img
          src={post.cover_image_url}
          alt=""
          className="mt-5 w-full rounded-[14px] border border-wage-line"
        />
      )}

      <h1 className="mt-7 text-[clamp(32px,5vw,52px)]">{post.title}</h1>
      <p className="mt-3 font-mono text-[11.5px] tracking-[0.08em] text-wage-muted-2">
        {post.author_name ? `${post.author_name} · ` : ''}
        <time dateTime={post.published_at}>
          {new Date(post.published_at).toLocaleDateString(undefined, {
            year: 'numeric', month: 'long', day: 'numeric',
          })}
        </time>
      </p>

      <hr className="my-8 h-px border-0 bg-wage-line" />

      <div className="whitespace-pre-wrap text-[17px] leading-[1.75] text-[#CFC9D8]">{post.body}</div>
    </article>
  );
}
