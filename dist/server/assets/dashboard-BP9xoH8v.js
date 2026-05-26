import { jsx, jsxs } from "react/jsx-runtime";
import { useLocation, useNavigate, Outlet, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Megaphone, Newspaper, LayoutDashboard, Settings, Shield, CalendarDays, DollarSign, ClipboardList, Users, NotebookPen, Radio, Store, Target } from "lucide-react";
import { g as getSupabaseBrowserClient, c as authedFetch, h as formatRoleLabel, s as setStoredViewAsRole, i as canManageRole } from "./router-CSiXPOJe.js";
import "@supabase/supabase-js";
import "stripe";
import "node:fs/promises";
import "node:path";
import "zod";
import "node:crypto";
function getDashboardUsername(member) {
  const username = String(member?.user_metadata?.username || "").trim();
  const preferred = String(member?.user_metadata?.preferred_username || "").trim();
  const fromEmail = String(member?.email || "").split("@")[0].trim();
  return username || preferred || fromEmail || "Member";
}
function DashboardGate() {
  const location = useLocation();
  const navigate = useNavigate();
  const [member, setMember] = useState(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [role, setRole] = useState("user");
  const [actorRole, setActorRole] = useState("user");
  const [viewingAs, setViewingAs] = useState(null);
  const [permissions, setPermissions] = useState([]);
  const [ban, setBan] = useState(null);
  const [accessLoading, setAccessLoading] = useState(true);
  useEffect(() => {
    let mounted = true;
    const supabase = getSupabaseBrowserClient();
    supabase.auth.getSession().then(({
      data
    }) => {
      if (!mounted) return;
      setMember(data.session?.user ?? null);
      setReady(true);
    }).catch(() => {
      if (!mounted) return;
      setReady(true);
    });
    const {
      data: {
        subscription
      }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setMember(session?.user ?? null);
      setReady(true);
      setError("");
    });
    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);
  useEffect(() => {
    if (!member) {
      setAccessLoading(false);
      return;
    }
    void (async () => {
      try {
        const response = await authedFetch("/api/me/access");
        if (!response.ok) {
          setAccessLoading(false);
          return;
        }
        const access = await response.json();
        setRole(access.role);
        setActorRole(access.actorRole || access.role);
        setViewingAs(access.viewingAs || null);
        setPermissions(access.permissions || []);
        setBan(access.ban || null);
      } catch {
      } finally {
        setAccessLoading(false);
      }
    })();
  }, [member]);
  const handleLogout = async () => {
    try {
      setStoredViewAsRole(null);
      const supabase = getSupabaseBrowserClient();
      const {
        error: error2
      } = await supabase.auth.signOut();
      if (error2) throw error2;
    } catch {
      setError("Could not log out. Please refresh and try again.");
    }
  };
  if (!ready) {
    return /* @__PURE__ */ jsx("div", { className: "min-h-screen px-4 py-24 text-zinc-100", children: /* @__PURE__ */ jsxs("div", { className: "mx-auto max-w-4xl rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-8 text-center", children: [
      /* @__PURE__ */ jsx("p", { className: "text-sm uppercase tracking-[0.2em] text-zinc-400", children: "Checking membership status" }),
      /* @__PURE__ */ jsx("h1", { className: "mt-4 text-3xl font-bold text-zinc-50", children: "Preparing your access..." })
    ] }) });
  }
  if (accessLoading) {
    return /* @__PURE__ */ jsx("div", { className: "min-h-screen px-4 py-24 text-zinc-100", children: /* @__PURE__ */ jsxs("div", { className: "mx-auto max-w-4xl rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-8 text-center", children: [
      /* @__PURE__ */ jsx("p", { className: "text-sm uppercase tracking-[0.2em] text-zinc-400", children: "Loading permissions" }),
      /* @__PURE__ */ jsx("h1", { className: "mt-4 text-3xl font-bold text-zinc-50", children: "Preparing your function access..." })
    ] }) });
  }
  if (!member) {
    void navigate({
      to: "/login"
    });
    return null;
  }
  if (location.pathname.startsWith("/dashboard/tools/")) {
    return /* @__PURE__ */ jsx(Outlet, {});
  }
  return /* @__PURE__ */ jsx(CreatorDashboard, { member, onLogout: handleLogout, role, actorRole, viewingAs, permissions, ban });
}
function CreatorDashboard({
  member,
  onLogout,
  role,
  actorRole,
  viewingAs,
  permissions,
  ban
}) {
  const [dashboardTab, setDashboardTab] = useState("motd");
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const viewParam = params.get("view");
    if (viewParam === "news" || viewParam === "workspace" || viewParam === "motd") {
      setDashboardTab(viewParam);
    }
  }, []);
  const [latestNews, setLatestNews] = useState([]);
  const [newsLoading, setNewsLoading] = useState(false);
  const [memberAvatarUrl, setMemberAvatarUrl] = useState(null);
  const isSuperadmin = role === "superadmin";
  const canUseViewAs = actorRole === "superadmin" || canManageRole(actorRole, "user");
  const selectableRoles = ["admin", "manager", "staff", "moderator", "helper", "user", "banned"].filter((candidate) => {
    if (actorRole === "superadmin") return true;
    return canManageRole(actorRole, candidate);
  });
  const hasPermission = (permission) => {
    if (isSuperadmin) return true;
    return permissions.includes(permission);
  };
  const dashboardFunctions = [{
    icon: /* @__PURE__ */ jsx(Megaphone, { size: 18 }),
    toolKey: "bulletin-board",
    title: "Bulletin Board",
    description: "Post launches, promotions, and collaboration requests to keep your team and peers aligned.",
    items: ["Announcement drafts", "Pinned growth opportunities", "Deadline reminders"],
    requiredPermission: "view_creator_tools"
  }, {
    icon: /* @__PURE__ */ jsx(CalendarDays, { size: 18 }),
    toolKey: "content-calendar",
    title: "Content Calendar",
    description: "Plan videos, newsletters, social campaigns, and product drops across a weekly cadence.",
    items: ["Publishing cadence", "Campaign timeline", "Cross-platform sync"],
    requiredPermission: "view_creator_tools"
  }, {
    icon: /* @__PURE__ */ jsx(DollarSign, { size: 18 }),
    toolKey: "revenue-tracker",
    title: "Revenue Tracker",
    description: "Track recurring income streams and monitor which offers convert best every month.",
    items: ["Membership revenue", "Funnel outcomes", "Offer performance"],
    requiredPermission: "view_revenue_tracker"
  }, {
    icon: /* @__PURE__ */ jsx(ClipboardList, { size: 18 }),
    toolKey: "creator-task-board",
    title: "Creator Task Board",
    description: "Break goals into weekly sprint tasks and keep momentum with clear priorities.",
    items: ["This-week priorities", "Pending reviews", "Automation backlog"],
    requiredPermission: "view_creator_tools"
  }, {
    icon: /* @__PURE__ */ jsx(Users, { size: 18 }),
    toolKey: "collaboration-hub",
    title: "Collaboration Hub",
    description: "Coordinate partner campaigns, joint launches, and audience growth collaborations.",
    items: ["Partner shortlist", "Joint launch plans", "Shared asset links"],
    requiredPermission: "view_creator_tools"
  }, {
    icon: /* @__PURE__ */ jsx(NotebookPen, { size: 18 }),
    toolKey: "knowledge-vault",
    title: "Knowledge Vault",
    description: "Store swipe files, scripts, hooks, and reusable frameworks for repeatable execution.",
    items: ["Best-performing hooks", "Marketing scripts", "Template library"],
    requiredPermission: "view_creator_tools"
  }, {
    icon: /* @__PURE__ */ jsx(Radio, { size: 18 }),
    toolKey: "promotion-hub",
    title: "Promotion Hub",
    description: "Compose and schedule posts to Kick, Twitch, X, Instagram, and Threads from one place.",
    items: ["Write once, post anywhere", "Schedule your queue", "Platform-tailored previews"],
    requiredPermission: "view_creator_tools"
  }, {
    icon: /* @__PURE__ */ jsx(Store, { size: 18 }),
    toolKey: "merch-studio",
    title: "Merch Studio",
    description: "Submit your merch mockups, track admin review status, and monitor your earnings splits.",
    items: ["Design submissions", "Approval status", "Earnings & payouts"],
    requiredPermission: "view_merch"
  }, {
    icon: /* @__PURE__ */ jsx(Target, { size: 18 }),
    toolKey: "creator-growth-system",
    title: "Creator Growth System",
    description: "Build and track your creator operating system across 5 modules: broadcast, hub, monetization, distribution, and operations.",
    items: ["Creator System Score", "5-module checklist", "Next action guidance"],
    requiredPermission: "view_creator_tools"
  }];
  const visibleFunctions = dashboardFunctions.filter((fn) => hasPermission(fn.requiredPermission));
  const dashboardDisplayName = getDashboardUsername(member);
  useEffect(() => {
    void (async () => {
      try {
        const response = await authedFetch("/api/me/profile");
        if (!response.ok) return;
        const data = await response.json();
        setMemberAvatarUrl(data.profile?.avatar_url || null);
      } catch {
      }
    })();
  }, []);
  useEffect(() => {
    void (async () => {
      setNewsLoading(true);
      try {
        const response = await fetch("/api/news");
        if (!response.ok) return;
        const data = await response.json();
        setLatestNews(Array.isArray(data) ? data.slice(0, 5) : []);
      } catch {
        setLatestNews([]);
      } finally {
        setNewsLoading(false);
      }
    })();
  }, []);
  if (role === "banned") {
    return /* @__PURE__ */ jsx(BannedDashboard, { member, onLogout, ban });
  }
  const applyViewAs = (targetRole) => {
    if (!canUseViewAs) return;
    setStoredViewAsRole(targetRole ? targetRole : null);
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };
  return /* @__PURE__ */ jsx("div", { className: "min-h-screen px-4 py-12 text-zinc-100", children: /* @__PURE__ */ jsxs("div", { className: "mx-auto max-w-6xl", children: [
    /* @__PURE__ */ jsxs("header", { className: "rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-6 md:p-8", children: [
      /* @__PURE__ */ jsx("div", { className: "flex flex-wrap items-center justify-between gap-4", children: /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-4", children: [
          memberAvatarUrl ? /* @__PURE__ */ jsx("img", { src: memberAvatarUrl, alt: dashboardDisplayName, className: "h-16 w-16 flex-shrink-0 rounded-full border border-zinc-200/20 object-cover" }) : /* @__PURE__ */ jsx("div", { className: "flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-full border border-zinc-200/20 bg-zinc-800 text-xl font-bold text-zinc-400", children: dashboardDisplayName.slice(0, 1).toUpperCase() }),
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("p", { className: "text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400", children: "Organization Dashboard" }),
            /* @__PURE__ */ jsxs("h1", { className: "mt-1 text-3xl font-black text-zinc-50 md:text-4xl", children: [
              "Welcome back, ",
              dashboardDisplayName
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsx("p", { className: "mt-3 max-w-2xl text-zinc-300", children: "Run your creator pipeline, marketing campaigns, and entrepreneurial execution with a focused operating system." }),
        /* @__PURE__ */ jsxs("div", { className: "mt-4 flex flex-wrap gap-2 text-xs", children: [
          /* @__PURE__ */ jsxs("span", { className: "rounded-full border border-zinc-500/40 px-3 py-1 uppercase tracking-wide text-zinc-300", children: [
            "Role: ",
            formatRoleLabel(role)
          ] }),
          viewingAs ? /* @__PURE__ */ jsxs("span", { className: "rounded-full border border-rose-400/60 px-3 py-1 uppercase tracking-wide text-rose-200", children: [
            "Viewing As: ",
            formatRoleLabel(viewingAs)
          ] }) : null,
          isSuperadmin ? /* @__PURE__ */ jsx("span", { className: "rounded-full border border-orange-300/60 px-3 py-1 uppercase tracking-wide text-orange-100", children: "Full Access" }) : null
        ] }),
        canUseViewAs ? /* @__PURE__ */ jsxs("div", { className: "mt-4 max-w-sm rounded-xl border border-rose-400/35 bg-rose-500/10 p-3", children: [
          /* @__PURE__ */ jsx("p", { className: "text-xs font-semibold uppercase tracking-[0.2em] text-rose-200", children: "View As Mode" }),
          /* @__PURE__ */ jsxs("div", { className: "mt-2 flex items-center gap-2", children: [
            /* @__PURE__ */ jsxs("select", { value: viewingAs || "", onChange: (event) => applyViewAs(event.target.value), className: "w-full rounded-lg border border-rose-300/35 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-rose-200", children: [
              /* @__PURE__ */ jsx("option", { value: "", children: "Off (your role)" }),
              selectableRoles.map((previewRole) => /* @__PURE__ */ jsx("option", { value: previewRole, children: formatRoleLabel(previewRole) }, previewRole))
            ] }),
            viewingAs ? /* @__PURE__ */ jsx("button", { type: "button", onClick: () => applyViewAs(""), className: "rounded-lg border border-rose-300/45 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-rose-100 transition hover:border-rose-200", children: "Reset" }) : null
          ] })
        ] }) : null
      ] }) }),
      /* @__PURE__ */ jsxs("div", { className: "mt-6 border-t border-zinc-200/10 pt-4", children: [
        /* @__PURE__ */ jsx("p", { className: "mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500", children: "Dashboard Sections" }),
        /* @__PURE__ */ jsx("div", { className: "-mx-1 overflow-x-auto px-1", children: /* @__PURE__ */ jsxs("div", { className: "flex min-w-max gap-1 rounded-xl border border-zinc-200/15 bg-zinc-900/60 p-1", children: [
          /* @__PURE__ */ jsxs("button", { type: "button", onClick: () => setDashboardTab("motd"), className: `flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition ${dashboardTab === "motd" ? "bg-orange-300 text-zinc-950" : "text-zinc-300 hover:text-zinc-50"}`, children: [
            /* @__PURE__ */ jsx(Megaphone, { size: 15 }),
            "MOTD"
          ] }),
          /* @__PURE__ */ jsxs("button", { type: "button", onClick: () => setDashboardTab("news"), className: `flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition ${dashboardTab === "news" ? "bg-orange-300 text-zinc-950" : "text-zinc-300 hover:text-zinc-50"}`, children: [
            /* @__PURE__ */ jsx(Newspaper, { size: 15 }),
            "Latest News"
          ] }),
          /* @__PURE__ */ jsxs("button", { type: "button", onClick: () => setDashboardTab("workspace"), className: `flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition ${dashboardTab === "workspace" ? "bg-orange-300 text-zinc-950" : "text-zinc-300 hover:text-zinc-50"}`, children: [
            /* @__PURE__ */ jsx(LayoutDashboard, { size: 15 }),
            "Workspace"
          ] }),
          /* @__PURE__ */ jsxs(Link, { to: "/settings", className: "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-zinc-300 transition hover:text-zinc-50", children: [
            /* @__PURE__ */ jsx(Settings, { size: 15 }),
            "Settings"
          ] }),
          hasPermission("access_admin_dashboard") && /* @__PURE__ */ jsxs(Link, { to: "/admin", className: "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-zinc-300 transition hover:text-zinc-50", children: [
            /* @__PURE__ */ jsx(Shield, { size: 15 }),
            "Admin"
          ] })
        ] }) })
      ] })
    ] }),
    dashboardTab === "motd" ? /* @__PURE__ */ jsx("section", { className: "mt-6", children: /* @__PURE__ */ jsxs("article", { className: "rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-6", children: [
      /* @__PURE__ */ jsx("p", { className: "text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400", children: "MOTD" }),
      /* @__PURE__ */ jsx("h2", { className: "mt-2 text-2xl font-bold text-zinc-50", children: "Build momentum today" }),
      /* @__PURE__ */ jsx("p", { className: "mt-3 max-w-3xl text-zinc-300", children: "Ship one meaningful piece of content, complete one revenue task, and check in with one collaborator before your day ends." })
    ] }) }) : null,
    dashboardTab === "news" ? /* @__PURE__ */ jsxs("section", { className: "mt-6 space-y-4", children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("h2", { className: "text-2xl font-bold text-zinc-50", children: "Latest News" }),
        /* @__PURE__ */ jsx("p", { className: "mt-1 text-sm text-zinc-300", children: "Recent organization announcements and updates." })
      ] }),
      newsLoading ? /* @__PURE__ */ jsx("p", { className: "text-sm text-zinc-300", children: "Loading latest news..." }) : null,
      !newsLoading && latestNews.length === 0 ? /* @__PURE__ */ jsxs("article", { className: "rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-5", children: [
        /* @__PURE__ */ jsx("h3", { className: "text-lg font-semibold text-zinc-50", children: "No news posted yet" }),
        /* @__PURE__ */ jsx("p", { className: "mt-2 text-sm text-zinc-300", children: "Announcements will appear here as soon as staff publishes updates." })
      ] }) : null,
      /* @__PURE__ */ jsx("div", { className: "space-y-3", children: latestNews.map((post) => /* @__PURE__ */ jsxs("article", { className: "rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-5", children: [
        /* @__PURE__ */ jsx("h3", { className: "text-lg font-semibold text-zinc-50", children: post.title }),
        /* @__PURE__ */ jsxs("p", { className: "mt-1 text-xs text-zinc-400", children: [
          post.author ? `By ${post.author}` : "W.A.G.E. Society",
          " · ",
          new Date(post.created_at).toLocaleString()
        ] }),
        /* @__PURE__ */ jsx("p", { className: "mt-3 whitespace-pre-line text-sm leading-relaxed text-zinc-300", children: post.body })
      ] }, post.id)) })
    ] }) : null,
    dashboardTab === "workspace" ? /* @__PURE__ */ jsxs("section", { className: "mt-6", children: [
      /* @__PURE__ */ jsxs("div", { className: "mb-4", children: [
        /* @__PURE__ */ jsx("h2", { className: "text-2xl font-bold text-zinc-50", children: "Workspace" }),
        /* @__PURE__ */ jsx("p", { className: "mt-1 text-sm text-zinc-300", children: "Your assigned creator modules are listed below." })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "grid gap-5 md:grid-cols-2 lg:grid-cols-3", children: [
        visibleFunctions.map((fn) => /* @__PURE__ */ jsx(ResourceCard, { icon: fn.icon, toolKey: fn.toolKey, title: fn.title, description: fn.description, items: fn.items }, fn.title)),
        !visibleFunctions.length ? /* @__PURE__ */ jsxs("article", { className: "rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-5 md:col-span-2 lg:col-span-3", children: [
          /* @__PURE__ */ jsx("h2", { className: "text-xl font-bold text-zinc-50", children: "No Functions Assigned Yet" }),
          /* @__PURE__ */ jsx("p", { className: "mt-2 text-sm text-zinc-300", children: "Your account has no dashboard functions enabled yet. Ask an admin or superadmin to grant permissions." })
        ] }) : null
      ] })
    ] }) : null
  ] }) });
}
function BannedDashboard({
  member,
  onLogout,
  ban
}) {
  const bannedUntilLabel = ban?.bannedUntil ? new Date(ban.bannedUntil).toLocaleString() : "Forever";
  return /* @__PURE__ */ jsx("div", { className: "min-h-screen px-4 py-12 text-zinc-100", children: /* @__PURE__ */ jsxs("div", { className: "mx-auto max-w-4xl rounded-2xl border border-rose-400/30 bg-rose-500/10 p-6 md:p-8", children: [
    /* @__PURE__ */ jsx("p", { className: "text-xs font-semibold uppercase tracking-[0.2em] text-rose-200", children: "Account Restricted" }),
    /* @__PURE__ */ jsx("h1", { className: "mt-3 text-3xl font-black text-zinc-50 md:text-4xl", children: "You are currently banned" }),
    /* @__PURE__ */ jsxs("p", { className: "mt-4 text-base leading-relaxed text-zinc-200", children: [
      member.email || "This account",
      " was banned by ",
      ban?.bannedBy || "an administrator",
      " for",
      " ",
      ban?.banReason || "a policy violation",
      " until ",
      bannedUntilLabel,
      ". Click here to",
      " ",
      /* @__PURE__ */ jsx(Link, { to: "/appeals", className: "font-semibold text-rose-100 underline underline-offset-4 transition hover:text-white", children: "appeal" }),
      "."
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "mt-6 flex flex-wrap gap-3", children: [
      /* @__PURE__ */ jsx(Link, { to: "/dashboard", className: "rounded-lg border border-zinc-100/25 px-4 py-2 text-sm font-semibold text-zinc-100 transition hover:border-rose-200/70 hover:text-rose-100", children: "Return Home" }),
      /* @__PURE__ */ jsx("button", { type: "button", onClick: () => {
        void onLogout();
      }, className: "rounded-lg border border-zinc-100/25 px-4 py-2 text-sm font-semibold text-zinc-100 transition hover:border-rose-200/70 hover:text-rose-100", children: "Logout" })
    ] })
  ] }) });
}
function ResourceCard({
  icon,
  toolKey,
  title,
  description,
  items
}) {
  const navigate = useNavigate();
  return /* @__PURE__ */ jsx("button", { type: "button", onClick: () => {
    void navigate({
      to: "/dashboard/tools/$tool",
      params: {
        tool: toolKey
      }
    });
  }, className: "group block w-full rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-5 text-left transition hover:border-orange-300/50", children: /* @__PURE__ */ jsxs("article", { children: [
    /* @__PURE__ */ jsx("div", { className: "mb-3 inline-flex rounded-md border border-zinc-200/20 bg-zinc-950/70 p-2 text-orange-200", children: icon }),
    /* @__PURE__ */ jsx("h2", { className: "text-xl font-bold text-zinc-50 group-hover:text-orange-100", children: title }),
    /* @__PURE__ */ jsx("p", { className: "mt-2 text-sm leading-relaxed text-zinc-300", children: description }),
    /* @__PURE__ */ jsx("ul", { className: "mt-4 space-y-2 text-sm text-zinc-200", children: items.map((item) => /* @__PURE__ */ jsxs("li", { className: "flex gap-2", children: [
      /* @__PURE__ */ jsx("span", { className: "text-orange-200", children: "*" }),
      /* @__PURE__ */ jsx("span", { children: item })
    ] }, item)) })
  ] }) });
}
export {
  DashboardGate as component
};
