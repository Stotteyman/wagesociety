import { jsx, jsxs } from "react/jsx-runtime";
import { useLocation, Outlet, Link } from "@tanstack/react-router";
import { ArrowLeft, Users, Store, RadioTower, Smartphone, CircleHelp } from "lucide-react";
const adminLinks = [{
  title: "Users & Permissions",
  description: "Manage member roles, bans, and permission matrix controls.",
  to: "/admin/users",
  icon: Users
}, {
  title: "Shop CRUD",
  description: "Create and edit merch items and membership plans.",
  to: "/admin/shop",
  icon: Store
}, {
  title: "Livestreams",
  description: "Add/remove stream channels and monitor live status.",
  to: "/live",
  icon: RadioTower
}, {
  title: "APK Manager",
  description: "Upload and publish the latest Android APK without redeploying the website.",
  to: "/admin/apk",
  icon: Smartphone
}, {
  title: "FAQ Page",
  description: "Open the FAQ page used by members and visitors.",
  to: "/faq",
  icon: CircleHelp
}];
function AdminHubPage() {
  const location = useLocation();
  if (location.pathname.startsWith("/admin/")) {
    return /* @__PURE__ */ jsx(Outlet, {});
  }
  return /* @__PURE__ */ jsx("div", { className: "min-h-screen px-4 py-12 text-zinc-100", children: /* @__PURE__ */ jsxs("div", { className: "mx-auto max-w-6xl space-y-6", children: [
    /* @__PURE__ */ jsx("header", { className: "rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-6 md:p-8", children: /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap items-center justify-between gap-4", children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("p", { className: "text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400", children: "Organization Control Center" }),
        /* @__PURE__ */ jsx("h1", { className: "mt-2 text-3xl font-black text-zinc-50 md:text-4xl", children: "Admin Hub" }),
        /* @__PURE__ */ jsx("p", { className: "mt-3 max-w-2xl text-zinc-300", children: "One button per function. Use this panel to jump directly to each admin operation." })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "flex gap-3", children: /* @__PURE__ */ jsxs(Link, { to: "/dashboard", className: "inline-flex items-center gap-2 rounded-lg border border-zinc-300/35 px-4 py-2 text-sm font-semibold text-zinc-100 transition hover:border-zinc-100", children: [
        /* @__PURE__ */ jsx(ArrowLeft, { size: 16 }),
        " Dashboard"
      ] }) })
    ] }) }),
    /* @__PURE__ */ jsx("section", { className: "grid gap-4 md:grid-cols-2 lg:grid-cols-3", children: adminLinks.map((item) => {
      const Icon = item.icon;
      return /* @__PURE__ */ jsxs(Link, { to: item.to, className: "group rounded-xl border border-zinc-200/15 bg-zinc-900/60 p-5 transition hover:border-orange-300/50", children: [
        /* @__PURE__ */ jsx("div", { className: "mb-3 inline-flex rounded-md border border-zinc-200/20 bg-zinc-950/70 p-2 text-orange-200 transition group-hover:border-orange-300/40", children: /* @__PURE__ */ jsx(Icon, { size: 18 }) }),
        /* @__PURE__ */ jsx("h2", { className: "text-xl font-bold text-zinc-50", children: item.title }),
        /* @__PURE__ */ jsx("p", { className: "mt-2 text-sm text-zinc-300", children: item.description }),
        /* @__PURE__ */ jsx("span", { className: "mt-4 inline-flex rounded-lg border border-zinc-100/25 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-100 transition group-hover:border-orange-300/55 group-hover:text-orange-100", children: "Open" })
      ] }, item.title);
    }) })
  ] }) });
}
export {
  AdminHubPage as component
};
