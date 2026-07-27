import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useSession } from '../hooks/useSession';
import ConnectAccounts from '../components/ConnectAccounts';
import Membership from '../components/Membership';
import { runProvisioning } from '../lib/provision';
import PageHeader from '../components/ui/PageHeader';
import AvatarUpload from '../components/ui/AvatarUpload';
import SocialLinksEditor from '../components/SocialLinksEditor';

type ProfileRow = {
  display_name?: string; bio?: string; avatar_url?: string;
  primary_platform?: string; tier?: string;
};

export default function Settings() {
  const { session } = useSession();
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [platform, setPlatform] = useState('');
  const [tier, setTier] = useState('free');
  const [msg, setMsg] = useState<{ tone: 'error' | 'ok'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // If we just returned from linking an identity, provision + sync role.
    if (new URLSearchParams(window.location.search).get('linked')) runProvisioning();
    supabase.rpc('ws_my_profile').then(({ data }) => {
      const p = data as ProfileRow | null;
      if (!p) return;
      setDisplayName(p.display_name || '');
      setBio(p.bio || '');
      setAvatarUrl(p.avatar_url || '');
      setPlatform(p.primary_platform || '');
      setTier(p.tier || 'free');
    });
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const { error } = await supabase.rpc('ws_update_profile', {
      p_display_name: displayName, p_bio: bio, p_avatar_url: avatarUrl, p_primary_platform: platform,
    });
    setBusy(false);
    setMsg(error
      ? { tone: 'error', text: `Couldn't save your profile. ${error.message}` }
      : { tone: 'ok', text: 'Profile saved.' });
  }

  return (
    <section className="mx-auto max-w-2xl px-5 py-14">
      <PageHeader eyebrow="Account" title="Settings" lede={session?.user.email} />

      <form onSubmit={save} className="wage-card mt-8 grid gap-5 p-6">
        <div className="text-[16px] font-bold">Public profile</div>

        <AvatarUpload value={avatarUrl} name={displayName || 'You'} onChange={setAvatarUrl} />

        <label className="grid gap-1.5">
          <span className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-wage-muted-2">Display name</span>
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="input" />
        </label>

        <label className="grid gap-1.5">
          <span className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-wage-muted-2">Bio</span>
          <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} className="input" />
          <span className="text-[12.5px] text-wage-muted-2">
            Shown on your public profile and in the directory.
          </span>
        </label>

        <button className="wage-btn wage-btn-primary mt-1 justify-self-start" disabled={busy}>
          {busy ? 'Saving...' : 'Save changes'}
        </button>

        {msg && (
          <p
            role="status"
            className={`border px-4 py-3 text-sm ${
              msg.tone === 'error'
                ? 'border-wage-error/40 bg-wage-error/[0.08] text-wage-error'
                : 'border-wage-success/40 bg-wage-success/[0.08] text-wage-success'
            }`}
          >
            {msg.text}
          </p>
        )}
      </form>

      {/* Streaming lives with the connections it comes from, not in the profile form. */}
      <div className="mt-5">
        <ConnectAccounts primaryPlatform={platform} onPrimaryPlatformChange={setPlatform} />
      </div>

      <div className="mt-5"><SocialLinksEditor /></div>
      <div className="mt-5"><Membership currentTier={tier} /></div>

      <div className="mt-10 border-t border-wage-line pt-6">
        <button onClick={() => supabase.auth.signOut()} className="wage-btn wage-btn-ghost">
          Sign out
        </button>
      </div>
    </section>
  );
}
