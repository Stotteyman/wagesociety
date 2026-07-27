import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import SocialIcon, { SOCIAL_PLATFORMS, type SocialKey } from './SocialIcon';

type Links = Partial<Record<SocialKey, string>>;

/**
 * Hand-entered social profiles. Streaming platforms are NOT here — those come
 * from the OAuth connections above, so a creator can never end up with a Kick
 * link that contradicts their connected Kick account.
 */
export default function SocialLinksEditor() {
  const [links, setLinks] = useState<Links>({});
  const [msg, setMsg] = useState<{ tone: 'error' | 'ok'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.rpc('ws_my_profile').then(({ data }) => {
      const p = data as { social_links?: Links } | null;
      if (p?.social_links) setLinks(p.social_links);
    });
  }, []);

  async function save() {
    setBusy(true); setMsg(null);
    // Drop empties so the profile only renders platforms actually filled in.
    const cleaned: Links = {};
    for (const [k, v] of Object.entries(links)) {
      if (v && v.trim()) cleaned[k as SocialKey] = v.trim();
    }
    const { error } = await supabase.rpc('ws_set_social_links', { p_links: cleaned });
    setBusy(false);
    setMsg(error
      ? { tone: 'error', text: `Couldn't save your links. ${error.message}` }
      : { tone: 'ok', text: 'Links saved.' });
  }

  return (
    <div className="wage-card p-5">
      <h2 className="font-display text-lg">Where to find you</h2>
      <p className="mt-1 text-sm text-wage-muted">
        Anything you fill in shows as a logo on your public profile. Leave the rest blank.
      </p>

      <div className="mt-4 grid gap-3">
        {SOCIAL_PLATFORMS.map((p) => (
          <label key={p.key} className="flex items-center gap-3">
            <span className="w-24 shrink-0 text-sm text-wage-muted">
              <span className="mr-2 inline-block align-middle text-wage-muted-2">
                <SocialIcon name={p.key} size={16} />
              </span>
              {p.label}
            </span>
            <input
              className="input"
              placeholder={p.placeholder}
              value={links[p.key] ?? ''}
              onChange={(e) => setLinks({ ...links, [p.key]: e.target.value })}
            />
          </label>
        ))}
      </div>

      <button className="wage-btn wage-btn-primary mt-4" onClick={save} disabled={busy}>
        {busy ? 'Saving...' : 'Save links'}
      </button>

      {msg && (
        <p
          role="status"
          className={`mt-3 border px-4 py-3 text-sm ${
            msg.tone === 'error'
              ? 'border-wage-error/40 bg-wage-error/[0.08] text-wage-error'
              : 'border-wage-success/40 bg-wage-success/[0.08] text-wage-success'
          }`}
        >
          {msg.text}
        </p>
      )}
    </div>
  );
}
