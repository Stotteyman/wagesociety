import { jsx, jsxs } from "react/jsx-runtime";
import { Link } from "@tanstack/react-router";
import { RefreshCcw, ArrowLeft, ShoppingBag, Trash2, Store, Link2, Loader2, ExternalLink, ChevronUp, ChevronDown, ImageOff, CheckCircle, XCircle } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { c as authedFetch } from "./router-CSiXPOJe.js";
import "@supabase/supabase-js";
import "stripe";
import "node:fs/promises";
import "node:path";
import "zod";
import "node:crypto";
const emptyMerchForm = {
  id: "",
  name: "",
  price: "",
  description: "",
  sortOrder: 0,
  isActive: true
};
const emptyPlanForm = {
  id: "",
  slug: "",
  name: "",
  displayPrice: "",
  priceCents: 0,
  description: "",
  featuresText: "",
  sortOrder: 0,
  isActive: true
};
function ConfidenceBadge({
  confidence
}) {
  const map = {
    high: "border-emerald-400/50 bg-emerald-500/10 text-emerald-300",
    medium: "border-amber-400/50 bg-amber-500/10 text-amber-300",
    low: "border-rose-400/50 bg-rose-500/10 text-rose-300"
  };
  return /* @__PURE__ */ jsxs("span", { className: `inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${map[confidence]}`, children: [
    confidence === "high" ? /* @__PURE__ */ jsx(CheckCircle, { size: 11 }) : confidence === "low" ? /* @__PURE__ */ jsx(XCircle, { size: 11 }) : null,
    confidence.toUpperCase(),
    " confidence"
  ] });
}
function ImportPanel({
  onApplyToMerch
}) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [product, setProduct] = useState(null);
  const [showSignals, setShowSignals] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [editName, setEditName] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const inputRef = useRef(null);
  const handleImport = async () => {
    const trimmed = url.trim();
    if (!trimmed) return;
    setLoading(true);
    setError("");
    setProduct(null);
    try {
      const res = await authedFetch("/api/admin/shop/import-url", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          url: trimmed
        })
      });
      const data = await res.json();
      if (!res.ok || !data.product) {
        setError(data.error || "Could not extract product data.");
        return;
      }
      setProduct(data.product);
      setEditName(data.product.name);
      setEditPrice(data.product.price);
      setEditDescription(data.product.description);
      setSelectedImage(data.product.imageUrl);
    } catch {
      setError("Request failed. Check your connection.");
    } finally {
      setLoading(false);
    }
  };
  const handleReset = () => {
    setProduct(null);
    setError("");
    setUrl("");
    setEditName("");
    setEditPrice("");
    setEditDescription("");
    setSelectedImage(null);
    inputRef.current?.focus();
  };
  return /* @__PURE__ */ jsxs("section", { className: "rounded-2xl border border-indigo-400/20 bg-indigo-950/30 p-6", children: [
    /* @__PURE__ */ jsxs("div", { className: "mb-4 flex items-center gap-2", children: [
      /* @__PURE__ */ jsx(Link2, { size: 18, className: "text-indigo-300" }),
      /* @__PURE__ */ jsx("h2", { className: "text-xl font-bold text-zinc-50", children: "Import from URL" }),
      /* @__PURE__ */ jsx("span", { className: "ml-2 rounded-full border border-indigo-400/40 px-2 py-0.5 text-xs font-semibold text-indigo-300", children: "BETA" })
    ] }),
    /* @__PURE__ */ jsx("p", { className: "mb-4 text-sm text-zinc-400", children: "Paste any product listing URL (Amazon, Shopify, Etsy, etc.) and we'll extract the title, price, and description automatically." }),
    /* @__PURE__ */ jsxs("div", { className: "flex gap-2", children: [
      /* @__PURE__ */ jsx("input", { ref: inputRef, type: "url", value: url, onChange: (e) => setUrl(e.target.value), onKeyDown: (e) => {
        if (e.key === "Enter") void handleImport();
      }, placeholder: "https://www.amazon.com/dp/...", className: "flex-1 rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-indigo-400", disabled: loading }),
      /* @__PURE__ */ jsxs("button", { type: "button", onClick: () => void handleImport(), disabled: loading || !url.trim(), className: "inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60", children: [
        loading ? /* @__PURE__ */ jsx(Loader2, { size: 15, className: "animate-spin" }) : /* @__PURE__ */ jsx(Link2, { size: 15 }),
        loading ? "Extracting..." : "Extract"
      ] }),
      product ? /* @__PURE__ */ jsx("button", { type: "button", onClick: handleReset, className: "rounded-lg border border-zinc-200/20 px-3 py-2 text-sm text-zinc-400 hover:text-zinc-100", children: "Clear" }) : null
    ] }),
    error ? /* @__PURE__ */ jsx("p", { className: "mt-3 rounded-lg border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200", children: error }) : null,
    product ? /* @__PURE__ */ jsxs("div", { className: "mt-5 grid gap-5 lg:grid-cols-[1fr_280px]", children: [
      /* @__PURE__ */ jsxs("div", { className: "space-y-3", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap items-center gap-3", children: [
          /* @__PURE__ */ jsx(ConfidenceBadge, { confidence: product.confidence }),
          product.brand ? /* @__PURE__ */ jsxs("span", { className: "text-xs text-zinc-400", children: [
            "Brand: ",
            /* @__PURE__ */ jsx("strong", { className: "text-zinc-200", children: product.brand })
          ] }) : null,
          product.availability ? /* @__PURE__ */ jsxs("span", { className: "text-xs text-zinc-400", children: [
            "Availability: ",
            /* @__PURE__ */ jsx("strong", { className: "text-zinc-200", children: product.availability })
          ] }) : null,
          product.rating ? /* @__PURE__ */ jsxs("span", { className: "text-xs text-zinc-400", children: [
            "⭐ ",
            product.rating,
            " ",
            product.reviewCount ? `(${product.reviewCount.toLocaleString()} reviews)` : ""
          ] }) : null,
          /* @__PURE__ */ jsxs("a", { href: product.sourceUrl, target: "_blank", rel: "noopener noreferrer", className: "ml-auto inline-flex items-center gap-1 text-xs text-indigo-400 hover:underline", children: [
            /* @__PURE__ */ jsx(ExternalLink, { size: 11 }),
            " View source"
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("label", { className: "mb-1 block text-xs font-medium text-zinc-400", children: "Product Name" }),
          /* @__PURE__ */ jsx("input", { type: "text", value: editName, onChange: (e) => setEditName(e.target.value), className: "w-full rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-100" })
        ] }),
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("label", { className: "mb-1 block text-xs font-medium text-zinc-400", children: "Price" }),
          /* @__PURE__ */ jsx("input", { type: "text", value: editPrice, onChange: (e) => setEditPrice(e.target.value), placeholder: "e.g. $29.99", className: "w-full rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-100" })
        ] }),
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsxs("label", { className: "mb-1 block text-xs font-medium text-zinc-400", children: [
            "Description ",
            /* @__PURE__ */ jsx("span", { className: "text-zinc-500", children: "(editable before saving)" })
          ] }),
          /* @__PURE__ */ jsx("textarea", { value: editDescription, onChange: (e) => setEditDescription(e.target.value), rows: 4, className: "w-full rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-100" })
        ] }),
        /* @__PURE__ */ jsxs("button", { type: "button", onClick: () => setShowSignals((s) => !s), className: "inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300", children: [
          showSignals ? /* @__PURE__ */ jsx(ChevronUp, { size: 12 }) : /* @__PURE__ */ jsx(ChevronDown, { size: 12 }),
          showSignals ? "Hide" : "Show",
          " extraction signals (",
          product.signals.length,
          ")"
        ] }),
        showSignals ? /* @__PURE__ */ jsx("div", { className: "rounded-lg border border-zinc-200/10 bg-zinc-950/40 px-3 py-2", children: /* @__PURE__ */ jsx("ul", { className: "space-y-0.5", children: product.signals.map((s, i) => /* @__PURE__ */ jsxs("li", { className: "text-xs text-zinc-400", children: [
          "✓ ",
          s
        ] }, i)) }) }) : null,
        /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap gap-3 pt-1", children: [
          /* @__PURE__ */ jsx("button", { type: "button", onClick: () => onApplyToMerch({
            name: editName,
            price: editPrice,
            description: editDescription
          }), className: "rounded-lg bg-orange-300 px-4 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-orange-200", children: "→ Fill Merch Form" }),
          /* @__PURE__ */ jsx("p", { className: "self-center text-xs text-zinc-500", children: "Review and save in the Merch Items form below." })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("label", { className: "mb-2 block text-xs font-medium text-zinc-400", children: "Product Images" }),
        product.images.length === 0 ? /* @__PURE__ */ jsx("div", { className: "flex h-40 items-center justify-center rounded-lg border border-zinc-200/10 bg-zinc-950/40", children: /* @__PURE__ */ jsxs("div", { className: "text-center text-zinc-600", children: [
          /* @__PURE__ */ jsx(ImageOff, { size: 24, className: "mx-auto mb-1" }),
          /* @__PURE__ */ jsx("p", { className: "text-xs", children: "No images found" })
        ] }) }) : /* @__PURE__ */ jsxs("div", { className: "space-y-2", children: [
          selectedImage ? /* @__PURE__ */ jsx("div", { className: "overflow-hidden rounded-lg border border-zinc-200/15", children: /* @__PURE__ */ jsx("img", { src: selectedImage, alt: "Selected product", className: "h-48 w-full object-contain bg-zinc-950", onError: (e) => {
            e.target.style.display = "none";
          } }) }) : null,
          product.images.length > 1 ? /* @__PURE__ */ jsx("div", { className: "grid grid-cols-4 gap-1", children: product.images.slice(0, 8).map((img, i) => /* @__PURE__ */ jsx("button", { type: "button", onClick: () => setSelectedImage(img), className: `overflow-hidden rounded border-2 transition ${selectedImage === img ? "border-indigo-400" : "border-zinc-200/10 hover:border-zinc-200/30"}`, children: /* @__PURE__ */ jsx("img", { src: img, alt: `Product image ${i + 1}`, className: "h-12 w-full object-cover bg-zinc-950", onError: (e) => {
            e.target.parentElement.style.display = "none";
          } }) }, i)) }) : null,
          selectedImage ? /* @__PURE__ */ jsx("p", { className: "break-all text-xs text-zinc-500", children: selectedImage }) : null
        ] })
      ] })
    ] }) : null
  ] });
}
function AdminShopPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [merchItems, setMerchItems] = useState([]);
  const [membershipPlans, setMembershipPlans] = useState([]);
  const [merchForm, setMerchForm] = useState(emptyMerchForm);
  const [planForm, setPlanForm] = useState(emptyPlanForm);
  const [savingMerch, setSavingMerch] = useState(false);
  const [savingPlan, setSavingPlan] = useState(false);
  const loadShopData = async () => {
    setError("");
    const [merchRes, plansRes] = await Promise.all([authedFetch("/api/admin/shop/merch"), authedFetch("/api/admin/shop/plans")]);
    const merchJson = await merchRes.json();
    const plansJson = await plansRes.json();
    if (!merchRes.ok) {
      throw new Error(merchJson.error || "Failed to load merch items");
    }
    if (!plansRes.ok) {
      throw new Error(plansJson.error || "Failed to load membership plans");
    }
    setMerchItems(merchJson.items || []);
    setMembershipPlans(plansJson.plans || []);
  };
  useEffect(() => {
    void (async () => {
      try {
        setLoading(true);
        await loadShopData();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load shop data");
      } finally {
        setLoading(false);
      }
    })();
  }, []);
  const handleSaveMerch = async (event) => {
    event.preventDefault();
    setSavingMerch(true);
    setError("");
    try {
      const method = merchForm.id ? "PUT" : "POST";
      const res = await authedFetch("/api/admin/shop/merch", {
        method,
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          id: merchForm.id || void 0,
          name: merchForm.name,
          price: merchForm.price,
          description: merchForm.description,
          sortOrder: Number(merchForm.sortOrder),
          isActive: merchForm.isActive
        })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to save merch item");
      setMerchForm(emptyMerchForm);
      await loadShopData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save merch item");
    } finally {
      setSavingMerch(false);
    }
  };
  const handleDeleteMerch = async (id) => {
    try {
      setError("");
      const res = await authedFetch("/api/admin/shop/merch", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          id
        })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to delete merch item");
      if (merchForm.id === id) setMerchForm(emptyMerchForm);
      await loadShopData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete merch item");
    }
  };
  const handleSavePlan = async (event) => {
    event.preventDefault();
    setSavingPlan(true);
    setError("");
    try {
      const method = planForm.id ? "PUT" : "POST";
      const features = planForm.featuresText.split("\n").map((x) => x.trim()).filter(Boolean);
      const res = await authedFetch("/api/admin/shop/plans", {
        method,
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          id: planForm.id || void 0,
          slug: planForm.slug,
          name: planForm.name,
          displayPrice: planForm.displayPrice,
          priceCents: Number(planForm.priceCents),
          description: planForm.description,
          features,
          sortOrder: Number(planForm.sortOrder),
          isActive: planForm.isActive
        })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to save membership plan");
      setPlanForm(emptyPlanForm);
      await loadShopData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save membership plan");
    } finally {
      setSavingPlan(false);
    }
  };
  const handleDeletePlan = async (id) => {
    try {
      setError("");
      const res = await authedFetch("/api/admin/shop/plans", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          id
        })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to delete membership plan");
      if (planForm.id === id) setPlanForm(emptyPlanForm);
      await loadShopData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete membership plan");
    }
  };
  return /* @__PURE__ */ jsx("div", { className: "min-h-screen px-4 py-12 text-zinc-100", children: /* @__PURE__ */ jsxs("div", { className: "mx-auto max-w-6xl space-y-6", children: [
    /* @__PURE__ */ jsx("header", { className: "rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-6 md:p-8", children: /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap items-center justify-between gap-4", children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("p", { className: "text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400", children: "Admin / Shop" }),
        /* @__PURE__ */ jsx("h1", { className: "mt-2 text-3xl font-black text-zinc-50 md:text-4xl", children: "Shop CRUD Management" }),
        /* @__PURE__ */ jsx("p", { className: "mt-3 max-w-2xl text-zinc-300", children: "Create, edit, and delete merch items and membership plans used across the website." })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap gap-3", children: [
        /* @__PURE__ */ jsxs("button", { type: "button", onClick: () => {
          void loadShopData();
        }, className: "inline-flex items-center gap-2 rounded-lg border border-zinc-300/35 px-4 py-2 text-sm font-semibold text-zinc-100 transition hover:border-zinc-100", children: [
          /* @__PURE__ */ jsx(RefreshCcw, { size: 16 }),
          " Refresh"
        ] }),
        /* @__PURE__ */ jsxs(Link, { to: "/admin", className: "inline-flex items-center gap-2 rounded-lg border border-zinc-300/35 px-4 py-2 text-sm font-semibold text-zinc-100 transition hover:border-zinc-100", children: [
          /* @__PURE__ */ jsx(ArrowLeft, { size: 16 }),
          " Admin Hub"
        ] }),
        /* @__PURE__ */ jsx(Link, { to: "/dashboard", className: "inline-flex items-center gap-2 rounded-lg border border-zinc-300/35 px-4 py-2 text-sm font-semibold text-zinc-100 transition hover:border-zinc-100", children: "Dashboard" })
      ] })
    ] }) }),
    error ? /* @__PURE__ */ jsx("p", { className: "rounded-lg border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200", children: error }) : null,
    /* @__PURE__ */ jsx(ImportPanel, { onApplyToMerch: ({
      name,
      price,
      description
    }) => {
      setMerchForm((prev) => ({
        ...prev,
        id: "",
        name,
        price,
        description
      }));
      document.getElementById("merch-form-section")?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    } }),
    /* @__PURE__ */ jsxs("section", { className: "grid gap-6 lg:grid-cols-2", children: [
      /* @__PURE__ */ jsxs("article", { id: "merch-form-section", className: "rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-6", children: [
        /* @__PURE__ */ jsxs("div", { className: "mb-4 flex items-center gap-2 text-orange-100", children: [
          /* @__PURE__ */ jsx(ShoppingBag, { size: 18 }),
          /* @__PURE__ */ jsx("h2", { className: "text-xl font-bold text-zinc-50", children: "Merch Items" })
        ] }),
        /* @__PURE__ */ jsxs("form", { onSubmit: handleSaveMerch, className: "space-y-3", children: [
          /* @__PURE__ */ jsx("input", { type: "text", value: merchForm.name, onChange: (event) => setMerchForm((prev) => ({
            ...prev,
            name: event.target.value
          })), placeholder: "Item name", required: true, className: "w-full rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-zinc-100" }),
          /* @__PURE__ */ jsx("input", { type: "text", value: merchForm.price, onChange: (event) => setMerchForm((prev) => ({
            ...prev,
            price: event.target.value
          })), placeholder: "$34", required: true, className: "w-full rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-zinc-100" }),
          /* @__PURE__ */ jsx("textarea", { value: merchForm.description, onChange: (event) => setMerchForm((prev) => ({
            ...prev,
            description: event.target.value
          })), placeholder: "Description", required: true, className: "min-h-24 w-full rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-zinc-100" }),
          /* @__PURE__ */ jsxs("div", { className: "grid gap-3 sm:grid-cols-2", children: [
            /* @__PURE__ */ jsx("input", { type: "number", min: 0, value: merchForm.sortOrder, onChange: (event) => setMerchForm((prev) => ({
              ...prev,
              sortOrder: Number(event.target.value)
            })), placeholder: "Sort order", className: "w-full rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-zinc-100" }),
            /* @__PURE__ */ jsxs("label", { className: "inline-flex items-center gap-2 rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-200", children: [
              /* @__PURE__ */ jsx("input", { type: "checkbox", checked: merchForm.isActive, onChange: (event) => setMerchForm((prev) => ({
                ...prev,
                isActive: event.target.checked
              })) }),
              "Active"
            ] })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap gap-3", children: [
            /* @__PURE__ */ jsx("button", { type: "submit", disabled: savingMerch, className: "rounded-lg bg-orange-300 px-4 py-2.5 font-semibold text-zinc-950 transition hover:bg-orange-200 disabled:opacity-70", children: savingMerch ? "Saving..." : merchForm.id ? "Update Item" : "Create Item" }),
            merchForm.id ? /* @__PURE__ */ jsx("button", { type: "button", onClick: () => setMerchForm(emptyMerchForm), className: "rounded-lg border border-zinc-100/30 px-4 py-2.5 font-semibold text-zinc-100", children: "Cancel Edit" }) : null
          ] })
        ] }),
        !loading ? /* @__PURE__ */ jsx("div", { className: "mt-6 space-y-3", children: merchItems.map((item) => /* @__PURE__ */ jsx("div", { className: "rounded-lg border border-zinc-200/15 bg-zinc-950/50 p-3", children: /* @__PURE__ */ jsxs("div", { className: "flex items-start justify-between gap-3", children: [
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("p", { className: "font-semibold text-zinc-50", children: item.name }),
            /* @__PURE__ */ jsx("p", { className: "text-sm text-zinc-300", children: item.price }),
            /* @__PURE__ */ jsx("p", { className: "mt-1 text-xs text-zinc-400", children: item.description }),
            /* @__PURE__ */ jsxs("p", { className: "mt-1 text-xs text-zinc-500", children: [
              "Sort: ",
              item.sort_order,
              " · ",
              item.is_active ? "Active" : "Inactive"
            ] })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "flex gap-2", children: [
            /* @__PURE__ */ jsx("button", { type: "button", onClick: () => setMerchForm({
              id: item.id,
              name: item.name,
              price: item.price,
              description: item.description,
              sortOrder: item.sort_order,
              isActive: item.is_active
            }), className: "rounded border border-zinc-100/25 px-3 py-1 text-xs font-semibold text-zinc-100", children: "Edit" }),
            /* @__PURE__ */ jsx("button", { type: "button", onClick: () => {
              void handleDeleteMerch(item.id);
            }, className: "rounded border border-rose-300/40 px-2 py-1 text-rose-200", children: /* @__PURE__ */ jsx(Trash2, { size: 14 }) })
          ] })
        ] }) }, item.id)) }) : null
      ] }),
      /* @__PURE__ */ jsxs("article", { className: "rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-6", children: [
        /* @__PURE__ */ jsxs("div", { className: "mb-4 flex items-center gap-2 text-orange-100", children: [
          /* @__PURE__ */ jsx(Store, { size: 18 }),
          /* @__PURE__ */ jsx("h2", { className: "text-xl font-bold text-zinc-50", children: "Membership Plans" })
        ] }),
        /* @__PURE__ */ jsxs("form", { onSubmit: handleSavePlan, className: "space-y-3", children: [
          /* @__PURE__ */ jsxs("div", { className: "grid gap-3 sm:grid-cols-2", children: [
            /* @__PURE__ */ jsx("input", { type: "text", value: planForm.slug, onChange: (event) => setPlanForm((prev) => ({
              ...prev,
              slug: event.target.value
            })), placeholder: "slug (e.g. all-access)", required: true, className: "w-full rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-zinc-100" }),
            /* @__PURE__ */ jsx("input", { type: "text", value: planForm.name, onChange: (event) => setPlanForm((prev) => ({
              ...prev,
              name: event.target.value
            })), placeholder: "Plan name", required: true, className: "w-full rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-zinc-100" })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "grid gap-3 sm:grid-cols-2", children: [
            /* @__PURE__ */ jsx("input", { type: "text", value: planForm.displayPrice, onChange: (event) => setPlanForm((prev) => ({
              ...prev,
              displayPrice: event.target.value
            })), placeholder: "$19/mo", required: true, className: "w-full rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-zinc-100" }),
            /* @__PURE__ */ jsx("input", { type: "number", min: 0, value: planForm.priceCents, onChange: (event) => setPlanForm((prev) => ({
              ...prev,
              priceCents: Number(event.target.value)
            })), placeholder: "1900", required: true, className: "w-full rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-zinc-100" })
          ] }),
          /* @__PURE__ */ jsx("textarea", { value: planForm.description, onChange: (event) => setPlanForm((prev) => ({
            ...prev,
            description: event.target.value
          })), placeholder: "Description", required: true, className: "min-h-24 w-full rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-zinc-100" }),
          /* @__PURE__ */ jsx("textarea", { value: planForm.featuresText, onChange: (event) => setPlanForm((prev) => ({
            ...prev,
            featuresText: event.target.value
          })), placeholder: "Features (one per line)", required: true, className: "min-h-24 w-full rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-zinc-100" }),
          /* @__PURE__ */ jsxs("div", { className: "grid gap-3 sm:grid-cols-2", children: [
            /* @__PURE__ */ jsx("input", { type: "number", min: 0, value: planForm.sortOrder, onChange: (event) => setPlanForm((prev) => ({
              ...prev,
              sortOrder: Number(event.target.value)
            })), placeholder: "Sort order", className: "w-full rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-zinc-100" }),
            /* @__PURE__ */ jsxs("label", { className: "inline-flex items-center gap-2 rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-200", children: [
              /* @__PURE__ */ jsx("input", { type: "checkbox", checked: planForm.isActive, onChange: (event) => setPlanForm((prev) => ({
                ...prev,
                isActive: event.target.checked
              })) }),
              "Active"
            ] })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap gap-3", children: [
            /* @__PURE__ */ jsx("button", { type: "submit", disabled: savingPlan, className: "rounded-lg bg-orange-300 px-4 py-2.5 font-semibold text-zinc-950 transition hover:bg-orange-200 disabled:opacity-70", children: savingPlan ? "Saving..." : planForm.id ? "Update Plan" : "Create Plan" }),
            planForm.id ? /* @__PURE__ */ jsx("button", { type: "button", onClick: () => setPlanForm(emptyPlanForm), className: "rounded-lg border border-zinc-100/30 px-4 py-2.5 font-semibold text-zinc-100", children: "Cancel Edit" }) : null
          ] })
        ] }),
        !loading ? /* @__PURE__ */ jsx("div", { className: "mt-6 space-y-3", children: membershipPlans.map((plan) => /* @__PURE__ */ jsx("div", { className: "rounded-lg border border-zinc-200/15 bg-zinc-950/50 p-3", children: /* @__PURE__ */ jsxs("div", { className: "flex items-start justify-between gap-3", children: [
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsxs("p", { className: "font-semibold text-zinc-50", children: [
              plan.name,
              " (",
              plan.slug,
              ")"
            ] }),
            /* @__PURE__ */ jsxs("p", { className: "text-sm text-zinc-300", children: [
              plan.display_price,
              " · ",
              plan.price_cents,
              " cents"
            ] }),
            /* @__PURE__ */ jsx("p", { className: "mt-1 text-xs text-zinc-400", children: plan.description }),
            /* @__PURE__ */ jsx("p", { className: "mt-1 text-xs text-zinc-400", children: plan.features.join(" | ") }),
            /* @__PURE__ */ jsxs("p", { className: "mt-1 text-xs text-zinc-500", children: [
              "Sort: ",
              plan.sort_order,
              " · ",
              plan.is_active ? "Active" : "Inactive"
            ] })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "flex gap-2", children: [
            /* @__PURE__ */ jsx("button", { type: "button", onClick: () => setPlanForm({
              id: plan.id,
              slug: plan.slug,
              name: plan.name,
              displayPrice: plan.display_price,
              priceCents: plan.price_cents,
              description: plan.description,
              featuresText: plan.features.join("\n"),
              sortOrder: plan.sort_order,
              isActive: plan.is_active
            }), className: "rounded border border-zinc-100/25 px-3 py-1 text-xs font-semibold text-zinc-100", children: "Edit" }),
            /* @__PURE__ */ jsx("button", { type: "button", onClick: () => {
              void handleDeletePlan(plan.id);
            }, className: "rounded border border-rose-300/40 px-2 py-1 text-rose-200", children: /* @__PURE__ */ jsx(Trash2, { size: 14 }) })
          ] })
        ] }) }, plan.id)) }) : null
      ] })
    ] }),
    /* @__PURE__ */ jsx("section", { className: "grid gap-5", children: /* @__PURE__ */ jsxs(Link, { to: "/merch", className: "rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-5 transition hover:border-orange-300/40", children: [
      /* @__PURE__ */ jsx("div", { className: "mb-3 inline-flex rounded-md border border-zinc-200/20 bg-zinc-950/70 p-2 text-orange-200", children: /* @__PURE__ */ jsx(ShoppingBag, { size: 18 }) }),
      /* @__PURE__ */ jsx("h2", { className: "text-xl font-bold text-zinc-50", children: "Open Merch Page" }),
      /* @__PURE__ */ jsx("p", { className: "mt-2 text-sm text-zinc-300", children: "Preview public merch items after saving changes." })
    ] }) })
  ] }) });
}
export {
  AdminShopPage as component
};
