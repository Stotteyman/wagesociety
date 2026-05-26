import { jsx, jsxs } from "react/jsx-runtime";
import { useNavigate } from "@tanstack/react-router";
import { Loader2, UserRound, Sparkles } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { g as getSupabaseBrowserClient, c as authedFetch } from "./router-CSiXPOJe.js";
import "@supabase/supabase-js";
import "stripe";
import "node:fs/promises";
import "node:path";
import "zod";
import "node:crypto";
const USERNAME_REGEX = /^[a-zA-Z0-9_-]{3,20}$/;
function OnboardingPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [bio, setBio] = useState("");
  const [skillsInput, setSkillsInput] = useState("");
  const [usernameStatus, setUsernameStatus] = useState("idle");
  const [usernameMessage, setUsernameMessage] = useState("");
  const [upgradingPlan, setUpgradingPlan] = useState(null);
  const [plans, setPlans] = useState([]);
  const usernameDebounceRef = useRef(null);
  useEffect(() => {
    void (async () => {
      try {
        const supabase = getSupabaseBrowserClient();
        const {
          data: {
            user
          }
        } = await supabase.auth.getUser();
        if (!user?.email) {
          void navigate({
            to: "/login"
          });
          return;
        }
        const meta = user.user_metadata || {};
        if (meta.onboarding_completed === true) {
          void navigate({
            to: "/dashboard"
          });
          return;
        }
        if (!meta.membership_plan) {
          await supabase.auth.updateUser({
            data: {
              ...meta,
              membership_plan: "free",
              onboarding_completed: false
            }
          });
        }
        setEmail(user.email);
        const seedName = String(meta.username || "").trim() || String(meta.preferred_username || "").trim() || user.email.split("@")[0] || "";
        setDisplayName(seedName);
        const [profileResponse, plansResponse] = await Promise.all([authedFetch("/api/me/profile"), fetch("/api/shop")]);
        if (profileResponse.ok) {
          const profileData = await profileResponse.json();
          const profile = profileData.profile;
          if (profile) {
            setDisplayName(profile.display_name || seedName);
            setAvatarUrl(profile.avatar_url || "");
            setBio(profile.bio || "");
            setSkillsInput((profile.skills || []).join(", "));
          }
        }
        if (plansResponse.ok) {
          const plansData = await plansResponse.json();
          setPlans((plansData.membershipPlans || []).filter((plan) => plan.slug !== "free"));
        }
      } catch {
        setError("Could not load onboarding. Please refresh and try again.");
      } finally {
        setLoading(false);
      }
    })();
  }, [navigate]);
  const checkUsername = (value) => {
    if (usernameDebounceRef.current) clearTimeout(usernameDebounceRef.current);
    const trimmed = value.trim();
    if (!trimmed) {
      setUsernameStatus("idle");
      setUsernameMessage("");
      return;
    }
    if (!USERNAME_REGEX.test(trimmed)) {
      setUsernameStatus("invalid");
      setUsernameMessage("3–20 characters. Letters, numbers, underscores, hyphens only.");
      return;
    }
    setUsernameStatus("checking");
    setUsernameMessage("");
    usernameDebounceRef.current = setTimeout(() => {
      void (async () => {
        try {
          const response = await fetch(`/api/check-username?username=${encodeURIComponent(trimmed)}&currentEmail=${encodeURIComponent(email)}`);
          if (!response.ok) {
            setUsernameStatus("idle");
            setUsernameMessage("Could not verify availability right now.");
            return;
          }
          const data = await response.json();
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
    }, 400);
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
      setAvatarUrl(uploadData.url);
    } catch {
      setError("Could not upload profile photo.");
    } finally {
      setAvatarUploading(false);
    }
  };
  const ensureUsernameAvailable = async () => {
    const trimmed = displayName.trim();
    if (!trimmed) return false;
    if (!USERNAME_REGEX.test(trimmed)) return false;
    const response = await fetch(`/api/check-username?username=${encodeURIComponent(trimmed)}&currentEmail=${encodeURIComponent(email)}`);
    if (!response.ok) {
      return true;
    }
    const data = await response.json();
    if (!data.available) {
      setError(data.reason || "That username is already taken. Please choose another.");
      return false;
    }
    return true;
  };
  const finishOnboarding = async () => {
    setSaving(true);
    setError("");
    try {
      const trimmedName = displayName.trim();
      if (!trimmedName) {
        setError("Username is required.");
        return;
      }
      if (!USERNAME_REGEX.test(trimmedName)) {
        setError("Username must be 3–20 characters with letters, numbers, underscores, or hyphens.");
        return;
      }
      if (!await ensureUsernameAvailable()) {
        return;
      }
      const profileResponse = await authedFetch("/api/me/profile", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          displayName: trimmedName,
          avatarUrl: avatarUrl.trim() || "",
          bio: bio.trim() || void 0,
          skills: skillsInput.split(",").map((item) => item.trim()).filter(Boolean)
        })
      });
      const profileData = await profileResponse.json();
      if (!profileResponse.ok) {
        setError(profileData.error || "Could not save profile. Please try again.");
        return;
      }
      const supabase = getSupabaseBrowserClient();
      const {
        data: {
          user
        }
      } = await supabase.auth.getUser();
      if (user) {
        const meta = user.user_metadata || {};
        const {
          error: updateError
        } = await supabase.auth.updateUser({
          data: {
            ...meta,
            username: trimmedName,
            preferred_username: trimmedName,
            membership_plan: String(meta.membership_plan || "free"),
            onboarding_completed: true
          }
        });
        if (updateError) {
          setError(updateError.message);
          return;
        }
      }
      await navigate({
        to: "/dashboard"
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not complete onboarding.");
    } finally {
      setSaving(false);
    }
  };
  const upgradeNow = async (plan) => {
    try {
      setUpgradingPlan(plan.slug);
      setError("");
      const response = await authedFetch("/api/create-payment-intent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          planSlug: plan.slug,
          email,
          name: displayName.trim() || void 0
        })
      });
      const data = await response.json();
      if (!response.ok || data.error) {
        setError(data.error || "Could not start upgrade checkout.");
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
        await navigate({
          to: "/dashboard"
        });
      }
    } catch {
      setError("Could not start upgrade checkout.");
    } finally {
      setUpgradingPlan(null);
    }
  };
  if (loading) {
    return /* @__PURE__ */ jsx("main", { className: "min-h-screen px-4 py-14 text-zinc-100", children: /* @__PURE__ */ jsx("div", { className: "mx-auto max-w-4xl rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-8", children: /* @__PURE__ */ jsxs("p", { className: "inline-flex items-center gap-2 text-sm text-zinc-300", children: [
      /* @__PURE__ */ jsx(Loader2, { size: 15, className: "animate-spin" }),
      " Preparing onboarding..."
    ] }) }) });
  }
  return /* @__PURE__ */ jsx("main", { className: "min-h-screen px-4 py-10 text-zinc-100", children: /* @__PURE__ */ jsxs("div", { className: "mx-auto max-w-5xl space-y-6", children: [
    /* @__PURE__ */ jsxs("section", { className: "rounded-3xl border border-zinc-200/15 bg-zinc-900/60 p-6 md:p-8", children: [
      /* @__PURE__ */ jsx("p", { className: "text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500", children: "Welcome to W.A.G.E." }),
      /* @__PURE__ */ jsx("h1", { className: "mt-2 text-3xl font-black text-zinc-50", children: "Set up your account" }),
      /* @__PURE__ */ jsx("p", { className: "mt-2 text-sm text-zinc-300", children: "Your account starts on the FREE plan. Finish username and profile setup now, then optionally upgrade." })
    ] }),
    /* @__PURE__ */ jsxs("section", { className: "rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-6", children: [
      /* @__PURE__ */ jsx("h2", { className: "text-xl font-bold text-zinc-50", children: "1. Choose your username + profile" }),
      /* @__PURE__ */ jsxs("div", { className: "mt-4 grid gap-4 sm:grid-cols-2", children: [
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("label", { className: "mb-1.5 block text-xs font-medium text-zinc-400", children: "Username" }),
          /* @__PURE__ */ jsx("input", { type: "text", value: displayName, onChange: (event) => {
            setDisplayName(event.target.value);
            checkUsername(event.target.value);
          }, maxLength: 20, autoComplete: "username", className: `w-full rounded-lg border bg-zinc-950/60 px-3 py-2 text-sm text-zinc-100 outline-none transition ${usernameStatus === "available" ? "border-emerald-400/60 focus:border-emerald-300" : usernameStatus === "taken" || usernameStatus === "invalid" ? "border-rose-400/60 focus:border-rose-300" : "border-zinc-200/20 focus:border-orange-200/70"}`, placeholder: "your_username" }),
          usernameStatus === "checking" ? /* @__PURE__ */ jsx("p", { className: "mt-1 text-xs text-zinc-400", children: "Checking availability..." }) : usernameMessage ? /* @__PURE__ */ jsx("p", { className: `mt-1 text-xs ${usernameStatus === "available" ? "text-emerald-300" : "text-rose-300"}`, children: usernameMessage }) : /* @__PURE__ */ jsx("p", { className: "mt-1 text-xs text-zinc-500", children: "3–20 characters. Letters, numbers, underscores, hyphens." })
        ] }),
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("label", { className: "mb-1.5 block text-xs font-medium text-zinc-400", children: "Profile Photo (optional)" }),
          /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap items-center gap-3 rounded-lg border border-zinc-200/20 bg-zinc-950/40 p-3", children: [
            avatarUrl ? /* @__PURE__ */ jsx("img", { src: avatarUrl, alt: "Avatar", className: "h-14 w-14 flex-shrink-0 rounded-full border border-zinc-200/20 object-cover" }) : /* @__PURE__ */ jsx("div", { className: "flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full border border-zinc-200/20 bg-zinc-800 text-zinc-400", children: /* @__PURE__ */ jsx(UserRound, { size: 18 }) }),
            /* @__PURE__ */ jsxs("div", { className: "flex-1", children: [
              /* @__PURE__ */ jsx("input", { type: "file", accept: "image/jpeg,image/png,image/webp,image/gif", disabled: avatarUploading, onChange: (event) => {
                const file = event.target.files?.[0];
                if (file) void uploadAvatar(file);
                event.currentTarget.value = "";
              }, className: "block w-full text-sm text-zinc-300 file:mr-3 file:rounded-md file:border-0 file:bg-orange-300 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-zinc-950 hover:file:bg-orange-200 disabled:opacity-60" }),
              /* @__PURE__ */ jsx("p", { className: "mt-1 text-xs text-zinc-500", children: "Upload JPG, PNG, WEBP, or GIF (max 8 MB)." }),
              avatarUploading ? /* @__PURE__ */ jsx("p", { className: "mt-1 text-xs text-zinc-400", children: "Uploading photo..." }) : null
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "sm:col-span-2", children: [
          /* @__PURE__ */ jsx("label", { className: "mb-1.5 block text-xs font-medium text-zinc-400", children: "Bio (optional)" }),
          /* @__PURE__ */ jsx("textarea", { value: bio, onChange: (event) => setBio(event.target.value), rows: 3, maxLength: 500, className: "w-full resize-none rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-orange-200/70", placeholder: "Tell members what you create and what you're building." })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "sm:col-span-2", children: [
          /* @__PURE__ */ jsx("label", { className: "mb-1.5 block text-xs font-medium text-zinc-400", children: "Skills (optional)" }),
          /* @__PURE__ */ jsx("input", { type: "text", value: skillsInput, onChange: (event) => setSkillsInput(event.target.value), className: "w-full rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-orange-200/70", placeholder: "Video editing, Marketing, Live production" })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("section", { className: "rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-6", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsx(Sparkles, { size: 16, className: "text-orange-200" }),
        /* @__PURE__ */ jsx("h2", { className: "text-xl font-bold text-zinc-50", children: "2. Upgrade now (optional)" })
      ] }),
      /* @__PURE__ */ jsx("p", { className: "mt-2 text-sm text-zinc-300", children: "You're currently on FREE. Upgrade now or finish onboarding and upgrade later from your dashboard." }),
      plans.length > 0 ? /* @__PURE__ */ jsx("div", { className: "mt-4 grid gap-3 md:grid-cols-2", children: plans.map((plan) => /* @__PURE__ */ jsxs("article", { className: "rounded-xl border border-zinc-200/15 bg-zinc-950/40 p-4", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between gap-2", children: [
          /* @__PURE__ */ jsx("h3", { className: "text-base font-semibold text-zinc-100", children: plan.name }),
          /* @__PURE__ */ jsx("p", { className: "text-sm font-bold text-orange-200", children: plan.display_price })
        ] }),
        /* @__PURE__ */ jsx("p", { className: "mt-2 text-xs text-zinc-400", children: plan.description }),
        /* @__PURE__ */ jsx("button", { type: "button", onClick: () => {
          void upgradeNow(plan);
        }, disabled: upgradingPlan !== null, className: "mt-3 rounded-lg border border-zinc-100/25 px-3 py-1.5 text-xs font-semibold text-zinc-100 transition hover:border-orange-200/70 disabled:opacity-60", children: upgradingPlan === plan.slug ? "Starting..." : `Upgrade to ${plan.name}` })
      ] }, plan.id)) }) : /* @__PURE__ */ jsx("p", { className: "mt-3 text-sm text-zinc-500", children: "Upgrade plans are unavailable right now. You can continue with FREE and upgrade later." })
    ] }),
    error ? /* @__PURE__ */ jsx("p", { className: "rounded-xl border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200", children: error }) : null,
    /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap gap-3", children: [
      /* @__PURE__ */ jsx("button", { type: "button", onClick: () => {
        void finishOnboarding();
      }, disabled: saving, className: "rounded-lg bg-orange-300 px-5 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-orange-200 disabled:opacity-70", children: saving ? "Saving..." : "Finish Onboarding" }),
      /* @__PURE__ */ jsx("button", { type: "button", onClick: () => {
        void finishOnboarding();
      }, className: "rounded-lg border border-zinc-100/25 px-5 py-2.5 text-sm font-semibold text-zinc-100 transition hover:border-orange-200/70", children: "Continue with FREE for now" })
    ] })
  ] }) });
}
export {
  OnboardingPage as component
};
