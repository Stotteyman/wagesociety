import { jsx, jsxs } from "react/jsx-runtime";
import { Link } from "@tanstack/react-router";
import { Users, Search, Loader2, UserRound } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { c as authedFetch, g as getSupabaseBrowserClient } from "./router-CSiXPOJe.js";
import "@supabase/supabase-js";
import "stripe";
import "node:fs/promises";
import "node:path";
import "zod";
import "node:crypto";
function DirectoryPage() {
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState([]);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  useEffect(() => {
    let mounted = true;
    void (async () => {
      setLoading(true);
      setError("");
      try {
        const response = await authedFetch("/api/public-directory?limit=500");
        const data = await response.json();
        if (!response.ok) {
          if (!mounted) return;
          setError(data.error || "Could not load creator directory.");
          setEntries([]);
          return;
        }
        if (!mounted) return;
        setEntries(Array.isArray(data.entries) ? data.entries : []);
      } catch {
        if (!mounted) return;
        setError("Could not load creator directory.");
        setEntries([]);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);
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
  const filteredEntries = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((entry) => {
      const haystack = `${entry.username} ${entry.displayName} ${entry.bio || ""}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [entries, query]);
  return /* @__PURE__ */ jsx("main", { className: "min-h-screen px-4 py-10 text-zinc-100", children: /* @__PURE__ */ jsx("div", { className: "mx-auto max-w-5xl", children: /* @__PURE__ */ jsxs("section", { className: "rounded-3xl border border-zinc-200/15 bg-zinc-900/60 p-6 md:p-8", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsxs("p", { className: "inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500", children: [
          /* @__PURE__ */ jsx(Users, { size: 13 }),
          " Public Directory"
        ] }),
        /* @__PURE__ */ jsx("h1", { className: "mt-2 text-3xl font-black text-zinc-50", children: "Creator Directory" }),
        /* @__PURE__ */ jsx("p", { className: "mt-2 text-sm text-zinc-300", children: "Browse all signed-up members and visit their public profiles." })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap gap-2", children: [
        /* @__PURE__ */ jsx(Link, { to: "/", className: "rounded-lg border border-zinc-100/25 px-4 py-2 text-sm font-semibold text-zinc-100 transition hover:border-orange-200/70", children: "Home" }),
        !authLoading && (user ? /* @__PURE__ */ jsx(Link, { to: "/dashboard", className: "rounded-lg bg-orange-300 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-orange-200", children: "Dashboard" }) : /* @__PURE__ */ jsx(Link, { to: "/signup", className: "rounded-lg bg-orange-300 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-orange-200", children: "Join W.A.G.E." }))
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "mt-6", children: [
      /* @__PURE__ */ jsx("label", { className: "mb-2 block text-xs font-semibold uppercase tracking-[0.15em] text-zinc-500", children: "Search" }),
      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 rounded-xl border border-zinc-200/20 bg-zinc-950/60 px-3 py-2", children: [
        /* @__PURE__ */ jsx(Search, { size: 14, className: "text-zinc-500" }),
        /* @__PURE__ */ jsx("input", { type: "text", value: query, onChange: (event) => setQuery(event.target.value), placeholder: "Search by username, display name, or bio", className: "w-full bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-500" })
      ] })
    ] }),
    loading ? /* @__PURE__ */ jsxs("p", { className: "mt-6 inline-flex items-center gap-2 text-sm text-zinc-300", children: [
      /* @__PURE__ */ jsx(Loader2, { size: 14, className: "animate-spin" }),
      " Loading members..."
    ] }) : error ? /* @__PURE__ */ jsx("p", { className: "mt-6 rounded-xl border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200", children: error }) : filteredEntries.length === 0 ? /* @__PURE__ */ jsx("p", { className: "mt-6 rounded-xl border border-zinc-200/15 bg-zinc-950/50 px-4 py-3 text-sm text-zinc-400", children: "No members found." }) : /* @__PURE__ */ jsx("ul", { className: "mt-6 grid gap-3", children: filteredEntries.map((entry) => /* @__PURE__ */ jsx("li", { children: /* @__PURE__ */ jsxs(Link, { to: "/$username", params: {
      username: entry.username
    }, className: "flex items-start gap-3 rounded-2xl border border-zinc-200/15 bg-zinc-950/45 p-4 transition hover:border-orange-200/60 hover:bg-zinc-900/80", children: [
      entry.avatarUrl ? /* @__PURE__ */ jsx("img", { src: entry.avatarUrl, alt: `${entry.displayName} avatar`, className: "h-12 w-12 flex-shrink-0 rounded-full border border-zinc-200/20 object-cover" }) : /* @__PURE__ */ jsx("div", { className: "flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full border border-zinc-200/20 bg-zinc-800", children: /* @__PURE__ */ jsx(UserRound, { size: 16, className: "text-zinc-500" }) }),
      /* @__PURE__ */ jsxs("div", { className: "min-w-0 flex-1", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [
          /* @__PURE__ */ jsx("p", { className: "truncate text-sm font-semibold text-zinc-100", children: entry.displayName }),
          /* @__PURE__ */ jsxs("span", { className: "rounded-full border border-zinc-200/20 bg-zinc-900 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-zinc-400", children: [
            "@",
            entry.username
          ] })
        ] }),
        /* @__PURE__ */ jsx("p", { className: "mt-1 line-clamp-2 text-xs text-zinc-400", children: entry.bio || "No bio available yet." }),
        /* @__PURE__ */ jsxs("p", { className: "mt-2 text-[11px] uppercase tracking-[0.12em] text-zinc-500", children: [
          "Connected Accounts: ",
          entry.connectedCount
        ] })
      ] }),
      /* @__PURE__ */ jsx("span", { className: "rounded-lg border border-zinc-100/25 px-2.5 py-1 text-xs font-semibold text-zinc-200", children: "View Profile" })
    ] }) }, entry.username)) })
  ] }) }) });
}
export {
  DirectoryPage as component
};
