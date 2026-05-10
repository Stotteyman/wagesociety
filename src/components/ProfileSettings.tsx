import { useEffect, useRef, useState } from 'react'
import {
  AlertCircle,
  Check,
  Link2,
  Loader2,
  Save,
  User,
} from 'lucide-react'
import { authedFetch, getIdentityLinkUrl, getSupabaseBrowserClient } from '../lib/supabaseBrowser'
import { getClientAuthRedirectUrl } from '../lib/authRedirect'
import type { User as SupabaseUser } from '@supabase/supabase-js'

// ─── Types ───────────────────────────────────────────────────────────────────

type MemberProfile = {
  email: string
  display_name: string | null
  avatar_url: string | null
  bio: string | null
  skills: string[] | null
  livestream_links: string[] | null
  updated_at: string | null
}

type OAuthProviderOption = {
  key: string
  label: string
  description: string
}

type StreamAccountOption = {
  key: string
  label: string
  url: string
}

type StreamAccounts = {
  kick: {
    connected: boolean
    username: string | null
    url: string | null
  }
  youtube: {
    connected: boolean
    selected: string | null
    options: StreamAccountOption[]
  }
}

type ProfileApiResponse = {
  profile: MemberProfile
  oauth_providers?: OAuthProviderOption[]
  stream_accounts?: StreamAccounts
}

const FALLBACK_OAUTH_PROVIDERS: OAuthProviderOption[] = [
  { key: 'discord', label: 'Discord', description: 'Link your Discord account' },
  { key: 'google', label: 'Google / YouTube', description: 'Link your Google account' },
  { key: 'custom:kick', label: 'Kick', description: 'Link your Kick account' },
  { key: 'apple', label: 'Apple', description: 'Link your Apple account' },
  { key: 'facebook', label: 'Facebook', description: 'Link your Facebook account' },
]

function toTitleCase(value: string) {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((word) => word[0]?.toUpperCase() + word.slice(1))
    .join(' ')
}

function providerOptionFromKey(key: string): OAuthProviderOption {
  const normalized = key.trim().toLowerCase()
  const fallback = FALLBACK_OAUTH_PROVIDERS.find((provider) => provider.key === normalized)
  if (fallback) return fallback

  const customName = normalized.startsWith('custom:') ? normalized.slice('custom:'.length) : normalized
  const label = toTitleCase(customName) || normalized
  return {
    key: normalized,
    label,
    description: `Link your ${label} account`,
  }
}

function mergeProviderOptions(
  fromServer: OAuthProviderOption[] | undefined,
  user: SupabaseUser | null,
) {
  const options = new Map<string, OAuthProviderOption>()

  for (const provider of fromServer ?? []) {
    const key = String(provider.key || '').trim().toLowerCase()
    if (!key) continue
    options.set(key, {
      key,
      label: String(provider.label || '').trim() || providerOptionFromKey(key).label,
      description: String(provider.description || '').trim() || providerOptionFromKey(key).description,
    })
  }

  for (const identity of user?.identities ?? []) {
    const key = String(identity.provider || '').trim().toLowerCase()
    if (!key || key === 'email') continue
    if (!options.has(key)) {
      options.set(key, providerOptionFromKey(key))
    }
  }

  if (options.size === 0) {
    for (const provider of FALLBACK_OAUTH_PROVIDERS) {
      options.set(provider.key, provider)
    }
  }

  // Keep critical providers visible even when server discovery is partial.
  if (!options.has('google')) {
    options.set('google', providerOptionFromKey('google'))
  }

  if (!options.has('custom:kick') && !options.has('kick')) {
    options.set('custom:kick', providerOptionFromKey('custom:kick'))
  }

  return Array.from(options.values()).sort((a, b) => a.label.localeCompare(b.label))
}

function deriveUsername(user: SupabaseUser | null, memberEmail: string) {
  const fromUsername = String(user?.user_metadata?.username || '').trim()
  const fromPreferred = String(user?.user_metadata?.preferred_username || '').trim()
  const fromEmail = String(user?.email || memberEmail || '')
    .split('@')[0]
    .trim()

  return fromUsername || fromPreferred || fromEmail || ''
}

// ─── Component ────────────────────────────────────────────────────────────────

type ProfileSettingsProps = {
  member: { email: string }
  linkedProvider?: string | null
}

