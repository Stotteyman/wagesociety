import { jsx, jsxs } from "react/jsx-runtime";
import { Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
function MerchPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/shop");
        const data = await response.json();
        if (!response.ok) {
          setItems([]);
          return;
        }
        setItems(data.merchItems || []);
      } finally {
        setLoading(false);
      }
    })();
  }, []);
  return /* @__PURE__ */ jsx("div", { className: "min-h-screen px-4 py-12 text-zinc-100", children: /* @__PURE__ */ jsxs("div", { className: "mx-auto max-w-6xl space-y-6", children: [
    /* @__PURE__ */ jsx("header", { className: "rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-6 md:p-8", children: /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap items-center justify-between gap-4", children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("p", { className: "text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400", children: "Organization Store" }),
        /* @__PURE__ */ jsx("h1", { className: "mt-2 text-3xl font-black text-zinc-50 md:text-4xl", children: "W.A.G.E. Society Merch" }),
        /* @__PURE__ */ jsx("p", { className: "mt-3 max-w-2xl text-zinc-300", children: "Gear for creators, marketers, and entrepreneurs executing daily." })
      ] }),
      /* @__PURE__ */ jsx(Link, { to: "/dashboard", className: "rounded-lg border border-zinc-100/25 px-4 py-2 text-sm font-semibold text-zinc-100 transition hover:border-orange-200/70 hover:text-orange-100", children: "Home" })
    ] }) }),
    loading ? /* @__PURE__ */ jsx("p", { className: "text-zinc-300", children: "Loading merch..." }) : null,
    /* @__PURE__ */ jsxs("section", { className: "grid gap-5 md:grid-cols-2 xl:grid-cols-4", children: [
      items.map((item) => /* @__PURE__ */ jsxs("article", { className: "rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-5", children: [
        /* @__PURE__ */ jsx("h2", { className: "text-xl font-bold text-zinc-50", children: item.name }),
        /* @__PURE__ */ jsx("p", { className: "mt-2 text-sm text-zinc-300", children: item.description }),
        /* @__PURE__ */ jsx("p", { className: "mt-4 text-2xl font-black text-orange-200", children: item.price }),
        /* @__PURE__ */ jsx("button", { type: "button", className: "mt-4 w-full rounded-lg border border-zinc-100/25 py-2 font-semibold text-zinc-100 transition hover:border-orange-200/70 hover:text-orange-100", children: "Coming Soon" }),
        /* @__PURE__ */ jsxs("p", { className: "mt-3 text-xs text-zinc-400", children: [
          "Purchases are governed by our",
          " ",
          /* @__PURE__ */ jsx(Link, { to: "/terms", className: "font-semibold text-orange-200 hover:text-orange-100", children: "Terms" }),
          " ",
          "and",
          " ",
          /* @__PURE__ */ jsx(Link, { to: "/privacy", className: "font-semibold text-orange-200 hover:text-orange-100", children: "Privacy Policy" }),
          "."
        ] })
      ] }, item.name)),
      !loading && items.length === 0 ? /* @__PURE__ */ jsxs("article", { className: "rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-5 md:col-span-2 xl:col-span-4", children: [
        /* @__PURE__ */ jsx("h2", { className: "text-xl font-bold text-zinc-50", children: "Coming soon" }),
        /* @__PURE__ */ jsx("p", { className: "mt-2 text-sm text-zinc-300", children: "Merch drops are on the way. Check back soon." })
      ] }) : null
    ] })
  ] }) });
}
export {
  MerchPage as component
};
