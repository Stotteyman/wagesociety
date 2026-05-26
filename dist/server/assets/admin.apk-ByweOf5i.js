import { jsx, jsxs } from "react/jsx-runtime";
import { useState, useEffect } from "react";
import { c as authedFetch } from "./router-CSiXPOJe.js";
import "@tanstack/react-router";
import "@supabase/supabase-js";
import "lucide-react";
import "stripe";
import "node:fs/promises";
import "node:path";
import "zod";
import "node:crypto";
function AdminApkPage() {
  const [file, setFile] = useState(null);
  const [version, setVersion] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [latest, setLatest] = useState(null);
  const loadLatest = async () => {
    setError("");
    try {
      const res = await authedFetch("/api/admin/apk-release");
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to load latest release metadata.");
        return;
      }
      setLatest(data.release || null);
    } catch {
      setError("Failed to load latest release metadata.");
    }
  };
  useEffect(() => {
    void loadLatest();
  }, []);
  const handleUpload = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");
    if (!file) {
      setError("Please choose an APK file.");
      return;
    }
    if (!version.trim()) {
      setError("Please provide a release version (e.g. 1.0.7).");
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("version", version.trim());
      form.append("notes", notes.trim());
      const res = await authedFetch("/api/admin/apk-release", {
        method: "POST",
        body: form
      });
      const data = await res.json();
      if (!res.ok || !data.release) {
        setError(data.error || "Upload failed.");
        return;
      }
      setLatest(data.release);
      setSuccess("APK uploaded and latest download metadata updated successfully.");
      setFile(null);
      setVersion("");
      setNotes("");
    } catch {
      setError("Upload failed.");
    } finally {
      setBusy(false);
    }
  };
  return /* @__PURE__ */ jsx("div", { className: "min-h-screen px-4 py-12 text-zinc-100", children: /* @__PURE__ */ jsxs("div", { className: "mx-auto max-w-3xl space-y-6", children: [
    /* @__PURE__ */ jsxs("header", { className: "rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-6", children: [
      /* @__PURE__ */ jsx("p", { className: "text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400", children: "Admin / Mobile" }),
      /* @__PURE__ */ jsx("h1", { className: "mt-2 text-3xl font-black text-zinc-50", children: "Android APK Release Manager" }),
      /* @__PURE__ */ jsx("p", { className: "mt-2 text-zinc-300", children: "Upload a new APK and this immediately updates the Download page without redeploying the website." })
    ] }),
    /* @__PURE__ */ jsxs("section", { className: "rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-6", children: [
      /* @__PURE__ */ jsx("h2", { className: "text-lg font-bold text-zinc-50", children: "Current Live APK" }),
      latest ? /* @__PURE__ */ jsxs("div", { className: "mt-3 space-y-1 text-sm text-zinc-300", children: [
        /* @__PURE__ */ jsxs("p", { children: [
          /* @__PURE__ */ jsx("span", { className: "text-zinc-400", children: "Version:" }),
          " ",
          latest.version
        ] }),
        /* @__PURE__ */ jsxs("p", { children: [
          /* @__PURE__ */ jsx("span", { className: "text-zinc-400", children: "File:" }),
          " ",
          latest.fileName
        ] }),
        /* @__PURE__ */ jsxs("p", { children: [
          /* @__PURE__ */ jsx("span", { className: "text-zinc-400", children: "Uploaded:" }),
          " ",
          new Date(latest.uploadedAt).toLocaleString()
        ] }),
        /* @__PURE__ */ jsxs("p", { children: [
          /* @__PURE__ */ jsx("span", { className: "text-zinc-400", children: "Size:" }),
          " ",
          (latest.fileSizeBytes / (1024 * 1024)).toFixed(2),
          " MB"
        ] }),
        /* @__PURE__ */ jsx("a", { href: latest.url, target: "_blank", rel: "noreferrer", className: "text-orange-200 hover:text-orange-100", children: "Open current APK URL" })
      ] }) : /* @__PURE__ */ jsx("p", { className: "mt-2 text-sm text-zinc-400", children: "No uploaded APK metadata found yet." })
    ] }),
    /* @__PURE__ */ jsxs("form", { onSubmit: handleUpload, className: "rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-6 space-y-4", children: [
      /* @__PURE__ */ jsx("h2", { className: "text-lg font-bold text-zinc-50", children: "Upload New APK" }),
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("label", { className: "mb-1 block text-sm text-zinc-300", children: "Release Version" }),
        /* @__PURE__ */ jsx("input", { type: "text", value: version, onChange: (e) => setVersion(e.target.value), placeholder: "e.g. 1.0.7", className: "w-full rounded-lg border border-zinc-200/20 bg-zinc-950/50 px-3 py-2 text-sm text-zinc-100" })
      ] }),
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("label", { className: "mb-1 block text-sm text-zinc-300", children: "Release Notes (optional)" }),
        /* @__PURE__ */ jsx("textarea", { value: notes, onChange: (e) => setNotes(e.target.value), rows: 3, className: "w-full rounded-lg border border-zinc-200/20 bg-zinc-950/50 px-3 py-2 text-sm text-zinc-100" })
      ] }),
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("label", { className: "mb-1 block text-sm text-zinc-300", children: "APK File" }),
        /* @__PURE__ */ jsx("input", { type: "file", accept: ".apk,application/vnd.android.package-archive", onChange: (e) => setFile(e.target.files?.[0] || null), className: "w-full rounded-lg border border-zinc-200/20 bg-zinc-950/50 px-3 py-2 text-sm text-zinc-100" })
      ] }),
      error ? /* @__PURE__ */ jsx("p", { className: "text-sm text-rose-300", children: error }) : null,
      success ? /* @__PURE__ */ jsx("p", { className: "text-sm text-emerald-300", children: success }) : null,
      /* @__PURE__ */ jsx("button", { type: "submit", disabled: busy, className: "rounded-lg bg-orange-300 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-orange-200 disabled:opacity-70", children: busy ? "Uploading..." : "Upload and Publish APK" })
    ] })
  ] }) });
}
export {
  AdminApkPage as component
};
