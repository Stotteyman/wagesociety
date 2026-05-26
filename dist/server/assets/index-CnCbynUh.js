import { jsxs, Fragment, jsx } from "react/jsx-runtime";
import { useRouter, Link } from "@tanstack/react-router";
import { User, LogOut, UserPlus, LogIn, Store, Tv, Users, Newspaper, ArrowRight } from "lucide-react";
import { useState, useEffect } from "react";
import { g as getSupabaseBrowserClient } from "./router-CSiXPOJe.js";
import "@supabase/supabase-js";
import "stripe";
import "node:fs/promises";
import "node:path";
import "zod";
import "node:crypto";
const publicDestinations = [{
  title: "Shop",
  description: "Browse memberships and merch available to all visitors.",
  to: "/merch",
  icon: Store
}, {
  title: "Livestream",
  description: "View the live section and stream activity feed.",
  to: "/live",
  icon: Tv
}, {
  title: "Directory",
  description: "Discover creators and open their public profiles.",
  to: "/directory",
  icon: Users
}, {
  title: "Blog",
  description: "Read public updates, announcements, and posts.",
  to: "/news",
  icon: Newspaper
}];
function Home() {
  const [email, setEmail] = useState("");
  const [liveAlerts, setLiveAlerts] = useState(true);
  const [newsletter, setNewsletter] = useState(true);
  const [productUpdates, setProductUpdates] = useState(false);
  const [communityUpdates, setCommunityUpdates] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [subscribeError, setSubscribeError] = useState("");
  const [subscribeSuccess, setSubscribeSuccess] = useState("");
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const router = useRouter();
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const supabase = getSupabaseBrowserClient();
        const {
          data
        } = await supabase.auth.getSession();
        setUser(data.session?.user || null);
        if (data.session?.user?.email) {
          setEmail(data.session.user.email);
        }
      } catch {
        setUser(null);
      } finally {
        setAuthLoading(false);
      }
    };
    checkAuth();
  }, []);
  const handleLogout = async () => {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    setUser(null);
    await router.navigate({
      to: "/"
    });
  };
  const handleSubscribe = async (event) => {
    event.preventDefault();
    setSubscribeError("");
    setSubscribeSuccess("");
    if (!email.trim()) {
      setSubscribeError("Please enter an email address.");
      return;
    }
    if (!liveAlerts && !newsletter && !productUpdates && !communityUpdates) {
      setSubscribeError("Choose at least one alert type.");
      return;
    }
    try {
      setSubscribing(true);
      const response = await fetch("/api/marketing-proof", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email: email.trim(),
          liveAlerts,
          newsletter,
          productUpdates,
          communityUpdates,
          source: "homepage"
        })
      });
      const data = await response.json();
      if (!response.ok) {
        setSubscribeError(data.error || "Could not subscribe right now.");
        return;
      }
      setSubscribeSuccess("Subscribed. You will receive the alerts you selected.");
      setEmail("");
    } catch {
      setSubscribeError("Could not subscribe right now.");
    } finally {
      setSubscribing(false);
    }
  };
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsxs("section", { className: "mt-8 rounded-3xl border border-orange-200/20 bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-950 p-6 sm:p-8 lg:p-10", children: [
      /* @__PURE__ */ jsx("p", { className: "inline-flex rounded-full border border-orange-300/30 bg-orange-300/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-orange-100", children: "Public Portal" }),
      /* @__PURE__ */ jsx("h1", { className: "mt-4 max-w-3xl text-3xl font-black leading-tight text-zinc-50 sm:text-4xl lg:text-5xl", children: "One place for creators to connect, watch live, discover members, and grow." }),
      /* @__PURE__ */ jsx("p", { className: "mt-4 max-w-2xl text-sm leading-relaxed text-zinc-300 sm:text-base", children: "Whether visitors are authenticated or not, they can access public sections, explore creators, and jump into the content that matters most." }),
      /* @__PURE__ */ jsx("div", { className: "mt-6 flex flex-wrap gap-3", children: !authLoading && user ? /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsxs(Link, { to: "/dashboard", className: "inline-flex items-center gap-2 rounded-xl bg-orange-300 px-4 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-orange-200", children: [
          /* @__PURE__ */ jsx(User, { size: 15 }),
          " Profile"
        ] }),
        /* @__PURE__ */ jsxs("button", { type: "button", onClick: () => {
          void handleLogout();
        }, className: "inline-flex items-center gap-2 rounded-xl border border-zinc-100/25 px-4 py-2.5 text-sm font-semibold text-zinc-100 transition hover:border-orange-200/60", children: [
          /* @__PURE__ */ jsx(LogOut, { size: 15 }),
          " Logout"
        ] })
      ] }) : !authLoading ? /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsxs(Link, { to: "/signup", className: "inline-flex items-center gap-2 rounded-xl bg-orange-300 px-4 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-orange-200", children: [
          /* @__PURE__ */ jsx(UserPlus, { size: 15 }),
          " Create Account"
        ] }),
        /* @__PURE__ */ jsxs(Link, { to: "/login", className: "inline-flex items-center gap-2 rounded-xl border border-zinc-100/25 px-4 py-2.5 text-sm font-semibold text-zinc-100 transition hover:border-orange-200/60", children: [
          /* @__PURE__ */ jsx(LogIn, { size: 15 }),
          " Login"
        ] })
      ] }) : null })
    ] }),
    /* @__PURE__ */ jsx("section", { className: "mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4", children: publicDestinations.map((item) => {
      const Icon = item.icon;
      return /* @__PURE__ */ jsxs(Link, { to: item.to, className: "group rounded-2xl border border-zinc-200/15 bg-zinc-900/70 p-5 transition hover:border-orange-200/55 hover:bg-zinc-900", children: [
        /* @__PURE__ */ jsx("span", { className: "inline-flex rounded-lg border border-zinc-100/15 bg-zinc-800/80 p-2 text-orange-200", children: /* @__PURE__ */ jsx(Icon, { size: 16 }) }),
        /* @__PURE__ */ jsx("h2", { className: "mt-4 text-lg font-bold text-zinc-50", children: item.title }),
        /* @__PURE__ */ jsx("p", { className: "mt-2 text-sm text-zinc-400", children: item.description }),
        /* @__PURE__ */ jsxs("span", { className: "mt-4 inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.12em] text-orange-100", children: [
          "Open ",
          /* @__PURE__ */ jsx(ArrowRight, { size: 13, className: "transition group-hover:translate-x-0.5" })
        ] })
      ] }, item.to);
    }) }),
    !authLoading && user && /* @__PURE__ */ jsxs("section", { className: "mt-7 rounded-2xl border border-zinc-200/15 bg-zinc-900/70 p-5 sm:p-6", children: [
      /* @__PURE__ */ jsx("h2", { className: "text-lg font-bold text-zinc-50", children: "Get Email Alerts" }),
      /* @__PURE__ */ jsx("p", { className: "mt-1 text-sm text-zinc-400", children: "Subscribe for live alerts, newsletters, and website updates." }),
      /* @__PURE__ */ jsxs("form", { onSubmit: handleSubscribe, className: "mt-4 space-y-3", children: [
        /* @__PURE__ */ jsx("input", { type: "email", value: email, readOnly: true, className: "w-full rounded-lg border border-zinc-200/20 bg-zinc-800/50 px-3 py-2 text-sm text-zinc-300 outline-none" }),
        /* @__PURE__ */ jsxs("div", { className: "grid gap-2 text-sm text-zinc-300 sm:grid-cols-2 lg:grid-cols-4", children: [
          /* @__PURE__ */ jsxs("label", { className: "flex items-center gap-2", children: [
            /* @__PURE__ */ jsx("input", { type: "checkbox", checked: liveAlerts, onChange: (event) => setLiveAlerts(event.target.checked) }),
            "Live alerts"
          ] }),
          /* @__PURE__ */ jsxs("label", { className: "flex items-center gap-2", children: [
            /* @__PURE__ */ jsx("input", { type: "checkbox", checked: newsletter, onChange: (event) => setNewsletter(event.target.checked) }),
            "Newsletter"
          ] }),
          /* @__PURE__ */ jsxs("label", { className: "flex items-center gap-2", children: [
            /* @__PURE__ */ jsx("input", { type: "checkbox", checked: productUpdates, onChange: (event) => setProductUpdates(event.target.checked) }),
            "Product updates"
          ] }),
          /* @__PURE__ */ jsxs("label", { className: "flex items-center gap-2", children: [
            /* @__PURE__ */ jsx("input", { type: "checkbox", checked: communityUpdates, onChange: (event) => setCommunityUpdates(event.target.checked) }),
            "Community updates"
          ] })
        ] }),
        subscribeError ? /* @__PURE__ */ jsx("p", { className: "text-xs text-rose-300", children: subscribeError }) : null,
        subscribeSuccess ? /* @__PURE__ */ jsx("p", { className: "text-xs text-emerald-300", children: subscribeSuccess }) : null,
        /* @__PURE__ */ jsx("button", { type: "submit", disabled: subscribing, className: "w-full rounded-lg bg-orange-300 px-4 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-orange-200 disabled:opacity-70 sm:w-auto", children: subscribing ? "Subscribing..." : "Subscribe" })
      ] })
    ] })
  ] });
}
export {
  Home as component
};
