import { jsx, jsxs, Fragment } from "react/jsx-runtime";
import { Link } from "@tanstack/react-router";
import { Loader2, UserRound, ExternalLink } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { R as Route, g as getSupabaseBrowserClient } from "./router-CSiXPOJe.js";
import "@supabase/supabase-js";
import "stripe";
import "node:fs/promises";
import "node:path";
import "zod";
import "node:crypto";
function PublicProfilePage() {
  const {
    username
  } = Route.useParams();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState("");
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  useEffect(() => {
    let mounted = true;
    void (async () => {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/public-profile?username=${encodeURIComponent(username)}`);
        const data = await response.json();
        if (!response.ok || !data.profile) {
          if (!mounted) return;
          setProfile(null);
          setError(data.error || "Profile not found.");
          return;
        }
        if (!mounted) return;
        setProfile(data.profile);
      } catch {
        if (!mounted) return;
        setProfile(null);
        setError("Could not load profile right now.");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [username]);
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    const checkAuth = async () => {
      try {
        const {
          data
        } = await supabase.auth.getSession();
        setUser(data.session?.user || null);
      } catch {
        setUser(null);
      } finally {
        setAuthLoading(false);
      }
    };
    void checkAuth();
    const {
      data: {
        subscription
      }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
      setAuthLoading(false);
    });
    return () => {
      subscription.unsubscribe();
    };
  }, []);
  const connectedCount = useMemo(() => profile?.connectedAccounts.length || 0, [profile?.connectedAccounts]);
  if (loading) {
    return /* @__PURE__ */ jsx("main", { className: "min-h-screen px-4 py-16 text-zinc-100", children: /* @__PURE__ */ jsx("div", { className: "mx-auto max-w-4xl rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-8", children: /* @__PURE__ */ jsxs("p", { className: "inline-flex items-center gap-2 text-sm text-zinc-300", children: [
      /* @__PURE__ */ jsx(Loader2, { size: 14, className: "animate-spin" }),
      " Loading creator profile..."
    ] }) }) });
  }
  if (!profile) {
    return /* @__PURE__ */ jsx("main", { className: "min-h-screen px-4 py-16 text-zinc-100", children: /* @__PURE__ */ jsxs("div", { className: "mx-auto max-w-3xl rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-8 text-center", children: [
      /* @__PURE__ */ jsx("h1", { className: "text-3xl font-black text-zinc-50", children: "Profile Not Found" }),
      /* @__PURE__ */ jsx("p", { className: "mt-3 text-sm text-zinc-300", children: error || "This profile may not exist yet." }),
      /* @__PURE__ */ jsxs("div", { className: "mt-6 flex justify-center gap-3", children: [
        /* @__PURE__ */ jsx(Link, { to: "/", className: "rounded-lg border border-zinc-100/25 px-4 py-2 text-sm font-semibold text-zinc-100 transition hover:border-orange-200/70", children: "Home" }),
        !authLoading && (user ? /* @__PURE__ */ jsx(Link, { to: "/dashboard", className: "rounded-lg bg-orange-300 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-orange-200", children: "Dashboard" }) : /* @__PURE__ */ jsx(Link, { to: "/signup", className: "rounded-lg bg-orange-300 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-orange-200", children: "Join W.A.G.E." }))
      ] })
    ] }) });
  }
  return /* @__PURE__ */ jsx("main", { className: "min-h-screen px-4 py-10 text-zinc-100", children: /* @__PURE__ */ jsx("div", { className: "mx-auto max-w-5xl", children: /* @__PURE__ */ jsxs("section", { className: "rounded-3xl border border-zinc-200/15 bg-zinc-900/60 p-6 md:p-8", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex flex-col gap-6 md:flex-row md:items-start md:justify-between", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex items-start gap-4", children: [
        profile.avatarUrl ? /* @__PURE__ */ jsx("img", { src: profile.avatarUrl, alt: `${profile.displayName} avatar`, className: "h-20 w-20 rounded-full border border-zinc-200/20 object-cover" }) : /* @__PURE__ */ jsx("div", { className: "flex h-20 w-20 items-center justify-center rounded-full border border-zinc-200/20 bg-zinc-800", children: /* @__PURE__ */ jsx(UserRound, { size: 26, className: "text-zinc-400" }) }),
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("p", { className: "text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500", children: "Creator Profile" }),
          /* @__PURE__ */ jsx("h1", { className: "mt-1 text-3xl font-black text-zinc-50", children: profile.displayName }),
          /* @__PURE__ */ jsxs("p", { className: "mt-1 text-sm text-orange-200", children: [
            "@",
            profile.username
          ] }),
          /* @__PURE__ */ jsxs("p", { className: "mt-2 text-sm text-zinc-300", children: [
            "Connected Accounts: ",
            /* @__PURE__ */ jsx("span", { className: "font-semibold text-zinc-100", children: connectedCount })
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "flex flex-wrap gap-2", children: !authLoading && (user ? /* @__PURE__ */ jsx(Link, { to: "/dashboard", className: "rounded-lg bg-orange-300 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-orange-200", children: "Dashboard" }) : /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx(Link, { to: "/signup", className: "rounded-lg bg-orange-300 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-orange-200", children: "Join / Connect" }),
        /* @__PURE__ */ jsx(Link, { to: "/login", className: "rounded-lg border border-zinc-100/25 px-4 py-2 text-sm font-semibold text-zinc-100 transition hover:border-orange-200/70", children: "Log In" })
      ] })) })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "mt-6 grid gap-6 md:grid-cols-[1.15fr_0.85fr]", children: [
      /* @__PURE__ */ jsxs("article", { className: "rounded-2xl border border-zinc-200/15 bg-zinc-950/50 p-5", children: [
        /* @__PURE__ */ jsx("h2", { className: "text-lg font-bold text-zinc-50", children: "Bio" }),
        /* @__PURE__ */ jsx("p", { className: "mt-2 whitespace-pre-line text-sm leading-relaxed text-zinc-300", children: profile.bio || "This creator has not added a bio yet." }),
        /* @__PURE__ */ jsx("h3", { className: "mt-6 text-sm font-semibold uppercase tracking-[0.16em] text-zinc-400", children: "Skills" }),
        profile.skills.length ? /* @__PURE__ */ jsx("div", { className: "mt-3 flex flex-wrap gap-2", children: profile.skills.map((skill) => /* @__PURE__ */ jsx("span", { className: "rounded-full border border-zinc-200/20 bg-zinc-900 px-3 py-1 text-xs text-zinc-200", children: skill }, skill)) }) : /* @__PURE__ */ jsx("p", { className: "mt-2 text-sm text-zinc-500", children: "No skills listed yet." })
      ] }),
      /* @__PURE__ */ jsxs("article", { className: "rounded-2xl border border-zinc-200/15 bg-zinc-950/50 p-5", children: [
        /* @__PURE__ */ jsx("h2", { className: "text-lg font-bold text-zinc-50", children: "Connected Accounts" }),
        profile.connectedAccounts.length ? /* @__PURE__ */ jsx("ul", { className: "mt-3 space-y-2", children: profile.connectedAccounts.map((account) => /* @__PURE__ */ jsx("li", { className: "rounded-xl border border-zinc-200/15 bg-zinc-900/70 p-3", children: /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between gap-3", children: [
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("p", { className: "text-sm font-semibold text-zinc-100", children: account.providerLabel }),
            /* @__PURE__ */ jsx("p", { className: "text-xs text-zinc-400", children: account.handle ? `@${account.handle.replace(/^@/, "")}` : "Connected" })
          ] }),
          account.url ? /* @__PURE__ */ jsxs("a", { href: account.url, target: "_blank", rel: "noopener noreferrer", className: "inline-flex items-center gap-1 rounded-lg border border-zinc-100/20 px-2.5 py-1 text-xs font-semibold text-zinc-100 transition hover:border-orange-200/70 hover:text-orange-100", children: [
            "Open ",
            /* @__PURE__ */ jsx(ExternalLink, { size: 12 })
          ] }) : /* @__PURE__ */ jsx("span", { className: "text-xs text-zinc-500", children: "No public URL" })
        ] }) }, `${account.provider}-${account.handle || account.providerLabel}`)) }) : /* @__PURE__ */ jsx("p", { className: "mt-2 text-sm text-zinc-500", children: "No connected accounts are public yet." })
      ] })
    ] })
  ] }) }) });
}
export {
  PublicProfilePage as component
};
