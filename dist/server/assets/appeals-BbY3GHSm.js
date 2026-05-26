import { jsx, jsxs } from "react/jsx-runtime";
import { Link } from "@tanstack/react-router";
function AppealsPage() {
  return /* @__PURE__ */ jsx("div", { className: "min-h-screen px-4 py-12 text-zinc-100", children: /* @__PURE__ */ jsxs("div", { className: "mx-auto max-w-3xl rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-6 md:p-8", children: [
    /* @__PURE__ */ jsx("p", { className: "text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400", children: "Access Appeal" }),
    /* @__PURE__ */ jsx("h1", { className: "mt-3 text-3xl font-black text-zinc-50 md:text-4xl", children: "Request a ban review" }),
    /* @__PURE__ */ jsx("p", { className: "mt-4 text-base leading-relaxed text-zinc-300", children: "If you believe your restriction was issued in error, send an appeal with your account email, the context behind the incident, and any supporting evidence. Appeals should be reviewed by an administrator or superadmin." }),
    /* @__PURE__ */ jsxs("div", { className: "mt-6 rounded-xl border border-zinc-200/10 bg-zinc-950/50 p-5", children: [
      /* @__PURE__ */ jsx("p", { className: "text-sm font-semibold text-zinc-100", children: "Recommended appeal details" }),
      /* @__PURE__ */ jsxs("ul", { className: "mt-3 space-y-2 text-sm text-zinc-300", children: [
        /* @__PURE__ */ jsx("li", { children: "Your account email" }),
        /* @__PURE__ */ jsx("li", { children: "The date of the restriction" }),
        /* @__PURE__ */ jsx("li", { children: "A concise explanation of what happened" }),
        /* @__PURE__ */ jsx("li", { children: "Any evidence or context an admin should review" })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "mt-6 flex flex-wrap gap-3", children: [
      /* @__PURE__ */ jsx("a", { href: "mailto:appeals@wagesociety.com?subject=W.A.G.E.%20Society%20Appeal", className: "rounded-lg bg-orange-300 px-4 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-orange-200", children: "Email Appeals Team" }),
      /* @__PURE__ */ jsx(Link, { to: "/dashboard", className: "rounded-lg border border-zinc-100/25 px-4 py-2.5 text-sm font-semibold text-zinc-100 transition hover:border-orange-200/70 hover:text-orange-100", children: "Return Home" })
    ] })
  ] }) });
}
export {
  AppealsPage as component
};
