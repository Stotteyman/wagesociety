import { jsxs, jsx, Fragment } from "react/jsx-runtime";
import { Link } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import { Loader2, User, Link2, Check, AlertCircle, Save, ArrowLeft, CreditCard, Settings } from "lucide-react";
import { g as getSupabaseBrowserClient, c as authedFetch, d as getClientAuthRedirectUrl, e as getIdentityLinkUrl, K as KICK_OAUTH_QUERY_PARAMS, f as KICK_OAUTH_SCOPES, h as formatRoleLabel } from "./router-CSiXPOJe.js";
import "@supabase/supabase-js";
import "stripe";
import "node:fs/promises";
import "node:path";
import "zod";
import "node:crypto";
const FALLBACK_OAUTH_PROVIDERS = [
  { key: "discord", label: "Discord", description: "Link your Discord account" },
  { key: "google", label: "Google / YouTube", description: "Link your Google account" },
  { key: "custom:kick", label: "Kick", description: "Link your Kick account" },
  { key: "apple", label: "Apple", description: "Link your Apple account" },
  { key: "facebook", label: "Facebook", description: "Link your Facebook account" }
];
function toTitleCase(value) {
  return value.split(/[\s_-]+/).filter(Boolean).map((word) => word[0]?.toUpperCase() + word.slice(1)).join(" ");
}
function providerOptionFromKey(key) {
  const normalized = key.trim().toLowerCase();
  const fallback = FALLBACK_OAUTH_PROVIDERS.find((provider) => provider.key === normalized);
  if (fallback) return fallback;
  const customName = normalized.startsWith("custom:") ? normalized.slice("custom:".length) : normalized;
  const label = toTitleCase(customName) || normalized;
  return {
    key: normalized,
    label,
    description: `Link your ${label} account`
  };
}
function normalizeProviderKey(key) {
  const normalized = String(key || "").trim().toLowerCase();
  if (normalized === "kick" || normalized === "custom:kick") return "kick";
  return normalized;
}
function mergeProviderOptions(fromServer, user) {
  const options = /* @__PURE__ */ new Map();
  for (const provider of fromServer ?? []) {
    const key = String(provider.key || "").trim().toLowerCase();
    if (!key) continue;
    options.set(key, {
      key,
      label: String(provider.label || "").trim() || providerOptionFromKey(key).label,
      description: String(provider.description || "").trim() || providerOptionFromKey(key).description
    });
  }
  for (const identity of user?.identities ?? []) {
    const key = String(identity.provider || "").trim().toLowerCase();
    if (!key || key === "email") continue;
    if (!options.has(key)) {
      options.set(key, providerOptionFromKey(key));
    }
  }
  if (options.size === 0) {
    for (const provider of FALLBACK_OAUTH_PROVIDERS) {
      options.set(provider.key, provider);
    }
  }
  if (!options.has("google")) {
    options.set("google", providerOptionFromKey("google"));
  }
  if (!options.has("custom:kick") && !options.has("kick")) {
    options.set("custom:kick", providerOptionFromKey("custom:kick"));
  }
  return Array.from(options.values()).sort((a, b) => a.label.localeCompare(b.label));
}
function deriveUsername(user, memberEmail) {
  const fromUsername = String(user?.user_metadata?.username || "").trim();
  const fromPreferred = String(user?.user_metadata?.preferred_username || "").trim();
  const fromEmail = String(user?.email || memberEmail || "").split("@")[0].trim();
  return fromUsername || fromPreferred || fromEmail || "";
}
function ProfileSettings({ member, linkedProvider }) {
  const [profile, setProfile] = useState(null);
  const [displayName, setDisplayName] = useState("");
  const [usernameStatus, setUsernameStatus] = useState("idle");
  const [usernameMessage, setUsernameMessage] = useState("");
  const usernameDebounceRef = useRef(null);
  const [avatarUrl, setAvatarUrl] = useState("");
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [bio, setBio] = useState("");
  const [skillsInput, setSkillsInput] = useState("");
  const [kickConnectedUrl, setKickConnectedUrl] = useState(null);
  const [kickConnectedUsername, setKickConnectedUsername] = useState(null);
  const [youtubeConnected, setYoutubeConnected] = useState(false);
  const [youtubeOptions, setYoutubeOptions] = useState([]);
  const [selectedYouTubeChannel, setSelectedYouTubeChannel] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [linkingSuccess, setLinkingSuccess] = useState(null);
  const [user, setUser] = useState(null);
  const [linkingProvider, setLinkingProvider] = useState(null);
  const [oauthProviders, setOauthProviders] = useState(FALLBACK_OAUTH_PROVIDERS);
  const refreshLinkedState = async () => {
    const supabase = getSupabaseBrowserClient();
    const [profileResponse, { data: { user: currentUser } }] = await Promise.all([
      authedFetch("/api/me/profile"),
      supabase.auth.getUser()
    ]);
    if (profileResponse.ok && currentUser) {
      const data = await profileResponse.json();
      const p = data.profile;
      const streamAccounts = data.stream_accounts;
      setProfile(p);
      setOauthProviders(mergeProviderOptions(data.oauth_providers, currentUser));
      setUser(currentUser);
      setKickConnectedUrl(streamAccounts?.kick?.url || null);
      setKickConnectedUsername(streamAccounts?.kick?.username || null);
      setYoutubeConnected(Boolean(streamAccounts?.youtube?.connected));
      const nextYouTubeOptions = streamAccounts?.youtube?.options || [];
      setYoutubeOptions(nextYouTubeOptions);
      const selected = streamAccounts?.youtube?.selected || nextYouTubeOptions[0]?.key || "";
      setSelectedYouTubeChannel(selected);
    }
  };
  useEffect(() => {
    void (async () => {
      try {
        const supabase = getSupabaseBrowserClient();
        const [profileResponse, { data: { user: currentUser } }] = await Promise.all([
          authedFetch("/api/me/profile"),
          supabase.auth.getUser()
        ]);
        const metadataName = deriveUsername(currentUser, member.email);
        if (profileResponse.ok) {
          const data = await profileResponse.json();
          const p = data.profile;
          setProfile(p);
          setOauthProviders(mergeProviderOptions(data.oauth_providers, currentUser));
          setDisplayName(p.display_name || metadataName);
          setAvatarUrl(p.avatar_url || "");
          setBio(p.bio || "");
          setSkillsInput((p.skills || []).join(", "));
          const streamAccounts = data.stream_accounts;
          setKickConnectedUrl(streamAccounts?.kick?.url || null);
          setKickConnectedUsername(streamAccounts?.kick?.username || null);
          setYoutubeConnected(Boolean(streamAccounts?.youtube?.connected));
          const nextYouTubeOptions = streamAccounts?.youtube?.options || [];
          setYoutubeOptions(nextYouTubeOptions);
          const selected = streamAccounts?.youtube?.selected || nextYouTubeOptions[0]?.key || "";
          setSelectedYouTubeChannel(selected);
        } else {
          setOauthProviders(mergeProviderOptions(void 0, currentUser));
          setDisplayName(metadataName);
        }
        setUser(currentUser);
      } catch {
        setError("Failed to load profile.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);
  useEffect(() => {
    if (!linkedProvider) return;
    const refreshProfileAfterLinking = async () => {
      try {
        setError("");
        await refreshLinkedState();
        const targetKey = normalizeProviderKey(linkedProvider);
        const providerLabel = oauthProviders.find(
          (p) => normalizeProviderKey(p.key) === targetKey
        )?.label || linkedProvider;
        setLinkingSuccess(`${providerLabel} account linked successfully!`);
        setTimeout(() => setLinkingSuccess(null), 4e3);
      } catch (err) {
        console.error("Failed to refresh profile after linking:", err);
      }
    };
    void refreshProfileAfterLinking();
  }, [linkedProvider, oauthProviders]);
  const handleSave = async () => {
    setSaving(true);
    setError("");
    setSaved(false);
    const trimmed = displayName.trim();
    if (trimmed && !/^[a-zA-Z0-9_-]{3,20}$/.test(trimmed)) {
      setError("Username must be 3–20 characters: letters, numbers, underscores, or hyphens only.");
      setSaving(false);
      return;
    }
    if (usernameStatus === "taken") {
      setError("That username is already taken. Please choose another.");
      setSaving(false);
      return;
    }
    const response = await authedFetch("/api/me/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        displayName: displayName.trim() || void 0,
        avatarUrl: avatarUrl.trim() || "",
        bio: bio.trim() || void 0,
        skills: skillsInput.split(",").map((s) => s.trim()).filter(Boolean),
        selectedYouTubeChannel: youtubeConnected ? selectedYouTubeChannel || null : null,
        connectedKickUsername: kickConnectedUsername || null
      })
    });
    if (response.ok) {
      const data = await response.json();
      setProfile(data.profile);
      setSaved(true);
      setTimeout(() => setSaved(false), 3e3);
    } else {
      const data = await response.json();
      setError(data.error || "Save failed.");
    }
    setSaving(false);
  };
  const linkIdentity = async (provider) => {
    const normalizedProvider = provider.trim().toLowerCase();
    if (!normalizedProvider) return;
    setLinkingProvider(provider);
    setError("");
    try {
      const supabase = getSupabaseBrowserClient();
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session?.user) {
        setError("You must be logged in to link accounts. Please sign in first.");
        setLinkingProvider(null);
        return;
      }
      const isKick = normalizedProvider === "custom:kick" || normalizedProvider === "kick";
      if (isKick) {
        const redirectTo = getClientAuthRedirectUrl("/settings?linked=custom:kick");
        console.log("[ProfileSettings] Starting Kick link. redirectTo:", redirectTo);
        let oauthUrl;
        try {
          console.log("[ProfileSettings] Calling getIdentityLinkUrl for custom:kick");
          oauthUrl = await getIdentityLinkUrl("custom:kick", redirectTo, {
            scopes: KICK_OAUTH_SCOPES,
            queryParams: KICK_OAUTH_QUERY_PARAMS
          });
          console.log("[ProfileSettings] Got OAuth URL for custom:kick:", oauthUrl.substring(0, 100));
        } catch (primaryError) {
          console.log("[ProfileSettings] custom:kick failed, trying kick:", primaryError);
          oauthUrl = await getIdentityLinkUrl("kick", redirectTo, {
            scopes: KICK_OAUTH_SCOPES,
            queryParams: KICK_OAUTH_QUERY_PARAMS
          }).catch(() => {
            throw primaryError;
          });
          console.log("[ProfileSettings] Got OAuth URL for kick:", oauthUrl.substring(0, 100));
        }
        console.log("[ProfileSettings] Opening popup");
        const popupWindow = window.open(oauthUrl, "kickOAuthPopup", "width=500,height=700,menubar=no,location=no,resizable=yes,scrollbars=yes");
        if (!popupWindow) {
          setError("Failed to open popup window. Please check your browser popup settings.");
          setLinkingProvider(null);
          return;
        }
        let pollInterval = null;
        const removePopupListener = () => {
          window.removeEventListener("message", onPopupMessage);
        };
        const onPopupMessage = (event) => {
          if (event.origin !== window.location.origin) return;
          const payload = event.data;
          console.log("[ProfileSettings] Received popup message:", { type: payload?.type, status: payload?.status, provider: payload?.provider });
          if (payload?.type !== "oauth-link-complete") return;
          removePopupListener();
          if (pollInterval) clearInterval(pollInterval);
          setLinkingProvider(null);
          void (async () => {
            try {
              if (payload.status === "error") {
                setError(payload.message || payload.error || "Kick OAuth linking failed. Please try again.");
                return;
              }
              if (payload.accessToken && payload.refreshToken) {
                const { error: setSessionError } = await supabase.auth.setSession({
                  access_token: payload.accessToken,
                  refresh_token: payload.refreshToken
                });
                if (setSessionError) {
                  setError(setSessionError.message);
                  return;
                }
              }
              await refreshLinkedState();
              setLinkingSuccess("Kick account linked successfully!");
              setTimeout(() => setLinkingSuccess(null), 4e3);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Failed to refresh linked account state.");
            }
          })();
        };
        window.addEventListener("message", onPopupMessage);
        pollInterval = setInterval(() => {
          if (popupWindow.closed) {
            console.log("[ProfileSettings] Popup closed, cleaning up");
            if (pollInterval) clearInterval(pollInterval);
            removePopupListener();
            setLinkingProvider(null);
          }
        }, 500);
      } else {
        const redirectTo = getClientAuthRedirectUrl(`/settings?linked=${normalizedProvider}`);
        const oauthUrl = await getIdentityLinkUrl(normalizedProvider, redirectTo);
        window.location.href = oauthUrl;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to initiate OAuth linking.");
      setLinkingProvider(null);
    }
  };
  const isLinked = (provider) => {
    const normalizedProvider = normalizeProviderKey(provider);
    return user?.identities?.some(
      (i) => normalizeProviderKey(String(i.provider || "")) === normalizedProvider
    ) ?? false;
  };
  const linkedIdentityProviders = Array.from(
    new Set(
      (user?.identities || []).map((identity) => normalizeProviderKey(String(identity.provider || ""))).filter(Boolean)
    )
  );
  const checkUsername = (value) => {
    if (usernameDebounceRef.current) clearTimeout(usernameDebounceRef.current);
    const trimmed = value.trim();
    if (!trimmed || trimmed.toLowerCase() === String(profile?.display_name ?? "").trim().toLowerCase()) {
      setUsernameStatus("idle");
      setUsernameMessage("");
      return;
    }
    if (!/^[a-zA-Z0-9_-]{3,20}$/.test(trimmed)) {
      setUsernameStatus("invalid");
      setUsernameMessage("3–20 characters. Letters, numbers, underscores, hyphens only.");
      return;
    }
    setUsernameStatus("checking");
    setUsernameMessage("");
    usernameDebounceRef.current = setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch(
            `/api/check-username?username=${encodeURIComponent(trimmed)}&currentEmail=${encodeURIComponent(member.email)}`
          );
          if (!res.ok) {
            setUsernameStatus("idle");
            setUsernameMessage("Could not verify availability right now.");
            return;
          }
          const data = await res.json();
          if (data.available === true) {
            setUsernameStatus("available");
            setUsernameMessage("Username is available!");
          } else {
            setUsernameStatus("taken");
            setUsernameMessage(data.reason || "Username is already taken.");
          }
        } catch {
          setUsernameStatus("idle");
          setUsernameMessage("");
        }
      })();
    }, 500);
  };
  const uploadAvatar = async (file) => {
    const maxSize = 8 * 1024 * 1024;
    const allowedTypes = /* @__PURE__ */ new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
    if (file.size > maxSize) {
      setError("Image is too large. Maximum size is 8 MB.");
      return;
    }
    if (file.type && !allowedTypes.has(file.type)) {
      setError("Unsupported image type. Use JPG, PNG, WEBP, or GIF.");
      return;
    }
    setAvatarUploading(true);
    setError("");
    setSaved(false);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const uploadResponse = await authedFetch("/api/profile-photo-upload", {
        method: "POST",
        body: formData
      });
      const uploadData = await uploadResponse.json();
      if (!uploadResponse.ok || !uploadData.url) {
        setError(uploadData.error || "Could not upload profile photo.");
        return;
      }
      const profileResponse = await authedFetch("/api/me/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatarUrl: uploadData.url })
      });
      if (!profileResponse.ok) {
        const data = await profileResponse.json();
        setError(data.error || "Photo uploaded, but profile update failed.");
        setAvatarUrl(uploadData.url);
        return;
      }
      const profileData = await profileResponse.json();
      setProfile(profileData.profile);
      setAvatarUrl(profileData.profile.avatar_url || uploadData.url);
      setSaved(true);
      setTimeout(() => setSaved(false), 3e3);
    } catch {
      setError("Could not upload profile photo.");
    } finally {
      setAvatarUploading(false);
    }
  };
  if (loading) {
    return /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 text-zinc-400", children: [
      /* @__PURE__ */ jsx(Loader2, { size: 16, className: "animate-spin" }),
      " Loading profile..."
    ] });
  }
  return /* @__PURE__ */ jsxs("div", { className: "space-y-6", children: [
    /* @__PURE__ */ jsxs("section", { className: "rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-5", children: [
      /* @__PURE__ */ jsxs("div", { className: "mb-4 flex items-center gap-2", children: [
        /* @__PURE__ */ jsx(User, { size: 16, className: "text-orange-200" }),
        /* @__PURE__ */ jsx("h2", { className: "font-bold text-zinc-100", children: "Profile" })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "grid gap-4 sm:grid-cols-2", children: [
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("label", { className: "mb-1.5 block text-xs font-medium text-zinc-400", children: "Username" }),
          /* @__PURE__ */ jsx(
            "input",
            {
              type: "text",
              value: displayName,
              onChange: (e) => {
                setDisplayName(e.target.value);
                checkUsername(e.target.value);
              },
              maxLength: 20,
              placeholder: member.email.split("@")[0].slice(0, 20),
              autoComplete: "username",
              className: `w-full rounded-lg border bg-zinc-950/60 px-3 py-2 text-sm text-zinc-100 outline-none transition ${usernameStatus === "available" ? "border-emerald-400/60 focus:border-emerald-300" : usernameStatus === "taken" || usernameStatus === "invalid" ? "border-rose-400/60 focus:border-rose-300" : "border-zinc-200/20 focus:border-orange-200/70"}`
            }
          ),
          /* @__PURE__ */ jsx("p", { className: "mt-0.5 text-xs text-zinc-500", children: "3–20 characters. Letters, numbers, _ and - only." }),
          usernameStatus === "checking" ? /* @__PURE__ */ jsx("p", { className: "mt-0.5 text-xs text-zinc-400", children: "Checking availability..." }) : usernameMessage ? /* @__PURE__ */ jsx("p", { className: `mt-0.5 text-xs ${usernameStatus === "available" ? "text-emerald-300" : "text-rose-300"}`, children: usernameMessage }) : null
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "sm:col-span-2", children: [
          /* @__PURE__ */ jsx("label", { className: "mb-1.5 block text-xs font-medium text-zinc-400", children: "Profile Photo" }),
          /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap items-center gap-3 rounded-lg border border-zinc-200/20 bg-zinc-950/40 p-3", children: [
            avatarUrl ? /* @__PURE__ */ jsx(
              "img",
              {
                src: avatarUrl,
                alt: "Avatar",
                className: "h-14 w-14 flex-shrink-0 rounded-full border border-zinc-200/20 object-cover"
              }
            ) : /* @__PURE__ */ jsx("div", { className: "flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full border border-zinc-200/20 bg-zinc-800 text-xs text-zinc-500", children: member.email.slice(0, 2).toUpperCase() }),
            /* @__PURE__ */ jsxs("div", { className: "flex-1", children: [
              /* @__PURE__ */ jsx(
                "input",
                {
                  type: "file",
                  accept: "image/jpeg,image/png,image/webp,image/gif",
                  disabled: avatarUploading,
                  onChange: (e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      void uploadAvatar(file);
                    }
                    e.currentTarget.value = "";
                  },
                  className: "block w-full text-sm text-zinc-300 file:mr-3 file:rounded-md file:border-0 file:bg-orange-300 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-zinc-950 hover:file:bg-orange-200 disabled:opacity-60"
                }
              ),
              /* @__PURE__ */ jsx("p", { className: "mt-1 text-xs text-zinc-500", children: "Upload JPG, PNG, WEBP, or GIF (max 8 MB)." }),
              avatarUploading ? /* @__PURE__ */ jsx("p", { className: "mt-1 text-xs text-zinc-400", children: "Uploading photo..." }) : null
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "sm:col-span-2", children: [
          /* @__PURE__ */ jsx("label", { className: "mb-1.5 block text-xs font-medium text-zinc-400", children: "Bio" }),
          /* @__PURE__ */ jsx(
            "textarea",
            {
              value: bio,
              onChange: (e) => setBio(e.target.value),
              rows: 3,
              maxLength: 500,
              placeholder: "Tell the community who you are and what you do...",
              className: "w-full resize-none rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-orange-200/70"
            }
          ),
          /* @__PURE__ */ jsxs("p", { className: "mt-0.5 text-right text-xs text-zinc-500", children: [
            bio.length,
            "/500"
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "sm:col-span-2", children: [
          /* @__PURE__ */ jsxs("label", { className: "mb-1.5 block text-xs font-medium text-zinc-400", children: [
            "Skills ",
            /* @__PURE__ */ jsx("span", { className: "text-zinc-500", children: "(comma-separated)" })
          ] }),
          /* @__PURE__ */ jsx(
            "input",
            {
              type: "text",
              value: skillsInput,
              onChange: (e) => setSkillsInput(e.target.value),
              placeholder: "Video editing, Mixing, Graphic design, Social media...",
              className: "w-full rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-orange-200/70"
            }
          ),
          skillsInput.trim() ? /* @__PURE__ */ jsx("div", { className: "mt-2 flex flex-wrap gap-1.5", children: skillsInput.split(",").map((s) => s.trim()).filter(Boolean).map((skill) => /* @__PURE__ */ jsx(
            "span",
            {
              className: "rounded-full border border-zinc-200/20 bg-zinc-800/60 px-2.5 py-0.5 text-xs text-zinc-300",
              children: skill
            },
            skill
          )) }) : null
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "sm:col-span-2", children: [
          /* @__PURE__ */ jsxs("label", { className: "mb-1.5 block text-xs font-medium text-zinc-400", children: [
            "Livestream Sources ",
            /* @__PURE__ */ jsx("span", { className: "text-zinc-500", children: "(from connected accounts)" })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "space-y-3 rounded-lg border border-zinc-200/20 bg-zinc-950/40 p-3", children: [
            /* @__PURE__ */ jsxs("div", { className: "rounded-lg border border-zinc-200/10 bg-zinc-900/50 p-3", children: [
              /* @__PURE__ */ jsx("p", { className: "text-xs font-semibold uppercase tracking-wide text-zinc-400", children: "Kick" }),
              kickConnectedUrl ? /* @__PURE__ */ jsxs("p", { className: "mt-1 text-sm text-zinc-200", children: [
                "Connected stream: ",
                /* @__PURE__ */ jsx("a", { href: kickConnectedUrl, target: "_blank", rel: "noreferrer", className: "text-orange-200 underline", children: kickConnectedUrl })
              ] }) : /* @__PURE__ */ jsx("p", { className: "mt-1 text-xs text-zinc-500", children: "No Kick account linked yet. Link your Kick account below to enable Kick streams." })
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "rounded-lg border border-zinc-200/10 bg-zinc-900/50 p-3", children: [
              /* @__PURE__ */ jsx("p", { className: "text-xs font-semibold uppercase tracking-wide text-zinc-400", children: "YouTube" }),
              youtubeConnected ? /* @__PURE__ */ jsxs(Fragment, { children: [
                /* @__PURE__ */ jsx("label", { className: "mt-2 block text-xs text-zinc-500", children: "Select the YouTube channel for your livestream profile" }),
                /* @__PURE__ */ jsx(
                  "select",
                  {
                    value: selectedYouTubeChannel,
                    onChange: (e) => setSelectedYouTubeChannel(e.target.value),
                    className: "mt-1 w-full rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-orange-200/70",
                    children: youtubeOptions.length === 0 ? /* @__PURE__ */ jsx("option", { value: "", children: "No channels detected from your Google connection" }) : youtubeOptions.map((option) => /* @__PURE__ */ jsx("option", { value: option.key, children: option.label }, option.key))
                  }
                ),
                youtubeOptions.find((option) => option.key === selectedYouTubeChannel)?.url ? /* @__PURE__ */ jsxs("p", { className: "mt-1 text-xs text-zinc-500", children: [
                  "Selected URL: ",
                  youtubeOptions.find((option) => option.key === selectedYouTubeChannel)?.url
                ] }) : null
              ] }) : /* @__PURE__ */ jsx("p", { className: "mt-1 text-xs text-zinc-500", children: "No Google account linked yet. Link Google below to select a YouTube channel." })
            ] }),
            /* @__PURE__ */ jsx("p", { className: "text-xs text-zinc-500", children: "Twitch will appear here automatically once you add the Twitch OAuth connection in Supabase." })
          ] })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("section", { className: "rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-5", children: [
      /* @__PURE__ */ jsxs("div", { className: "mb-1 flex items-center gap-2", children: [
        /* @__PURE__ */ jsx(Link2, { size: 16, className: "text-orange-200" }),
        /* @__PURE__ */ jsx("h2", { className: "font-bold text-zinc-100", children: "Linked Accounts" })
      ] }),
      /* @__PURE__ */ jsx("p", { className: "mb-4 text-xs text-zinc-500", children: "Link your OAuth accounts to enable single sign-on and verify your identities." }),
      /* @__PURE__ */ jsxs("div", { className: "space-y-2", children: [
        oauthProviders.map(({ key, label, description }) => {
          const linked = isLinked(key);
          return /* @__PURE__ */ jsxs(
            "div",
            {
              className: "flex items-center justify-between rounded-xl border border-zinc-200/10 bg-zinc-800/40 px-4 py-3",
              children: [
                /* @__PURE__ */ jsxs("div", { children: [
                  /* @__PURE__ */ jsx("p", { className: "text-sm font-semibold text-zinc-100", children: label }),
                  /* @__PURE__ */ jsx("p", { className: "text-xs text-zinc-500", children: description })
                ] }),
                linked ? /* @__PURE__ */ jsxs("span", { className: "flex items-center gap-1.5 rounded-full border border-emerald-300/40 bg-emerald-300/5 px-3 py-1 text-xs font-semibold text-emerald-300", children: [
                  /* @__PURE__ */ jsx(Check, { size: 11 }),
                  " Linked"
                ] }) : /* @__PURE__ */ jsxs(
                  "button",
                  {
                    type: "button",
                    disabled: linkingProvider !== null,
                    onClick: () => {
                      void linkIdentity(key);
                    },
                    className: "inline-flex items-center gap-1.5 rounded-lg border border-zinc-200/25 px-3 py-1.5 text-xs font-semibold text-zinc-200 transition hover:border-orange-200/50 hover:text-orange-100 disabled:opacity-60",
                    children: [
                      linkingProvider === key ? /* @__PURE__ */ jsx(Loader2, { size: 11, className: "animate-spin" }) : /* @__PURE__ */ jsx(Link2, { size: 11 }),
                      linkingProvider === key ? "Connecting..." : "Link"
                    ]
                  }
                )
              ]
            },
            key
          );
        }),
        linkedIdentityProviders.length > 0 ? /* @__PURE__ */ jsxs("div", { className: "rounded-xl border border-zinc-200/10 bg-zinc-800/30 px-4 py-3", children: [
          /* @__PURE__ */ jsx("p", { className: "text-xs font-semibold uppercase tracking-wide text-zinc-400", children: "Currently linked via Supabase" }),
          /* @__PURE__ */ jsx("p", { className: "mt-1 text-xs text-zinc-500", children: linkedIdentityProviders.join(", ") })
        ] }) : null
      ] })
    ] }),
    error ? /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 rounded-xl border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200", children: [
      /* @__PURE__ */ jsx(AlertCircle, { size: 16 }),
      " ",
      error
    ] }) : null,
    linkingSuccess ? /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200", children: [
      /* @__PURE__ */ jsx(Check, { size: 16 }),
      " ",
      linkingSuccess
    ] }) : null,
    saved ? /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200", children: [
      /* @__PURE__ */ jsx(Check, { size: 16 }),
      " Profile saved successfully!"
    ] }) : null,
    /* @__PURE__ */ jsxs(
      "button",
      {
        type: "button",
        onClick: () => {
          void handleSave();
        },
        disabled: saving,
        className: "inline-flex items-center gap-2 rounded-lg bg-orange-300 px-5 py-2.5 font-semibold text-zinc-950 transition hover:bg-orange-200 disabled:opacity-70",
        children: [
          saving ? /* @__PURE__ */ jsx(Loader2, { size: 16, className: "animate-spin" }) : /* @__PURE__ */ jsx(Save, { size: 16 }),
          saving ? "Saving..." : "Save Profile"
        ]
      }
    ),
    profile?.updated_at ? /* @__PURE__ */ jsxs("p", { className: "text-xs text-zinc-500", children: [
      "Last updated ",
      new Date(profile.updated_at).toLocaleString()
    ] }) : null
  ] });
}
const fallbackMembershipPlans = [{
  id: "fallback-free",
  slug: "free",
  name: "FREE",
  display_price: "$0",
  description: "Very limited access for basic account setup and browsing.",
  features: ["Log in and account access", "Connect social/OAuth accounts", "Browse public sections"]
}];
function getSettingsUsername(member) {
  const username = String(member?.user_metadata?.username || "").trim();
  const preferred = String(member?.user_metadata?.preferred_username || "").trim();
  const fromEmail = String(member?.email || "").split("@")[0].trim();
  return username || preferred || fromEmail || "Member";
}
function SettingsPage() {
  const [member, setMember] = useState(null);
  const [memberAvatarUrl, setMemberAvatarUrl] = useState(null);
  const [role, setRole] = useState("user");
  const [plans, setPlans] = useState(fallbackMembershipPlans);
  const [plansLoading, setPlansLoading] = useState(true);
  const [upgradingPlan, setUpgradingPlan] = useState(null);
  const [subscriptionError, setSubscriptionError] = useState("");
  const [loading, setLoading] = useState(true);
  const linkedProvider = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("linked") : null;
  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const supabase = getSupabaseBrowserClient();
        const {
          data
        } = await supabase.auth.getSession();
        if (!mounted) return;
        setMember(data.session?.user ?? null);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);
  useEffect(() => {
    if (!member) return;
    void (async () => {
      try {
        const response = await authedFetch("/api/me/profile");
        if (!response.ok) return;
        const data = await response.json();
        setMemberAvatarUrl(data.profile?.avatar_url || null);
      } catch {
      }
    })();
  }, [member]);
  useEffect(() => {
    if (!member) return;
    void (async () => {
      try {
        const response = await authedFetch("/api/me/access");
        if (!response.ok) return;
        const access = await response.json();
        setRole(access.role || "user");
      } catch {
      }
    })();
  }, [member]);
  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/shop");
        if (!response.ok) return;
        const data = await response.json();
        if (data.membershipPlans?.length) {
          setPlans(data.membershipPlans);
        }
      } catch {
      } finally {
        setPlansLoading(false);
      }
    })();
  }, []);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (!params.get("linked")) return;
    window.history.replaceState({}, "", window.location.pathname);
  }, []);
  const updateMembership = async (plan) => {
    const email = String(member?.email || "").trim().toLowerCase();
    if (!email) {
      setSubscriptionError("Missing account email. Please refresh and try again.");
      return;
    }
    try {
      setUpgradingPlan(plan.slug);
      setSubscriptionError("");
      const response = await authedFetch("/api/create-payment-intent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          planSlug: plan.slug,
          email,
          name: getSettingsUsername(member)
        })
      });
      const data = await response.json();
      if (!response.ok || data.error) {
        setSubscriptionError(data.error || "Could not update your subscription right now.");
        return;
      }
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
        return;
      }
      if (data.successUrl) {
        window.location.href = data.successUrl;
        return;
      }
      if (data.updated || data.free) {
        window.location.reload();
      }
    } catch {
      setSubscriptionError("Could not update your subscription right now.");
    } finally {
      setUpgradingPlan(null);
    }
  };
  if (loading || !member) {
    return /* @__PURE__ */ jsx("div", { className: "min-h-screen px-4 py-24 text-zinc-100", children: /* @__PURE__ */ jsxs("div", { className: "mx-auto max-w-4xl rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-8 text-center", children: [
      /* @__PURE__ */ jsx("p", { className: "text-sm uppercase tracking-[0.2em] text-zinc-400", children: "Loading settings" }),
      /* @__PURE__ */ jsx("h1", { className: "mt-4 text-3xl font-bold text-zinc-50", children: "Preparing your profile..." })
    ] }) });
  }
  return /* @__PURE__ */ jsx("div", { className: "min-h-screen px-4 py-12 text-zinc-100", children: /* @__PURE__ */ jsxs("div", { className: "mx-auto max-w-6xl space-y-6", children: [
    /* @__PURE__ */ jsx("header", { className: "rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-6 md:p-8", children: /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap items-start justify-between gap-4", children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("p", { className: "text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400", children: "Account Settings" }),
        /* @__PURE__ */ jsx("h1", { className: "mt-2 text-3xl font-black text-zinc-50 md:text-4xl", children: "Manage your workspace profile" }),
        /* @__PURE__ */ jsx("p", { className: "mt-3 max-w-2xl text-zinc-300", children: "Update your username, linked stream accounts, and membership preferences from one place." })
      ] }),
      /* @__PURE__ */ jsxs(Link, { to: "/dashboard", className: "inline-flex items-center gap-2 rounded-lg border border-zinc-100/25 px-4 py-2 text-sm font-semibold text-zinc-100 transition hover:border-orange-200/70 hover:text-orange-100", children: [
        /* @__PURE__ */ jsx(ArrowLeft, { size: 16 }),
        "Back to Dashboard"
      ] })
    ] }) }),
    /* @__PURE__ */ jsx(ProfileSettings, { member: {
      email: member.email || ""
    }, linkedProvider }),
    /* @__PURE__ */ jsxs("div", { className: "grid gap-6 md:grid-cols-2", children: [
      /* @__PURE__ */ jsxs("article", { className: "rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-6", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3", children: [
          /* @__PURE__ */ jsx("div", { className: "inline-flex rounded-md border border-zinc-200/20 bg-zinc-950/70 p-2 text-orange-200", children: /* @__PURE__ */ jsx(CreditCard, { size: 18 }) }),
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("h2", { className: "text-lg font-bold text-zinc-50", children: "Subscription" }),
            /* @__PURE__ */ jsx("p", { className: "text-xs text-zinc-400", children: "Manage your membership plan" })
          ] })
        ] }),
        plansLoading ? /* @__PURE__ */ jsx("p", { className: "mt-4 text-sm text-zinc-400", children: "Loading plans..." }) : /* @__PURE__ */ jsx("div", { className: "mt-4 space-y-2", children: plans.map((plan) => {
          const isCurrent = member.user_metadata?.membership_plan === plan.slug || plan.slug === "free" && !member.user_metadata?.membership_plan;
          return /* @__PURE__ */ jsxs("div", { className: `rounded-xl border p-4 transition ${isCurrent ? "border-orange-200/60 bg-orange-200/10" : "border-zinc-200/15 bg-zinc-950/40"}`, children: [
            /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between gap-3", children: [
              /* @__PURE__ */ jsxs("div", { className: "min-w-0", children: [
                /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
                  /* @__PURE__ */ jsx("p", { className: "font-semibold text-zinc-50", children: plan.name }),
                  isCurrent ? /* @__PURE__ */ jsx("span", { className: "rounded-full bg-orange-300 px-2 py-0.5 text-xs font-bold text-zinc-950", children: "Current" }) : null
                ] }),
                /* @__PURE__ */ jsx("p", { className: "text-sm font-black text-orange-200", children: plan.display_price }),
                /* @__PURE__ */ jsx("p", { className: "mt-0.5 text-xs text-zinc-400", children: plan.description })
              ] }),
              !isCurrent ? /* @__PURE__ */ jsx("button", { type: "button", onClick: () => {
                void updateMembership(plan);
              }, disabled: Boolean(upgradingPlan), className: "flex-shrink-0 rounded-lg border border-zinc-100/25 px-3 py-1.5 text-xs font-semibold text-zinc-300 transition hover:border-orange-200/70 hover:text-orange-100 disabled:cursor-not-allowed disabled:opacity-60", children: upgradingPlan === plan.slug ? "Processing..." : plan.slug === "free" ? "Downgrade" : "Choose Plan" }) : null
            ] }),
            plan.features.length > 0 ? /* @__PURE__ */ jsx("ul", { className: "mt-2 flex flex-wrap gap-x-3 gap-y-0.5", children: plan.features.map((feature) => /* @__PURE__ */ jsxs("li", { className: "flex items-center gap-1 text-xs text-zinc-400", children: [
              /* @__PURE__ */ jsx("span", { className: "text-orange-300", children: "*" }),
              " ",
              feature
            ] }, feature)) }) : null
          ] }, plan.slug);
        }) }),
        subscriptionError ? /* @__PURE__ */ jsx("p", { className: "mt-3 rounded-lg border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200", children: subscriptionError }) : null
      ] }),
      /* @__PURE__ */ jsxs("article", { className: "rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-6", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3", children: [
          /* @__PURE__ */ jsx("div", { className: "inline-flex rounded-md border border-zinc-200/20 bg-zinc-950/70 p-2 text-orange-200", children: /* @__PURE__ */ jsx(Settings, { size: 18 }) }),
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("h2", { className: "text-lg font-bold text-zinc-50", children: "Account" }),
            /* @__PURE__ */ jsx("p", { className: "text-xs text-zinc-400", children: "Your profile and sign-in details" })
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "mt-4 rounded-xl border border-zinc-200/15 bg-zinc-950/60 p-4 space-y-2", children: [
          memberAvatarUrl ? /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3", children: [
            /* @__PURE__ */ jsx("img", { src: memberAvatarUrl, alt: getSettingsUsername(member), className: "h-12 w-12 rounded-full border border-zinc-200/20 object-cover" }),
            /* @__PURE__ */ jsx("p", { className: "text-xs text-zinc-500", children: "Profile photo is managed in your settings above." })
          ] }) : null,
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("p", { className: "text-xs font-medium text-zinc-400", children: "Email" }),
            /* @__PURE__ */ jsx("p", { className: "mt-0.5 text-sm text-zinc-100", children: member.email || "—" })
          ] }),
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("p", { className: "text-xs font-medium text-zinc-400", children: "Username" }),
            /* @__PURE__ */ jsx("p", { className: "mt-0.5 text-sm text-zinc-100", children: getSettingsUsername(member) })
          ] }),
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("p", { className: "text-xs font-medium text-zinc-400", children: "Role" }),
            /* @__PURE__ */ jsx("p", { className: "mt-0.5 text-sm text-zinc-100", children: formatRoleLabel(role) })
          ] })
        ] }),
        /* @__PURE__ */ jsx("p", { className: "mt-4 text-xs text-zinc-500", children: "To update your email or password, contact an admin or use the password reset flow." })
      ] })
    ] })
  ] }) });
}
export {
  SettingsPage as component
};
