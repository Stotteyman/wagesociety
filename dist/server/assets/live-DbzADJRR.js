import { jsx, jsxs } from "react/jsx-runtime";
import { Link } from "@tanstack/react-router";
import { RadioTower, ExternalLink } from "lucide-react";
import { useState, useEffect } from "react";
import { c as authedFetch } from "./router-CSiXPOJe.js";
import "@supabase/supabase-js";
import "stripe";
import "node:fs/promises";
import "node:path";
import "zod";
import "node:crypto";
function LivePage() {
  const [streams, setStreams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [canManage, setCanManage] = useState(false);
  const [canUseAutoclipper, setCanUseAutoclipper] = useState(false);
  const [autoclipperError, setAutoclipperError] = useState("");
  const [autoJobs, setAutoJobs] = useState([]);
  const [autoLoading, setAutoLoading] = useState(true);
  const [autoBusy, setAutoBusy] = useState(false);
  const [updatingJobId, setUpdatingJobId] = useState(null);
  const formatNumber = (value) => {
    if (value === null || Number.isNaN(value)) return "Unknown";
    return new Intl.NumberFormat().format(value);
  };
  const formatStreamLabel = (stream) => {
    if (stream.title) return stream.title;
    if (stream.platform !== "youtube") {
      return `${stream.platform.toUpperCase()} · ${stream.stream_key}`;
    }
    if (stream.stream_key.startsWith("handle:")) {
      return `YOUTUBE · ${stream.stream_key.slice("handle:".length)}`;
    }
    if (stream.stream_key.startsWith("channel:")) {
      return `YOUTUBE · Channel ${stream.stream_key.slice("channel:".length)}`;
    }
    if (stream.stream_key.startsWith("user:")) {
      return `YOUTUBE · ${stream.stream_key.slice("user:".length)}`;
    }
    if (stream.stream_key.startsWith("custom:")) {
      return `YOUTUBE · ${stream.stream_key.slice("custom:".length)}`;
    }
    return `YOUTUBE · ${stream.stream_key}`;
  };
  const loadStreams = async () => {
    try {
      setError("");
      const response = await authedFetch("/api/live/streams");
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || "Failed to load livestreams");
        return;
      }
      const liveData = data;
      setStreams(liveData.streams || []);
      setCanManage(liveData.canManage);
      setCanUseAutoclipper(Boolean(liveData.canUseAutoclipper));
      return Boolean(liveData.canUseAutoclipper);
    } catch {
      setError("Failed to load livestreams");
      return false;
    }
  };
  const loadAutoclipperJobs = async () => {
    try {
      setAutoclipperError("");
      const response = await authedFetch("/api/live/clips");
      const data = await response.json();
      if (!response.ok) {
        setAutoclipperError(data.error || "Failed to load autoclipper queue");
        return;
      }
      setAutoJobs(data.jobs || []);
    } catch {
      setAutoclipperError("Failed to load autoclipper queue");
    } finally {
      setAutoLoading(false);
    }
  };
  useEffect(() => {
    void (async () => {
      setLoading(true);
      const hasAutoclipperAccess = await loadStreams();
      if (hasAutoclipperAccess) {
        await loadAutoclipperJobs();
      } else {
        setAutoJobs([]);
        setAutoLoading(false);
      }
      setLoading(false);
    })();
  }, []);
  const triggerAutoclip = async () => {
    try {
      setAutoBusy(true);
      setError("");
      const response = await authedFetch("/api/live/clips", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          commandText: "!clip",
          autoPost: true,
          autoCaption: true,
          platforms: ["x", "kick", "instagram"],
          clipWindowMinutes: 5
        })
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || "Failed to trigger autoclip");
        return;
      }
      await loadAutoclipperJobs();
    } catch {
      setError("Failed to trigger autoclip");
    } finally {
      setAutoBusy(false);
    }
  };
  const updateAutoclipStatus = async (id, status) => {
    try {
      setUpdatingJobId(id);
      setError("");
      const response = await authedFetch("/api/live/clips", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          id,
          status
        })
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || "Failed to update clip status");
        return;
      }
      await loadAutoclipperJobs();
    } catch {
      setError("Failed to update clip status");
    } finally {
      setUpdatingJobId(null);
    }
  };
  return /* @__PURE__ */ jsx("div", { className: "min-h-screen px-4 py-12 text-zinc-100", children: /* @__PURE__ */ jsxs("div", { className: "mx-auto max-w-6xl space-y-6", children: [
    /* @__PURE__ */ jsx("header", { className: "rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-6 md:p-8", children: /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap items-center justify-between gap-4", children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("p", { className: "text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400", children: "Live Control Center" }),
        /* @__PURE__ */ jsx("h1", { className: "mt-2 text-3xl font-black text-zinc-50 md:text-4xl", children: "Organization Livestreams" }),
        /* @__PURE__ */ jsx("p", { className: "mt-3 max-w-2xl text-zinc-300", children: "Streams are pulled automatically from member-linked Kick, Twitch, and YouTube accounts." })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "flex gap-3", children: [
        /* @__PURE__ */ jsx(Link, { to: "/dashboard", className: "rounded-lg border border-zinc-100/25 px-4 py-2 text-sm font-semibold text-zinc-100 transition hover:border-orange-200/70 hover:text-orange-100", children: "Home" }),
        /* @__PURE__ */ jsx(Link, { to: "/dashboard", className: "rounded-lg border border-zinc-100/25 px-4 py-2 text-sm font-semibold text-zinc-100 transition hover:border-orange-200/70 hover:text-orange-100", children: "Dashboard" })
      ] })
    ] }) }),
    error ? /* @__PURE__ */ jsx("p", { className: "rounded-lg border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200", children: error }) : null,
    canUseAutoclipper ? /* @__PURE__ */ jsxs("section", { className: "rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-6", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap items-start justify-between gap-3", children: [
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("h2", { className: "text-xl font-bold text-zinc-50", children: "Autoclipper" }),
          /* @__PURE__ */ jsxs("p", { className: "mt-2 text-sm text-zinc-300", children: [
            "Chat users run ",
            /* @__PURE__ */ jsx("span", { className: "font-semibold text-orange-200", children: "!clip" }),
            " and the bot auto-creates a 5-minute clip job, auto-captions it, and auto-queues social posts."
          ] }),
          /* @__PURE__ */ jsx("p", { className: "mt-2 text-xs text-zinc-500", children: "Discord/chat bot integration endpoint: /api/live/clips (header x-autoclipper-secret required)." })
        ] }),
        /* @__PURE__ */ jsx("button", { type: "button", onClick: () => {
          void triggerAutoclip();
        }, disabled: autoBusy, className: "rounded-lg bg-orange-300 px-4 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-orange-200 disabled:cursor-not-allowed disabled:opacity-70", children: autoBusy ? "Triggering..." : "Trigger !clip (Test)" })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "mt-4 rounded-xl border border-zinc-200/10 bg-zinc-950/40 p-4", children: [
        /* @__PURE__ */ jsx("p", { className: "text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500", children: "Clip Queue" }),
        autoclipperError ? /* @__PURE__ */ jsx("p", { className: "mt-2 rounded-md border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200", children: autoclipperError }) : null,
        autoLoading ? /* @__PURE__ */ jsx("p", { className: "mt-2 text-sm text-zinc-400", children: "Loading clip jobs..." }) : autoJobs.length === 0 ? /* @__PURE__ */ jsx("p", { className: "mt-2 text-sm text-zinc-500", children: "No clip jobs yet. Send !clip in chat or click Trigger !clip." }) : /* @__PURE__ */ jsx("div", { className: "mt-3 space-y-2", children: autoJobs.map((job) => /* @__PURE__ */ jsx("div", { className: "rounded-lg border border-zinc-200/10 bg-zinc-900/50 p-3", children: /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap items-start justify-between gap-2", children: [
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsxs("p", { className: "text-sm font-semibold text-zinc-100", children: [
              job.command,
              " • ",
              job.clipWindowMinutes,
              "m • ",
              job.source
            ] }),
            /* @__PURE__ */ jsxs("p", { className: "text-xs text-zinc-400", children: [
              "By ",
              job.requestedBy,
              " · Platforms: ",
              job.platforms.join(", ") || "none"
            ] }),
            job.caption ? /* @__PURE__ */ jsx("p", { className: "mt-1 text-xs text-zinc-300", children: job.caption }) : null,
            job.queuedPostId ? /* @__PURE__ */ jsx("p", { className: "mt-1 text-[11px] text-emerald-300", children: "Queued for social posting." }) : null,
            job.clipUrl ? /* @__PURE__ */ jsx("a", { href: String(job.clipUrl), target: "_blank", rel: "noreferrer", className: "mt-1 inline-flex text-xs text-orange-200 hover:text-orange-100", children: "Open clip URL" }) : null
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
            /* @__PURE__ */ jsx("span", { className: `rounded-full px-2 py-0.5 text-xs font-semibold ${job.status === "posted" ? "bg-emerald-300/10 text-emerald-300" : job.status === "failed" ? "bg-rose-300/10 text-rose-300" : job.status === "ready" ? "bg-sky-300/10 text-sky-300" : "bg-zinc-200/10 text-zinc-400"}`, children: job.status }),
            canManage ? /* @__PURE__ */ jsxs("select", { value: job.status, onChange: (event) => {
              void updateAutoclipStatus(job.id, event.target.value);
            }, disabled: updatingJobId === job.id, className: "rounded-md border border-zinc-200/20 bg-zinc-950/70 px-2 py-1 text-xs text-zinc-100 outline-none", children: [
              /* @__PURE__ */ jsx("option", { value: "queued", children: "queued" }),
              /* @__PURE__ */ jsx("option", { value: "processing", children: "processing" }),
              /* @__PURE__ */ jsx("option", { value: "ready", children: "ready" }),
              /* @__PURE__ */ jsx("option", { value: "posted", children: "posted" }),
              /* @__PURE__ */ jsx("option", { value: "failed", children: "failed" })
            ] }) : null
          ] })
        ] }) }, job.id)) })
      ] })
    ] }) : null,
    /* @__PURE__ */ jsxs("section", { className: "space-y-3", children: [
      loading ? /* @__PURE__ */ jsx("p", { className: "text-zinc-300", children: "Loading livestreams..." }) : null,
      !loading && streams.length === 0 ? /* @__PURE__ */ jsx("article", { className: "rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-5 text-zinc-300", children: "No linked livestream profiles found yet." }) : null,
      streams.map((stream) => {
        const isLive = stream.status === "live";
        return /* @__PURE__ */ jsx("article", { className: "rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-5 transition hover:border-orange-300/40", children: /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap items-start justify-between gap-3", children: [
          /* @__PURE__ */ jsxs("a", { href: stream.url, target: "_blank", rel: "noreferrer", className: "group block min-w-0 flex-1", children: [
            /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
              /* @__PURE__ */ jsx(RadioTower, { size: 16, className: isLive ? "text-rose-300" : "text-zinc-400" }),
              /* @__PURE__ */ jsx("p", { className: "truncate text-lg font-semibold text-zinc-50 group-hover:text-orange-100", children: formatStreamLabel(stream) }),
              /* @__PURE__ */ jsx(ExternalLink, { size: 16, className: "text-zinc-400 group-hover:text-orange-200" })
            ] }),
            /* @__PURE__ */ jsx("p", { className: "mt-1 truncate text-sm text-zinc-300", children: stream.url })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "flex flex-col items-end gap-2", children: [
            /* @__PURE__ */ jsx("div", { className: "flex items-center gap-2", children: /* @__PURE__ */ jsx("span", { className: `rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${isLive ? "border-rose-300/60 bg-rose-500/10 text-rose-200" : "border-zinc-500/50 bg-zinc-800/40 text-zinc-300"}`, children: isLive ? "Live" : "Offline" }) }),
            isLive ? /* @__PURE__ */ jsxs("p", { className: "text-xs text-zinc-300", children: [
              "Viewers: ",
              formatNumber(stream.viewer_count)
            ] }) : null
          ] })
        ] }) }, stream.id);
      })
    ] })
  ] }) });
}
export {
  LivePage as component
};