export function ProfileSettings({ member, linkedProvider }: ProfileSettingsProps) {
  const [profile, setProfile] = useState<MemberProfile | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid'>('idle')
  const [usernameMessage, setUsernameMessage] = useState('')
  const usernameDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [avatarUrl, setAvatarUrl] = useState('')
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [bio, setBio] = useState('')
  const [skillsInput, setSkillsInput] = useState('')
  const [kickConnectedUrl, setKickConnectedUrl] = useState<string | null>(null)
  const [kickConnectedUsername, setKickConnectedUsername] = useState<string | null>(null)
  const [youtubeConnected, setYoutubeConnected] = useState(false)
  const [youtubeOptions, setYoutubeOptions] = useState<StreamAccountOption[]>([])
  const [selectedYouTubeChannel, setSelectedYouTubeChannel] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [linkingSuccess, setLinkingSuccess] = useState<string | null>(null)
  const [user, setUser] = useState<SupabaseUser | null>(null)
  const [linkingProvider, setLinkingProvider] = useState<string | null>(null)
  const [oauthProviders, setOauthProviders] = useState<OAuthProviderOption[]>(FALLBACK_OAUTH_PROVIDERS)

  useEffect(() => {
    void (async () => {
      try {
        const supabase = getSupabaseBrowserClient()
        const [profileResponse, { data: { user: currentUser } }] = await Promise.all([
          authedFetch('/api/me/profile'),
          supabase.auth.getUser(),
        ])

        const metadataName = deriveUsername(currentUser, member.email)

        if (profileResponse.ok) {
          const data = (await profileResponse.json()) as ProfileApiResponse
          const p = data.profile
          setProfile(p)
          setOauthProviders(mergeProviderOptions(data.oauth_providers, currentUser))
          setDisplayName(p.display_name || metadataName)
          setAvatarUrl(p.avatar_url || '')
          setBio(p.bio || '')
          setSkillsInput((p.skills || []).join(', '))
          const streamAccounts = data.stream_accounts
          setKickConnectedUrl(streamAccounts?.kick?.url || null)
          setKickConnectedUsername(streamAccounts?.kick?.username || null)
          setYoutubeConnected(Boolean(streamAccounts?.youtube?.connected))
          const nextYouTubeOptions = streamAccounts?.youtube?.options || []
          setYoutubeOptions(nextYouTubeOptions)
          const selected = streamAccounts?.youtube?.selected || nextYouTubeOptions[0]?.key || ''
          setSelectedYouTubeChannel(selected)
        } else {
          setOauthProviders(mergeProviderOptions(undefined, currentUser))
          setDisplayName(metadataName)
        }
        setUser(currentUser)
      } catch {
        setError('Failed to load profile.')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  // Handle OAuth identity linking callback: refresh profile when linkedProvider is set (from URL param)
  useEffect(() => {
    if (!linkedProvider) return

    const refreshProfileAfterLinking = async () => {
      try {
        setError('')
        const supabase = getSupabaseBrowserClient()
        const [profileResponse, { data: { user: currentUser } }] = await Promise.all([
          authedFetch('/api/me/profile'),
          supabase.auth.getUser(),
        ])

        if (profileResponse.ok && currentUser) {
          const data = (await profileResponse.json()) as ProfileApiResponse
          const p = data.profile
          const streamAccounts = data.stream_accounts
          setProfile(p)
          setOauthProviders(mergeProviderOptions(data.oauth_providers, currentUser))
          setUser(currentUser)
          setKickConnectedUrl(streamAccounts?.kick?.url || null)
          setKickConnectedUsername(streamAccounts?.kick?.username || null)
          setYoutubeConnected(Boolean(streamAccounts?.youtube?.connected))

          const nextYouTubeOptions = streamAccounts?.youtube?.options || []
          setYoutubeOptions(nextYouTubeOptions)
          const selected = streamAccounts?.youtube?.selected || nextYouTubeOptions[0]?.key || ''
          setSelectedYouTubeChannel(selected)

          // Show success message with the linked provider name
          const providerLabel = oauthProviders.find(
            (p) => p.key.toLowerCase() === linkedProvider.toLowerCase(),
          )?.label || linkedProvider
          setLinkingSuccess(`${providerLabel} account linked successfully!`)
          setTimeout(() => setLinkingSuccess(null), 4000)
        }
      } catch (err) {
        console.error('Failed to refresh profile after linking:', err)
      }
    }

    void refreshProfileAfterLinking()
  }, [linkedProvider, oauthProviders])

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
        selectedYouTubeChannel: youtubeConnected
          ? (selectedYouTubeChannel || null)
          : null,
        connectedKickUsername: kickConnectedUsername || null,
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

  const linkIdentity = async (provider: string) => {
    const normalizedProvider = provider.trim().toLowerCase()
    if (!normalizedProvider) return

    setLinkingProvider(provider)
    setError('')
    try {
      const isKick = normalizedProvider === 'custom:kick' || normalizedProvider === 'kick'
      const redirectTo = getClientAuthRedirectUrl(`/dashboard?view=settings&linked=${normalizedProvider}`)
      
      let oauthUrl: string
      try {
        oauthUrl = await getIdentityLinkUrl(normalizedProvider, redirectTo)
      } catch (primaryError) {
        const alternateProvider =
          normalizedProvider === 'custom:kick'
            ? 'kick'
            : normalizedProvider === 'kick'
            ? 'custom:kick'
            : null

        if (!alternateProvider) throw primaryError
        oauthUrl = await getIdentityLinkUrl(alternateProvider, redirectTo)
      }

      if (isKick) {
        // Open Kick OAuth in a popup window
        sessionStorage.setItem('dashboard_return_tab', 'settings')
        const popupWindow = window.open(oauthUrl, 'kickOAuthPopup', 'width=500,height=700,menubar=no,location=no,resizable=yes,scrollbars=yes')
        
        if (!popupWindow) {
          setError('Failed to open popup window. Please check your browser popup settings.')
          setLinkingProvider(null)
          return
        }

        // Poll the popup until it closes
        const pollInterval = setInterval(() => {
          if (popupWindow.closed) {
            clearInterval(pollInterval)
            setLinkingProvider(null)
            
            // After popup closes, refresh the profile to show updated connection status
            void (async () => {
              try {
                const supabase = getSupabaseBrowserClient()
                const [profileResponse, { data: { user: currentUser } }] = await Promise.all([
                  authedFetch('/api/me/profile'),
                  supabase.auth.getUser(),
                ])

                if (profileResponse.ok && currentUser) {
                  const data = (await profileResponse.json()) as ProfileApiResponse
                  const p = data.profile
                  const streamAccounts = data.stream_accounts
                  
                  setProfile(p)
                  setOauthProviders(mergeProviderOptions(data.oauth_providers, currentUser))
                  setUser(currentUser)
                  setKickConnectedUrl(streamAccounts?.kick?.url || null)
                  setKickConnectedUsername(streamAccounts?.kick?.username || null)
                  setYoutubeConnected(Boolean(streamAccounts?.youtube?.connected))
                  
                  const nextYouTubeOptions = streamAccounts?.youtube?.options || []
                  setYoutubeOptions(nextYouTubeOptions)
                  const selected = streamAccounts?.youtube?.selected || nextYouTubeOptions[0]?.key || ''
                  setSelectedYouTubeChannel(selected)
                  
                  // Show success message
                  setLinkingSuccess('Kick account linked successfully!')
                  setTimeout(() => setLinkingSuccess(null), 4000)
                }
              } catch (err) {
                console.error('Failed to refresh profile after Kick linking:', err)
              }
            })()
          }
        }, 500)
      } else {
        // For other providers (Google, Discord, etc.), do full-page redirect
        sessionStorage.setItem('dashboard_return_tab', 'settings')
        window.location.href = oauthUrl
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to initiate OAuth linking.')
      setLinkingProvider(null)
    }
  }

  const isLinked = (provider: string) => {
    const normalizedProvider = provider.trim().toLowerCase()
    return user?.identities?.some((i) => String(i.provider || '').trim().toLowerCase() === normalizedProvider) ?? false
  }

  const linkedIdentityProviders = (user?.identities || [])
    .map((identity) => String(identity.provider || '').toLowerCase())
    .filter(Boolean)

  const checkUsername = (value: string) => {
    if (usernameDebounceRef.current) clearTimeout(usernameDebounceRef.current)
    const trimmed = value.trim()
    // If the value matches current saved name, no check needed
    if (!trimmed || trimmed.toLowerCase() === String(profile?.display_name ?? '').trim().toLowerCase()) {
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
          const res = await fetch(
            `/api/check-username?username=${encodeURIComponent(trimmed)}&currentEmail=${encodeURIComponent(member.email)}`,
          )

          if (!res.ok) {
            setUsernameStatus('idle')
            setUsernameMessage('Could not verify availability right now.')
            return
          }

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

  const uploadAvatar = async (file: File) => {
    const maxSize = 8 * 1024 * 1024
    const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

    if (file.size > maxSize) {
      setError('Image is too large. Maximum size is 8 MB.')
      return
    }

    if (file.type && !allowedTypes.has(file.type)) {
      setError('Unsupported image type. Use JPG, PNG, WEBP, or GIF.')
      return
    }

    setAvatarUploading(true)
    setError('')
    setSaved(false)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const uploadResponse = await authedFetch('/api/profile-photo-upload', {
        method: 'POST',
        body: formData,
      })

      const uploadData = (await uploadResponse.json()) as { url?: string; error?: string }
      if (!uploadResponse.ok || !uploadData.url) {
        setError(uploadData.error || 'Could not upload profile photo.')
        return
      }

      const profileResponse = await authedFetch('/api/me/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatarUrl: uploadData.url }),
      })

      if (!profileResponse.ok) {
        const data = (await profileResponse.json()) as { error?: string }
        setError(data.error || 'Photo uploaded, but profile update failed.')
        setAvatarUrl(uploadData.url)
        return
      }

      const profileData = (await profileResponse.json()) as ProfileApiResponse
      setProfile(profileData.profile)
      setAvatarUrl(profileData.profile.avatar_url || uploadData.url)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch {
      setError('Could not upload profile photo.')
    } finally {
      setAvatarUploading(false)
    }
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
            <label className="mb-1.5 block text-xs font-medium text-zinc-400">Profile Photo</label>
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-zinc-200/20 bg-zinc-950/40 p-3">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt="Avatar"
                  className="h-14 w-14 flex-shrink-0 rounded-full border border-zinc-200/20 object-cover"
                />
              ) : (
                <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full border border-zinc-200/20 bg-zinc-800 text-xs text-zinc-500">
                  {member.email.slice(0, 2).toUpperCase()}
                </div>
              )}

              <div className="flex-1">
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  disabled={avatarUploading}
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) {
                      void uploadAvatar(file)
                    }
                    e.currentTarget.value = ''
                  }}
                  className="block w-full text-sm text-zinc-300 file:mr-3 file:rounded-md file:border-0 file:bg-orange-300 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-zinc-950 hover:file:bg-orange-200 disabled:opacity-60"
                />
                <p className="mt-1 text-xs text-zinc-500">Upload JPG, PNG, WEBP, or GIF (max 8 MB).</p>
                {avatarUploading ? (
                  <p className="mt-1 text-xs text-zinc-400">Uploading photo...</p>
                ) : null}
              </div>
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

          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-xs font-medium text-zinc-400">
              Livestream Sources <span className="text-zinc-500">(from connected accounts)</span>
            </label>
            <div className="space-y-3 rounded-lg border border-zinc-200/20 bg-zinc-950/40 p-3">
              <div className="rounded-lg border border-zinc-200/10 bg-zinc-900/50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Kick</p>
                {kickConnectedUrl ? (
                  <p className="mt-1 text-sm text-zinc-200">
                    Connected stream: <a href={kickConnectedUrl} target="_blank" rel="noreferrer" className="text-orange-200 underline">{kickConnectedUrl}</a>
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-zinc-500">No Kick account linked yet. Link your Kick account below to enable Kick streams.</p>
                )}
              </div>

              <div className="rounded-lg border border-zinc-200/10 bg-zinc-900/50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">YouTube</p>
                {youtubeConnected ? (
                  <>
                    <label className="mt-2 block text-xs text-zinc-500">Select the YouTube channel for your livestream profile</label>
                    <select
                      value={selectedYouTubeChannel}
                      onChange={(e) => setSelectedYouTubeChannel(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-orange-200/70"
                    >
                      {youtubeOptions.length === 0 ? (
                        <option value="">No channels detected from your Google connection</option>
                      ) : (
                        youtubeOptions.map((option) => (
                          <option key={option.key} value={option.key}>
                            {option.label}
                          </option>
                        ))
                      )}
                    </select>
                    {youtubeOptions.find((option) => option.key === selectedYouTubeChannel)?.url ? (
                      <p className="mt-1 text-xs text-zinc-500">
                        Selected URL: {youtubeOptions.find((option) => option.key === selectedYouTubeChannel)?.url}
                      </p>
                    ) : null}
                  </>
                ) : (
                  <p className="mt-1 text-xs text-zinc-500">No Google account linked yet. Link Google below to select a YouTube channel.</p>
                )}
              </div>

              <p className="text-xs text-zinc-500">
                Twitch will appear here automatically once you add the Twitch OAuth connection in Supabase.
              </p>
            </div>
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
          {oauthProviders.map(({ key, label, description }) => {
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

          {linkedIdentityProviders.length > 0 ? (
            <div className="rounded-xl border border-zinc-200/10 bg-zinc-800/30 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Currently linked via Supabase</p>
              <p className="mt-1 text-xs text-zinc-500">
                {linkedIdentityProviders.join(', ')}
              </p>
            </div>
          ) : null}
        </div>
      </section>

      {/* Save */}
      {error ? (
        <div className="flex items-center gap-2 rounded-xl border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          <AlertCircle size={16} /> {error}
        </div>
      ) : null}

      {linkingSuccess ? (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          <Check size={16} /> {linkingSuccess}
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
