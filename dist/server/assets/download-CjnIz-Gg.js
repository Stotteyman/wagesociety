import { jsx, jsxs } from "react/jsx-runtime";
import { Smartphone, Download } from "lucide-react";
import { useState, useEffect } from "react";
function DownloadPage() {
  const [apkUrl, setApkUrl] = useState("/wagesociety.apk");
  const [apkVersion, setApkVersion] = useState(null);
  const [apkUpdatedAt, setApkUpdatedAt] = useState(null);
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/public-apk");
        const data = await res.json();
        const release = data.release;
        if (!res.ok || !release?.url) return;
        setApkUrl(release.url);
        setApkVersion(release.version || null);
        setApkUpdatedAt(release.uploadedAt || null);
      } catch {
      }
    })();
  }, []);
  return /* @__PURE__ */ jsx("div", { className: "min-h-screen bg-zinc-950 text-white", children: /* @__PURE__ */ jsxs("div", { className: "mx-auto max-w-2xl px-6 py-20 text-center", children: [
    /* @__PURE__ */ jsx("div", { className: "mb-6 flex justify-center", children: /* @__PURE__ */ jsx("div", { className: "rounded-2xl bg-orange-500/10 p-5 ring-1 ring-orange-500/30", children: /* @__PURE__ */ jsx(Smartphone, { className: "h-12 w-12 text-orange-400" }) }) }),
    /* @__PURE__ */ jsx("h1", { className: "mb-3 text-4xl font-bold tracking-tight", children: "W.A.G.E. Society App" }),
    /* @__PURE__ */ jsx("p", { className: "mb-12 text-lg text-zinc-400", children: "Take the community with you. Access your dashboard, live streams, news, and tools from your mobile device." }),
    /* @__PURE__ */ jsxs("div", { className: "grid gap-4 sm:grid-cols-2", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex flex-col items-center gap-3 rounded-2xl bg-zinc-900 p-8 ring-1 ring-zinc-800", children: [
        /* @__PURE__ */ jsx(AndroidLogo, {}),
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("div", { className: "text-xs font-medium uppercase tracking-widest text-zinc-500", children: "Available for" }),
          /* @__PURE__ */ jsx("div", { className: "text-xl font-bold", children: "Android" })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "w-full", children: [
          /* @__PURE__ */ jsxs("a", { href: apkUrl, download: "wagesociety.apk", className: "group flex items-center justify-center gap-2 rounded-xl bg-zinc-800 px-4 py-3 text-sm font-medium text-zinc-300 ring-1 ring-zinc-700 transition hover:bg-zinc-700 hover:text-white", children: [
            /* @__PURE__ */ jsx(Download, { className: "h-4 w-4" }),
            "Download APK (sideload)"
          ] }),
          apkVersion ? /* @__PURE__ */ jsxs("p", { className: "mt-2 text-xs text-zinc-400", children: [
            "Latest: v",
            apkVersion,
            apkUpdatedAt ? ` · Updated ${new Date(apkUpdatedAt).toLocaleDateString()}` : ""
          ] }) : null
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "flex flex-col items-center gap-3 rounded-2xl bg-zinc-900 p-8 ring-1 ring-zinc-800", children: [
        /* @__PURE__ */ jsx(AppleLogo, {}),
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("div", { className: "text-xs font-medium uppercase tracking-widest text-zinc-500", children: "Install on" }),
          /* @__PURE__ */ jsx("div", { className: "text-xl font-bold", children: "iPhone / iPad" })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "rounded-xl bg-zinc-800 px-4 py-3 ring-1 ring-zinc-700 w-full", children: [
          /* @__PURE__ */ jsx("p", { className: "mb-1 text-xs font-semibold uppercase tracking-wider text-zinc-500", children: "Install via Safari" }),
          /* @__PURE__ */ jsxs("ol", { className: "list-inside list-decimal space-y-1 text-left text-xs text-zinc-400", children: [
            /* @__PURE__ */ jsxs("li", { children: [
              "Open ",
              /* @__PURE__ */ jsx("span", { className: "text-zinc-200", children: "wagesociety.com" }),
              " in Safari"
            ] }),
            /* @__PURE__ */ jsxs("li", { children: [
              "Tap the ",
              /* @__PURE__ */ jsx("span", { className: "text-zinc-200", children: "Share" }),
              " button"
            ] }),
            /* @__PURE__ */ jsxs("li", { children: [
              "Choose ",
              /* @__PURE__ */ jsx("span", { className: "text-zinc-200", children: "Add to Home Screen" })
            ] })
          ] })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "mt-8 rounded-xl bg-zinc-900 px-6 py-4 text-left ring-1 ring-zinc-800", children: [
      /* @__PURE__ */ jsx("p", { className: "mb-1 text-sm font-semibold text-orange-400", children: "APK sideload instructions" }),
      /* @__PURE__ */ jsxs("ol", { className: "list-inside list-decimal space-y-1 text-sm text-zinc-400", children: [
        /* @__PURE__ */ jsxs("li", { children: [
          "Tap ",
          /* @__PURE__ */ jsx("span", { className: "font-medium text-white", children: "Download APK" }),
          " above."
        ] }),
        /* @__PURE__ */ jsx("li", { children: "Open the file from your notification bar or file manager." }),
        /* @__PURE__ */ jsxs("li", { children: [
          "If prompted, go to",
          " ",
          /* @__PURE__ */ jsx("span", { className: "font-medium text-white", children: "Settings → Apps → Special app access → Install unknown apps" }),
          " ",
          "and allow your browser or file manager."
        ] }),
        /* @__PURE__ */ jsxs("li", { children: [
          "Tap ",
          /* @__PURE__ */ jsx("span", { className: "font-medium text-white", children: "Install" }),
          " and launch the app."
        ] })
      ] })
    ] })
  ] }) });
}
function AndroidLogo() {
  return /* @__PURE__ */ jsx("svg", { viewBox: "0 0 24 24", className: "h-10 w-10 fill-[#3DDC84]", "aria-label": "Android", children: /* @__PURE__ */ jsx("path", { d: "M17.523 15.341a.9.9 0 1 1-.001 1.8.9.9 0 0 1 0-1.8m-11.046 0a.9.9 0 1 1 0 1.801.9.9 0 0 1 0-1.8M17.7 9.3l1.575-2.727a.328.328 0 0 0-.12-.449.328.328 0 0 0-.449.12l-1.595 2.762A9.83 9.83 0 0 0 12 8.1c-1.476 0-2.876.316-4.112.906L6.294 6.244a.328.328 0 0 0-.449-.12.328.328 0 0 0-.12.449L7.3 9.3C4.91 10.664 3.3 13.193 3.3 16.1h17.4c0-2.907-1.61-5.436-3-6.8" }) });
}
function AppleLogo() {
  return /* @__PURE__ */ jsx("svg", { viewBox: "0 0 24 24", className: "h-10 w-10 fill-zinc-400", "aria-label": "Apple", children: /* @__PURE__ */ jsx("path", { d: "M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11" }) });
}
export {
  DownloadPage as component
};
