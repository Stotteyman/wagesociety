import { useEffect, useRef, useState } from 'react'
import {
  AlertCircle,
  Check,
  Link2,
  Loader2,
  Save,
  User,
} from 'lucide-react'
import { authedFetch, getSupabaseBrowserClient } from '../lib/supabaseBrowser'
import { getClientAuthRedirectUrl } from '../lib/authRedirect'
import type { User as SupabaseUser } from '@supabase/supabase-js'

// ─── Types ───────────────────────────────────────────────────────────────────

type MemberProfile = {
  email: string
  display_name: string | null
  avatar_url: string | null
  bio: string | null
  skills: string[] | null
  updated_at: string | null
}

type ProfileApiResponse = { profile: MemberProfile }

type OAuthProvider = 'discord' | 'google' | 'facebook'

const OAUTH_PROVIDERS: { key: OAuthProvider; label: string; description: string }[] = [
  { key: 'discord', label: 'Discord', description: 'Link your Discord account' },
  { key: 'google', label: 'Google / YouTube', description: 'Link your Google account' },
  { key: 'facebook', label: 'Facebook', description: 'Link your Facebook account' },
]

// ─── Component ────────────────────────────────────────────────────────────────

export function ProfileSettings({ member }: { member: { email: string } }) {
  const [profile, setProfile] = useState<MemberProfile | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid'>('idle')
  const [usernameMessage, setUsernameMessage] = useState('')
  const usernameDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [avatarUrl, setAvatarUrl] = useState('')
  const [bio, setBio] = useState('')
  const [skillsInput, setSkillsInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [user, setUser] = useState<SupabaseUser | null>(null)
  const [linkingProvider, setLinkingProvider] = useState<OAuthProvider | null>(null)

  useEffect(() => {
    void (async () => {
      try {
        const supabase = getSupabaseBrowserClient()
        const [profileResponse, { data: { user: currentUser } }] = await Promise.all([
          authedFetch('/api/me/profile'),
          supabase.auth.getUser(),
        ])
        if (profileResponse.ok) {
          const data = (await profileResponse.json()) as ProfileApiResponse
          const p = data.profile
          setProfile(p)
          setDisplayName(p.display_name || '')
          setAvatarUrl(p.avatar_url || '')
          setBio(p.bio || '')
          setSkillsInput((p.skills || []).join(', '))
        }
        setUser(currentUser)
      } catch {
        setError('Failed to load profile.')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const handleSave = async () => {
    setSaving(true)
    setError('')
    setSaved(false)
    const trimmed = displayName.trim()
    if (trimmed && !/^[a-zA-Z0-9_-]{3,20}$/.test(trimmed)) {
      setError('Username must be 3–20 characters: letters, numbers, underscores, or hyphens only.')
      setSaving(false)
      return
    }
    if (usernameStatus === 'taken') {
      setError('That username is already taken. Please choose another.')
      setSaving(false)
      return
    }
    const response = await authedFetch('/api/me/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        displayName: displayName.trim() || undefined,
        avatarUrl: avatarUrl.trim() || '',
        bio: bio.trim() || undefined,
        skills: skillsInput.split(',').map((s) => s.trim()).filter(Boolean),
      }),
    })
    if (response.ok) {
      const data = (await response.json()) as ProfileApiResponse
      setProfile(data.profile)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } else {
      const data = (await response.json()) as { error?: string }
      setError(data.error || 'Save failed.')
    }
    setSaving(false)
  }

  const linkIdentity = async (provider: OAuthProvider) => {
    setLinkingProvider(provider)
    setError('')
    try {
      const supabase = getSupabaseBrowserClient()
      const { error: linkError } = await supabase.auth.linkIdentity({
        provider,
        options: {
          redirectTo: getClientAuthRedirectUrl(`/dashboard?view=settings&linked=${provider}`),
        },
      })
      if (linkError) {
        setError(linkError.message)
        setLinkingProvider(null)
      }
      // On success the page is redirected to the OAuth provider
    } catch {
      setError('Failed to initiate OAuth linking.')
      setLinkingProvider(null)
    }
  }

  const isLinked = (provider: OAuthProvider) =>
    user?.identities?.some((i) => i.provider === provider) ?? false

  const checkUsername = (value: string) => {
    if (usernameDebounceRef.current) clearTimeout(usernameDebounceRef.current)
    const trimmed = value.trim()
    // If the value matches current saved name, no check needed
    if (!trimmed || trimmed === (profile?.display_name ?? '')) {
      setUsernameStatus('idle')
      setUsernameMessage('')
      return
    }
    if (!/^[a-zA-Z0-9_-]{3,20}$/.test(trimmed)) {
      setUsernameStatus('invalid')
      setUsernameMessage('3–20 characters. Letters, numbers, underscores, hyphens only.')
      return
    }
    setUsernameStatus('checking')
    setUsernameMessage('')
    usernameDebounceRef.current = setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch(`/api/check-username?username=${encodeURIComponent(trimmed)}`)
          const data = (await res.json()) as { available?: boolean; reason?: string }
          if (data.available === true) {
            setUsernameStatus('available')
            setUsernameMessage('Username is available!')
          } else {
            setUsernameStatus('taken')
            setUsernameMessage(data.reason || 'Username is already taken.')
          }
        } catch {
          setUsernameStatus('idle')
          setUsernameMessage('')
        }
      })()
    }, 500)
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-zinc-400">
        <Loader2 size={16} className="animate-spin" /> Loading profile...
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Profile Info */}
      <section className="rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-5">
        <div className="mb-4 flex items-center gap-2">
          <User size={16} className="text-orange-200" />
          <h2 className="font-bold text-zinc-100">Profile</h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-zinc-400">Username</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => {
                setDisplayName(e.target.value)
                checkUsername(e.target.value)
              }}
              maxLength={20}
              placeholder={member.email.split('@')[0].slice(0, 20)}
              autoComplete="username"
              className={`w-full rounded-lg border bg-zinc-950/60 px-3 py-2 text-sm text-zinc-100 outline-none transition ${
                usernameStatus === 'available'
                  ? 'border-emerald-400/60 focus:border-emerald-300'
                  : usernameStatus === 'taken' || usernameStatus === 'invalid'
                  ? 'border-rose-400/60 focus:border-rose-300'
                  : 'border-zinc-200/20 focus:border-orange-200/70'
              }`}
            />
            <p className="mt-0.5 text-xs text-zinc-500">3–20 characters. Letters, numbers, _ and - only.</p>
            {usernameStatus === 'checking' ? (
              <p className="mt-0.5 text-xs text-zinc-400">Checking availability...</p>
            ) : usernameMessage ? (
              <p className={`mt-0.5 text-xs ${usernameStatus === 'available' ? 'text-emerald-300' : 'text-rose-300'}`}>
                {usernameMessage}
              </p>
            ) : null}
          </div>

          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-xs font-medium text-zinc-400">Avatar URL</label>
            <div className="flex items-center gap-3">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt="Avatar"
                  className="h-10 w-10 flex-shrink-0 rounded-full border border-zinc-200/20 object-cover"
                />
              ) : (
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border border-zinc-200/20 bg-zinc-800 text-xs text-zinc-500">
                  {member.email.slice(0, 2).toUpperCase()}
                </div>
              )}
              <input
                type="url"
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
                placeholder="https://example.com/your-photo.jpg"
                className="flex-1 rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-orange-200/70"
              />
            </div>
          </div>

          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-xs font-medium text-zinc-400">Bio</label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Tell the community who you are and what you do..."
              className="w-full resize-none rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-orange-200/70"
            />
            <p className="mt-0.5 text-right text-xs text-zinc-500">{bio.length}/500</p>
          </div>

          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-xs font-medium text-zinc-400">
              Skills <span className="text-zinc-500">(comma-separated)</span>
            </label>
            <input
              type="text"
              value={skillsInput}
              onChange={(e) => setSkillsInput(e.target.value)}
              placeholder="Video editing, Mixing, Graphic design, Social media..."
              className="w-full rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-orange-200/70"
            />
            {skillsInput.trim() ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {skillsInput.split(',').map((s) => s.trim()).filter(Boolean).map((skill) => (
                  <span
                    key={skill}
                    className="rounded-full border border-zinc-200/20 bg-zinc-800/60 px-2.5 py-0.5 text-xs text-zinc-300"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {/* Linked Accounts */}
      <section className="rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-5">
        <div className="mb-1 flex items-center gap-2">
          <Link2 size={16} className="text-orange-200" />
          <h2 className="font-bold text-zinc-100">Linked Accounts</h2>
        </div>
        <p className="mb-4 text-xs text-zinc-500">
          Link your OAuth accounts to enable single sign-on and verify your identities.
        </p>
        <div className="space-y-2">
          {/* Kick — custom OAuth flow */}
          <div className="flex items-center justify-between rounded-xl border border-zinc-200/10 bg-zinc-800/40 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-zinc-100">Kick</p>
              <p className="text-xs text-zinc-500">Link your Kick streaming account</p>
            </div>
            {user?.user_metadata?.kick_username ? (
              <span className="flex items-center gap-1.5 rounded-full border border-emerald-300/40 bg-emerald-300/5 px-3 py-1 text-xs font-semibold text-emerald-300">
                <Check size={11} /> {user.user_metadata.kick_username as string}
              </span>
            ) : (
              <a
                href="/api/kick-login"
                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200/25 px-3 py-1.5 text-xs font-semibold text-zinc-200 transition hover:border-orange-200/50 hover:text-orange-100"
              >
                <Link2 size={11} />
                Link
              </a>
            )}
          </div>

          {OAUTH_PROVIDERS.map(({ key, label, description }) => {
            const linked = isLinked(key)
            return (
              <div
                key={key}
                className="flex items-center justify-between rounded-xl border border-zinc-200/10 bg-zinc-800/40 px-4 py-3"
              >
                <div>
                  <p className="text-sm font-semibold text-zinc-100">{label}</p>
                  <p className="text-xs text-zinc-500">{description}</p>
                </div>
                {linked ? (
                  <span className="flex items-center gap-1.5 rounded-full border border-emerald-300/40 bg-emerald-300/5 px-3 py-1 text-xs font-semibold text-emerald-300">
                    <Check size={11} /> Linked
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={linkingProvider !== null}
                    onClick={() => { void linkIdentity(key) }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200/25 px-3 py-1.5 text-xs font-semibold text-zinc-200 transition hover:border-orange-200/50 hover:text-orange-100 disabled:opacity-60"
                  >
                    {linkingProvider === key ? (
                      <Loader2 size={11} className="animate-spin" />
                    ) : (
                      <Link2 size={11} />
                    )}
                    {linkingProvider === key ? 'Connecting...' : 'Link'}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </section>

      {/* Save */}
      {error ? (
        <div className="flex items-center gap-2 rounded-xl border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          <AlertCircle size={16} /> {error}
        </div>
      ) : null}

      {saved ? (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          <Check size={16} /> Profile saved successfully!
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => { void handleSave() }}
        disabled={saving}
        className="inline-flex items-center gap-2 rounded-lg bg-orange-300 px-5 py-2.5 font-semibold text-zinc-950 transition hover:bg-orange-200 disabled:opacity-70"
      >
        {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
        {saving ? 'Saving...' : 'Save Profile'}
      </button>

      {profile?.updated_at ? (
        <p className="text-xs text-zinc-500">
          Last updated {new Date(profile.updated_at).toLocaleString()}
        </p>
      ) : null}
    </div>
  )
}
