import { useNavigate, Link, createRootRoute, HeadContent, Scripts, createFileRoute, lazyRouteComponent, redirect, notFound, createRouter } from "@tanstack/react-router";
import { jsxs, jsx, Fragment } from "react/jsx-runtime";
import { useState, useEffect, useMemo } from "react";
import { createClient } from "@supabase/supabase-js";
import { UserCircle, LogOut, X, Menu } from "lucide-react";
import Stripe from "stripe";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { timingSafeEqual } from "node:crypto";
const LEGAL_POLICY_VERSION = "2026.05.05";
const LEGAL_POLICY_LAST_UPDATED = "May 5, 2026";
const LEGAL_POLICY_CHANGELOG = [
  {
    version: "2026.05.05",
    date: "May 5, 2026",
    summary: "Initial publication of Privacy Policy and Terms of Service covering accounts, auth providers, payments, and community features."
  }
];
const ACCEPTANCE_STORAGE_KEY = "wage.legalPolicyAcceptance";
function readPolicyAcceptance() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(ACCEPTANCE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.version !== "string" || typeof parsed.acceptedAtIso !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}
function writePolicyAcceptance(source) {
  if (typeof window === "undefined") return;
  const record = {
    version: LEGAL_POLICY_VERSION,
    acceptedAtIso: (/* @__PURE__ */ new Date()).toISOString(),
    source
  };
  window.localStorage.setItem(ACCEPTANCE_STORAGE_KEY, JSON.stringify(record));
}
const ORG_ROLES = [
  "superadmin",
  "admin",
  "manager",
  "staff",
  "moderator",
  "helper",
  "user",
  "banned"
];
const ORG_ROLE_LABELS = {
  superadmin: "Superadmin",
  admin: "Admin",
  manager: "Manager",
  staff: "Staff",
  moderator: "Moderator",
  helper: "Helper",
  user: "User",
  banned: "Banned"
};
const ORG_ROLE_RANK = {
  superadmin: 0,
  admin: 1,
  manager: 2,
  staff: 3,
  moderator: 4,
  helper: 5,
  user: 6,
  banned: 7
};
function isOrgRole(value) {
  return ORG_ROLES.includes(value);
}
function canManageRole(actorRole, targetRole) {
  if (actorRole === "superadmin") {
    return true;
  }
  if (actorRole === "banned") {
    return false;
  }
  return ORG_ROLE_RANK[actorRole] < ORG_ROLE_RANK[targetRole];
}
function formatRoleLabel(role) {
  return ORG_ROLE_LABELS[role];
}
const VIEW_AS_ROLE_STORAGE_KEY = "wage_society_view_as_role";
function getStoredViewAsRole() {
  if (typeof window === "undefined") return null;
  const value = window.localStorage.getItem(VIEW_AS_ROLE_STORAGE_KEY);
  if (!value || !isOrgRole(value)) {
    return null;
  }
  return value;
}
function setStoredViewAsRole(role) {
  if (typeof window === "undefined") return;
  if (!role) {
    window.localStorage.removeItem(VIEW_AS_ROLE_STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(VIEW_AS_ROLE_STORAGE_KEY, role);
}
let supabaseBrowserClient = null;
function getSupabaseBrowserClient() {
  if (supabaseBrowserClient) return supabaseBrowserClient;
  const supabaseUrl2 = "https://example.supabase.co";
  const supabasePublishableKey = "sb_publishable_test";
  supabaseBrowserClient = createClient(supabaseUrl2, supabasePublishableKey);
  return supabaseBrowserClient;
}
async function getSupabaseAccessToken() {
  const supabase = getSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || null;
}
async function authedFetch(input, init) {
  const token = await getSupabaseAccessToken();
  const headers = new Headers(init?.headers);
  const viewAsRole = getStoredViewAsRole();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  if (viewAsRole) {
    headers.set("x-view-as-role", viewAsRole);
  }
  return fetch(input, {
    ...init,
    headers
  });
}
const KICK_OAUTH_SCOPES = "user:profile";
const KICK_OAUTH_QUERY_PARAMS = {
  prompt: "consent"
};
async function getIdentityLinkUrl(provider, redirectTo, options) {
  const token = await getSupabaseAccessToken();
  if (!token) {
    throw new Error("No active session. Please log out and log back in, then try again.");
  }
  const supabaseUrl2 = "https://example.supabase.co";
  const anonKey = "sb_publishable_test";
  const params = new URLSearchParams({
    provider,
    redirect_to: redirectTo,
    skip_http_redirect: "true"
  });
  if (options?.scopes) {
    params.set("scopes", options.scopes);
  }
  if (options?.queryParams) {
    for (const [key, value] of Object.entries(options.queryParams)) {
      params.set(key, value);
    }
  }
  const response = await fetch(`${supabaseUrl2}/auth/v1/user/identities/authorize?${params.toString()}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: anonKey
    }
  });
  const data = await response.json();
  if (!response.ok || !data.url) {
    throw new Error(data.error_description || data.msg || `Could not start ${provider} account linking.`);
  }
  return data.url;
}
const navLinks = [
  { label: "Shop", to: "/merch" },
  { label: "Livestream", to: "/live" },
  { label: "Directory", to: "/directory" },
  { label: "Blog", to: "/news" }
];
function SiteHeader() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const navigate = useNavigate();
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    const checkAuth = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        setUser(data.session?.user || null);
      } catch {
        setUser(null);
      } finally {
        setAuthLoading(false);
      }
    };
    void checkAuth();
    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
      setAuthLoading(false);
    });
    const handleResume = () => {
      void checkAuth();
    };
    if (typeof window !== "undefined") {
      window.addEventListener("focus", handleResume);
      document.addEventListener("visibilitychange", handleResume);
    }
    return () => {
      subscription.unsubscribe();
      if (typeof window !== "undefined") {
        window.removeEventListener("focus", handleResume);
        document.removeEventListener("visibilitychange", handleResume);
      }
    };
  }, []);
  const handleLogout = async () => {
    try {
      const supabase = getSupabaseBrowserClient();
      await supabase.auth.signOut();
      setUser(null);
      setMobileMenuOpen(false);
      await navigate({ to: "/" });
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };
  return /* @__PURE__ */ jsxs("header", { className: "sticky top-3 z-20 rounded-2xl border border-zinc-200/15 bg-zinc-900/90 p-3 backdrop-blur", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between gap-3", children: [
      /* @__PURE__ */ jsx(Link, { to: "/", className: "text-sm font-black tracking-[0.16em] text-orange-200 sm:text-base", children: "W.A.G.E. SOCIETY" }),
      /* @__PURE__ */ jsx("nav", { className: "hidden items-center gap-2 md:flex", children: navLinks.map((item) => /* @__PURE__ */ jsx(
        Link,
        {
          to: item.to,
          className: "rounded-lg px-3 py-2 text-sm font-medium text-zinc-300 transition hover:bg-zinc-800 hover:text-zinc-100",
          children: item.label
        },
        item.to
      )) }),
      /* @__PURE__ */ jsx("div", { className: "hidden items-center gap-2 md:flex", children: authLoading ? /* @__PURE__ */ jsx("div", { className: "h-8 w-32 animate-pulse rounded-lg bg-zinc-800" }) : user ? /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsxs(
          Link,
          {
            to: "/dashboard",
            className: "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-zinc-100 transition hover:bg-zinc-800",
            children: [
              /* @__PURE__ */ jsx(UserCircle, { size: 15 }),
              " Profile"
            ]
          }
        ),
        /* @__PURE__ */ jsxs(
          "button",
          {
            type: "button",
            onClick: handleLogout,
            className: "inline-flex items-center gap-2 rounded-lg bg-orange-300 px-3 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-orange-200",
            children: [
              /* @__PURE__ */ jsx(LogOut, { size: 15 }),
              " Logout"
            ]
          }
        )
      ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx(
          Link,
          {
            to: "/login",
            className: "rounded-lg border border-zinc-100/20 px-3 py-2 text-sm font-semibold text-zinc-100 transition hover:border-orange-200/70",
            children: "Login"
          }
        ),
        /* @__PURE__ */ jsx(
          Link,
          {
            to: "/signup",
            className: "rounded-lg bg-orange-300 px-3 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-orange-200",
            children: "Sign Up"
          }
        )
      ] }) }),
      /* @__PURE__ */ jsx(
        "button",
        {
          type: "button",
          onClick: () => setMobileMenuOpen((value) => !value),
          className: "inline-flex items-center justify-center rounded-lg border border-zinc-100/20 p-2 text-zinc-100 md:hidden",
          "aria-label": "Toggle menu",
          "aria-expanded": mobileMenuOpen,
          children: mobileMenuOpen ? /* @__PURE__ */ jsx(X, { size: 18 }) : /* @__PURE__ */ jsx(Menu, { size: 18 })
        }
      )
    ] }),
    mobileMenuOpen ? /* @__PURE__ */ jsxs("div", { className: "mt-3 grid gap-2 border-t border-zinc-200/15 pt-3 md:hidden", children: [
      navLinks.map((item) => /* @__PURE__ */ jsx(
        Link,
        {
          to: item.to,
          onClick: () => setMobileMenuOpen(false),
          className: "rounded-lg bg-zinc-800/80 px-3 py-2 text-sm font-medium text-zinc-100",
          children: item.label
        },
        item.to
      )),
      /* @__PURE__ */ jsx("div", { className: "mt-1 grid grid-cols-2 gap-2", children: authLoading ? /* @__PURE__ */ jsx("div", { className: "col-span-2 h-9 animate-pulse rounded-lg bg-zinc-800" }) : user ? /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx(
          Link,
          {
            to: "/dashboard",
            onClick: () => setMobileMenuOpen(false),
            className: "rounded-lg bg-zinc-800/80 px-3 py-2 text-center text-sm font-semibold text-zinc-100",
            children: "Profile"
          }
        ),
        /* @__PURE__ */ jsx(
          "button",
          {
            type: "button",
            onClick: handleLogout,
            className: "rounded-lg bg-orange-300 px-3 py-2 text-center text-sm font-semibold text-zinc-950",
            children: "Logout"
          }
        )
      ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx(
          Link,
          {
            to: "/login",
            onClick: () => setMobileMenuOpen(false),
            className: "rounded-lg border border-zinc-100/20 px-3 py-2 text-center text-sm font-semibold text-zinc-100",
            children: "Login"
          }
        ),
        /* @__PURE__ */ jsx(
          Link,
          {
            to: "/signup",
            onClick: () => setMobileMenuOpen(false),
            className: "rounded-lg bg-orange-300 px-3 py-2 text-center text-sm font-semibold text-zinc-950",
            children: "Sign Up"
          }
        )
      ] }) })
    ] }) : null
  ] });
}
function OAuthCallbackHandler() {
  const [processed, setProcessed] = useState(false);
  const postPopupResult = (payload) => {
    if (!window.opener || window.opener.closed) return;
    window.opener.postMessage(
      {
        type: "oauth-link-complete",
        ...payload
      },
      window.location.origin
    );
  };
  useEffect(() => {
    if (typeof window === "undefined" || processed) return;
    const handleCallback = async () => {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const linkedProvider = urlParams.get("linked");
        console.log("[OAuthCallbackHandler] URL search:", window.location.search);
        console.log("[OAuthCallbackHandler] linkedProvider:", linkedProvider);
        if (!linkedProvider) return;
        const supabase = getSupabaseBrowserClient();
        const hash = window.location.hash.slice(1);
        const code = urlParams.get("code");
        console.log("[OAuthCallbackHandler] hash:", hash);
        console.log("[OAuthCallbackHandler] code:", code);
        let accessToken = null;
        let refreshToken = null;
        if (hash) {
          const params = new URLSearchParams(hash);
          accessToken = params.get("access_token");
          refreshToken = params.get("refresh_token");
          console.log("[OAuthCallbackHandler] Extracted tokens from hash:", { hasAccessToken: !!accessToken, hasRefreshToken: !!refreshToken });
        }
        if (!accessToken && !refreshToken && code) {
          console.log("[OAuthCallbackHandler] Exchanging code for session");
          const { data: exchangeData, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) {
            console.error("[OAuthCallbackHandler] Code exchange error:", exchangeError);
            postPopupResult({
              status: "error",
              provider: linkedProvider,
              message: exchangeError.message
            });
            return;
          }
          accessToken = exchangeData.session?.access_token || null;
          refreshToken = exchangeData.session?.refresh_token || null;
          console.log("[OAuthCallbackHandler] Code exchange success:", { hasAccessToken: !!accessToken, hasRefreshToken: !!refreshToken });
        }
        if (accessToken && refreshToken) {
          console.log("[OAuthCallbackHandler] Setting session with tokens");
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken
          });
          if (error) {
            console.error("[OAuthCallbackHandler] Failed to set session:", error);
            postPopupResult({
              status: "error",
              provider: linkedProvider,
              message: error.message
            });
            return;
          }
          const { data } = await supabase.auth.getUser();
          if (data?.user) {
            console.log("[OAuthCallbackHandler] Identity linking successful. User identities:", data.user.identities);
            setProcessed(true);
            const redirectUrl2 = `/settings?linked=${linkedProvider}`;
            if (window.opener && !window.opener.closed) {
              console.log("[OAuthCallbackHandler] Posting success to opener and closing popup");
              postPopupResult({
                status: "success",
                provider: linkedProvider,
                accessToken,
                refreshToken
              });
              window.close();
              return;
            }
            window.location.href = redirectUrl2;
          }
          return;
        }
        const { data: fallbackUserData, error: fallbackUserError } = await supabase.auth.getUser();
        if (fallbackUserError || !fallbackUserData?.user) {
          postPopupResult({
            status: "error",
            provider: linkedProvider,
            message: fallbackUserError?.message || "OAuth callback completed without a valid session."
          });
          return;
        }
        setProcessed(true);
        const redirectUrl = `/settings?linked=${linkedProvider}`;
        if (window.opener && !window.opener.closed) {
          postPopupResult({
            status: "success",
            provider: linkedProvider
          });
          window.close();
          return;
        }
        window.location.href = redirectUrl;
      } catch (err) {
        console.error("OAuth callback handler error:", err);
        if (typeof window !== "undefined") {
          const linkedProvider = new URLSearchParams(window.location.search).get("linked") || "unknown";
          postPopupResult({
            status: "error",
            provider: linkedProvider,
            message: err instanceof Error ? err.message : "OAuth callback processing failed."
          });
        }
      }
    };
    void handleCallback();
  }, [processed]);
  return null;
}
const SITE_URL = "https://playful-torte-0c9af1.netlify.app";
const SITE_NAME = "W.A.G.E. Society";
const SITE_DESCRIPTION = "A modern organization for content creators, online marketers, and entrepreneurs. Join W.A.G.E. Society for strategy, systems, and community accountability.";
const OG_IMAGE = `${SITE_URL}/og-image.svg`;
const Route$T = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: SITE_NAME },
      { name: "description", content: SITE_DESCRIPTION },
      { name: "robots", content: "index, follow" },
      { name: "theme-color", content: "#fb923c" },
      // Open Graph
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: SITE_NAME },
      { property: "og:title", content: SITE_NAME },
      { property: "og:description", content: SITE_DESCRIPTION },
      { property: "og:image", content: OG_IMAGE },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:alt", content: "W.A.G.E. Society — Creator Growth Organization" },
      { property: "og:url", content: SITE_URL },
      // Twitter / X
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: SITE_NAME },
      { name: "twitter:description", content: SITE_DESCRIPTION },
      { name: "twitter:image", content: OG_IMAGE },
      { name: "twitter:image:alt", content: "W.A.G.E. Society — Creator Growth Organization" }
    ],
    links: [
      { rel: "icon", href: "/favicon.ico", sizes: "48x48" },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml", sizes: "any" },
      { rel: "apple-touch-icon", href: "/favicon.svg" },
      { rel: "manifest", href: "/site.webmanifest" },
      { rel: "canonical", href: SITE_URL }
    ]
  }),
  shellComponent: RootDocument
});
function RootDocument({ children }) {
  const [pageReady, setPageReady] = useState(false);
  const [viewingAs, setViewingAs] = useState(null);
  const navigate = useNavigate();
  useEffect(() => {
    if (typeof window === "undefined") return;
    const cap = window.Capacitor;
    if (!cap?.isNativePlatform?.()) return;
    let cleanupFn = null;
    void (async () => {
      try {
        const { App } = await import("@capacitor/app");
        const { Browser } = await import("@capacitor/browser");
        const listener = await App.addListener("appUrlOpen", async (event) => {
          const url = event.url;
          if (!url.startsWith("com.wagesociety.android://login-callback")) return;
          await Browser.close().catch(() => {
          });
          const hash = url.includes("#") ? url.split("#")[1] : "";
          const params = new URLSearchParams(hash);
          const accessToken = params.get("access_token");
          const refreshToken = params.get("refresh_token");
          if (accessToken && refreshToken) {
            const supabase = getSupabaseBrowserClient();
            const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
            if (!error) {
              const { data } = await supabase.auth.getUser();
              const meta = data?.user?.user_metadata || {};
              const dest = meta.onboarding_completed === true ? "/dashboard" : "/onboarding";
              void navigate({ to: dest });
            }
          }
        });
        cleanupFn = () => {
          listener.remove().catch(() => {
          });
        };
      } catch {
      }
    })();
    return () => {
      cleanupFn?.();
    };
  }, [navigate]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
      });
    }
  }, []);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const markReady = () => setPageReady(true);
    if (document.readyState === "complete") {
      markReady();
      return;
    }
    window.addEventListener("load", markReady, { once: true });
    return () => {
      window.removeEventListener("load", markReady);
    };
  }, []);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const syncViewAs = () => {
      setViewingAs(getStoredViewAsRole());
    };
    syncViewAs();
    window.addEventListener("storage", syncViewAs);
    return () => {
      window.removeEventListener("storage", syncViewAs);
    };
  }, []);
  return /* @__PURE__ */ jsxs("html", { lang: "en", children: [
    /* @__PURE__ */ jsxs("head", { children: [
      /* @__PURE__ */ jsx(HeadContent, {}),
      /* @__PURE__ */ jsx(
        "script",
        {
          type: "application/ld+json",
          dangerouslySetInnerHTML: {
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Organization",
              name: "W.A.G.E. Society",
              url: "https://wagesociety.com",
              logo: "https://wagesociety.com/favicon.svg",
              description: "A modern organization for content creators, online marketers, and entrepreneurs. Join W.A.G.E. Society for strategy, systems, and community accountability.",
              sameAs: [],
              contactPoint: {
                "@type": "ContactPoint",
                contactType: "customer support",
                email: "appeals@wagesociety.com"
              }
            })
          }
        }
      )
    ] }),
    /* @__PURE__ */ jsxs("body", { children: [
      /* @__PURE__ */ jsx(OAuthCallbackHandler, {}),
      /* @__PURE__ */ jsx("div", { className: "min-h-screen bg-zinc-950 text-zinc-100", children: /* @__PURE__ */ jsxs("div", { className: "mx-auto flex w-full max-w-6xl flex-col px-4 pb-12 pt-5 sm:px-6 lg:px-8", children: [
        /* @__PURE__ */ jsx(SiteHeader, {}),
        children,
        /* @__PURE__ */ jsx("footer", { className: "mt-10 border-t border-zinc-200/10 pt-5 text-xs text-zinc-400", children: /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap items-center justify-between gap-3", children: [
          /* @__PURE__ */ jsxs("p", { children: [
            "Policy v",
            LEGAL_POLICY_VERSION,
            " · Updated ",
            LEGAL_POLICY_LAST_UPDATED
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3", children: [
            /* @__PURE__ */ jsx("a", { href: "/privacy", className: "transition hover:text-zinc-200", children: "Privacy" }),
            /* @__PURE__ */ jsx("span", { "aria-hidden": "true", children: "·" }),
            /* @__PURE__ */ jsx("a", { href: "/terms", className: "transition hover:text-zinc-200", children: "Terms" })
          ] })
        ] }) })
      ] }) }),
      viewingAs ? /* @__PURE__ */ jsxs("div", { className: "fixed right-4 top-4 z-[10000] flex items-center gap-3 rounded-lg border border-rose-300/60 bg-rose-600/90 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-rose-50 shadow-lg shadow-rose-900/40", children: [
        /* @__PURE__ */ jsxs("span", { children: [
          "VIEWING AS (",
          formatRoleLabel(viewingAs),
          ")"
        ] }),
        /* @__PURE__ */ jsx(
          "button",
          {
            type: "button",
            onClick: () => {
              setStoredViewAsRole(null);
              setViewingAs(null);
              if (typeof window !== "undefined") {
                window.location.reload();
              }
            },
            className: "rounded border border-rose-100/50 px-2 py-0.5 text-[10px] font-bold tracking-[0.12em] text-rose-50 transition hover:border-white",
            children: "Reset"
          }
        )
      ] }) : null,
      !pageReady ? /* @__PURE__ */ jsx("div", { className: "fixed inset-0 z-[9999] flex items-center justify-center bg-zinc-950/95 backdrop-blur-sm", children: /* @__PURE__ */ jsxs("div", { className: "flex flex-col items-center gap-4 text-center", children: [
        /* @__PURE__ */ jsx("div", { className: "h-14 w-14 animate-spin rounded-full border-4 border-zinc-600 border-t-orange-300" }),
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("p", { className: "text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400", children: "W.A.G.E. Society" }),
          /* @__PURE__ */ jsx("p", { className: "mt-2 text-lg font-semibold text-zinc-100", children: "Loading your workspace..." })
        ] })
      ] }) }) : null,
      /* @__PURE__ */ jsx(Scripts, {})
    ] })
  ] });
}
const $$splitComponentImporter$l = () => import("./terms-BaJNeGxJ.js");
const Route$S = createFileRoute("/terms")({
  head: () => ({
    meta: [{
      title: "Terms of Service — W.A.G.E. Society"
    }, {
      name: "description",
      content: "Terms governing your use of W.A.G.E. Society, including accounts, memberships, merch purchases, and community conduct."
    }, {
      property: "og:title",
      content: "Terms of Service — W.A.G.E. Society"
    }, {
      property: "og:description",
      content: "Read the rules and conditions for using W.A.G.E. Society services."
    }, {
      property: "og:url",
      content: "https://wagesociety.com/terms"
    }],
    links: [{
      rel: "canonical",
      href: "https://wagesociety.com/terms"
    }]
  }),
  component: lazyRouteComponent($$splitComponentImporter$l, "component")
});
const $$splitComponentImporter$k = () => import("./signup-C5Hos7NG.js");
const Route$R = createFileRoute("/signup")({
  head: () => ({
    meta: [{
      title: "Sign Up — W.A.G.E. Society"
    }, {
      name: "description",
      content: "Create your W.A.G.E. Society membership account."
    }, {
      name: "robots",
      content: "noindex, nofollow"
    }]
  }),
  component: lazyRouteComponent($$splitComponentImporter$k, "component")
});
function needsOnboarding(metadata) {
  return metadata?.onboarding_completed !== true;
}
async function requireAuthenticatedRoute(redirectTo = "/login", options = {}) {
  if (typeof window === "undefined") return;
  const supabase = getSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  if (!data.session) {
    throw redirect({
      to: redirectTo
    });
  }
  const user = data.session.user;
  if (!options.skipOnboardingCheck && needsOnboarding(user.user_metadata)) {
    throw redirect({ to: "/onboarding" });
  }
}
const $$splitComponentImporter$j = () => import("./settings-DLy33BPt.js");
const Route$Q = createFileRoute("/settings")({
  beforeLoad: async () => {
    await requireAuthenticatedRoute("/login");
  },
  head: () => ({
    meta: [{
      title: "Settings — W.A.G.E. Society"
    }, {
      name: "description",
      content: "Manage your profile, linked accounts, and membership settings."
    }, {
      name: "robots",
      content: "noindex, nofollow"
    }]
  }),
  component: lazyRouteComponent($$splitComponentImporter$j, "component")
});
const $$splitComponentImporter$i = () => import("./privacy-k6Y6zJi3.js");
const Route$P = createFileRoute("/privacy")({
  head: () => ({
    meta: [{
      title: "Privacy Policy — W.A.G.E. Society"
    }, {
      name: "description",
      content: "Read how W.A.G.E. Society collects, uses, shares, and protects personal data across accounts, community features, and payments."
    }, {
      property: "og:title",
      content: "Privacy Policy — W.A.G.E. Society"
    }, {
      property: "og:description",
      content: "Learn what data W.A.G.E. Society collects, why we collect it, and your privacy rights and choices."
    }, {
      property: "og:url",
      content: "https://wagesociety.com/privacy"
    }],
    links: [{
      rel: "canonical",
      href: "https://wagesociety.com/privacy"
    }]
  }),
  component: lazyRouteComponent($$splitComponentImporter$i, "component")
});
const $$splitComponentImporter$h = () => import("./onboarding-UIdjO3gf.js");
const Route$O = createFileRoute("/onboarding")({
  beforeLoad: async () => {
    await requireAuthenticatedRoute("/login", {
      skipOnboardingCheck: true
    });
  },
  head: () => ({
    meta: [{
      title: "Onboarding — W.A.G.E. Society"
    }, {
      name: "description",
      content: "Set up your account and choose whether to upgrade beyond the free tier."
    }, {
      name: "robots",
      content: "noindex, nofollow"
    }]
  }),
  component: lazyRouteComponent($$splitComponentImporter$h, "component")
});
const $$splitComponentImporter$g = () => import("./news-CdvDOxjv.js");
const Route$N = createFileRoute("/news")({
  component: lazyRouteComponent($$splitComponentImporter$g, "component"),
  head: () => ({
    meta: [{
      title: "News — W.A.G.E. Society"
    }]
  })
});
function centsToUsd(value) {
  return `$${(value / 100).toFixed(2)}`;
}
function parseLines(value) {
  return value.split("\n").map((line) => line.trim()).filter(Boolean);
}
function looksLikeImage(url) {
  return /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(url);
}
function looksLikeVideo(url) {
  return /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url);
}
const Route$M = createFileRoute("/merch-studio")({
  beforeLoad: async () => {
    await requireAuthenticatedRoute("/login");
  },
  head: () => ({
    meta: [
      { title: "Merch Studio — W.A.G.E. Society" },
      {
        name: "description",
        content: "Submit merch concepts, track approvals, and monitor creator payouts in the W.A.G.E. Society Merch Studio."
      },
      { name: "robots", content: "noindex, nofollow" }
    ]
  }),
  component: MerchStudioPage
});
function MerchStudioPage() {
  const [submissions, setSubmissions] = useState([]);
  const [earnings, setEarnings] = useState([]);
  const [summary, setSummary] = useState({
    memberDueCents: 0,
    memberPaidCents: 0,
    memberPendingCents: 0
  });
  const [canReview, setCanReview] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [savingReviewId, setSavingReviewId] = useState(null);
  const [recordingEarnings, setRecordingEarnings] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [submissionTarget, setSubmissionTarget] = useState("wage_shop");
  const [externalStoreUrl, setExternalStoreUrl] = useState("");
  const [manualMediaLinks, setManualMediaLinks] = useState("");
  const [embedLinks, setEmbedLinks] = useState("");
  const [files, setFiles] = useState([]);
  const [reviewStatus, setReviewStatus] = useState({});
  const [reviewCreatorSplit, setReviewCreatorSplit] = useState({});
  const [reviewWageSplit, setReviewWageSplit] = useState({});
  const [reviewNotes, setReviewNotes] = useState({});
  const [grossInputs, setGrossInputs] = useState({});
  const sortedSubmissions = useMemo(
    () => [...submissions].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [submissions]
  );
  const loadData = async () => {
    setLoading(true);
    setError("");
    try {
      const [submissionsRes, earningsRes] = await Promise.all([
        authedFetch("/api/merch-studio/submissions"),
        authedFetch("/api/merch-studio/earnings")
      ]);
      const submissionsData = await submissionsRes.json();
      const earningsData = await earningsRes.json();
      if (!submissionsRes.ok) {
        setError(submissionsData?.error || "Failed to load merch submissions.");
        setSubmissions([]);
      } else {
        setSubmissions(submissionsData?.submissions || []);
        setCanReview(Boolean(submissionsData?.canReview));
      }
      if (!earningsRes.ok) {
        if (!submissionsRes.ok) {
          setError(
            submissionsData?.error || earningsData?.error || "Failed to load Merch Studio data."
          );
        }
        setEarnings([]);
        setSummary({ memberDueCents: 0, memberPaidCents: 0, memberPendingCents: 0 });
      } else {
        setEarnings(earningsData?.earnings || []);
        setSummary(
          earningsData?.summary || {
            memberDueCents: 0,
            memberPaidCents: 0,
            memberPendingCents: 0
          }
        );
      }
    } catch {
      setError("Failed to load Merch Studio data.");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void loadData();
  }, []);
  const uploadFiles = async (fileList) => {
    const uploaded = [];
    for (const file of fileList) {
      const form = new FormData();
      form.append("file", file);
      const response = await authedFetch("/api/merch-studio/upload", {
        method: "POST",
        body: form
      });
      const data = await response.json();
      if (!response.ok || !data.url) {
        throw new Error(data.error || `Upload failed for ${file.name}`);
      }
      uploaded.push(data.url);
    }
    return uploaded;
  };
  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setNotice("");
    try {
      const uploadedUrls = await uploadFiles(files);
      const manualUrls = parseLines(manualMediaLinks);
      const externalUrl = externalStoreUrl.trim();
      const response = await authedFetch("/api/merch-studio/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          submissionTarget,
          externalStoreUrl: externalUrl,
          mediaUrls: [...uploadedUrls, ...manualUrls],
          embedLinks: parseLines(embedLinks)
        })
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || "Unable to submit merch concept.");
        return;
      }
      setTitle("");
      setDescription("");
      setSubmissionTarget("wage_shop");
      setExternalStoreUrl("");
      setManualMediaLinks("");
      setEmbedLinks("");
      setFiles([]);
      setNotice("Merch concept submitted. Admin review is now pending.");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to submit merch concept.");
    } finally {
      setSubmitting(false);
    }
  };
  const handleAdminReview = async (submission) => {
    const creatorSplit = reviewCreatorSplit[submission.id] ?? submission.creatorSplitPercent;
    const wageSplit = reviewWageSplit[submission.id] ?? submission.wageSplitPercent;
    const status = reviewStatus[submission.id] ?? submission.status;
    const adminNotes = reviewNotes[submission.id] ?? submission.adminNotes ?? "";
    setSavingReviewId(submission.id);
    setError("");
    setNotice("");
    try {
      const response = await authedFetch("/api/merch-studio/submissions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: submission.id,
          status,
          adminNotes,
          creatorSplitPercent: creatorSplit,
          wageSplitPercent: wageSplit
        })
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || "Failed to save review decision.");
        return;
      }
      setNotice("Review decision saved.");
      await loadData();
    } catch {
      setError("Failed to save review decision.");
    } finally {
      setSavingReviewId(null);
    }
  };
  const handleRecordEarnings = async (submissionId) => {
    const grossInput = grossInputs[submissionId] || "";
    const grossCents = Math.round(Number(grossInput) * 100);
    if (!Number.isFinite(grossCents) || grossCents < 0) {
      setError("Gross revenue must be a valid non-negative dollar amount.");
      return;
    }
    setRecordingEarnings(submissionId);
    setError("");
    setNotice("");
    try {
      const response = await authedFetch("/api/merch-studio/earnings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submissionId,
          grossCents
        })
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || "Failed to record earnings.");
        return;
      }
      setGrossInputs((prev) => ({ ...prev, [submissionId]: "" }));
      setNotice("Earnings recorded.");
      await loadData();
    } catch {
      setError("Failed to record earnings.");
    } finally {
      setRecordingEarnings(null);
    }
  };
  return /* @__PURE__ */ jsxs("div", { className: "mx-auto mt-6 w-full max-w-6xl space-y-6", children: [
    /* @__PURE__ */ jsxs("section", { className: "rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5 sm:p-6", children: [
      /* @__PURE__ */ jsx("p", { className: "text-xs font-semibold uppercase tracking-[0.16em] text-orange-200", children: "Merch Studio" }),
      /* @__PURE__ */ jsx("h1", { className: "mt-2 text-2xl font-black text-zinc-50 sm:text-3xl", children: "Creator mockups, admin review, and payout tracking." }),
      /* @__PURE__ */ jsx("p", { className: "mt-2 max-w-3xl text-sm text-zinc-300", children: "Submit mockups, 3D renders, product links, and embeds for WAGE Shop or your personal store. Admins can accept or deny submissions, assign split percentages, and record payouts over time." })
    ] }),
    /* @__PURE__ */ jsxs("section", { className: "grid gap-4 sm:grid-cols-3", children: [
      /* @__PURE__ */ jsxs("div", { className: "rounded-xl border border-zinc-800 bg-zinc-900/70 p-4", children: [
        /* @__PURE__ */ jsx("p", { className: "text-xs uppercase tracking-[0.12em] text-zinc-400", children: "Member Due" }),
        /* @__PURE__ */ jsx("p", { className: "mt-1 text-2xl font-bold text-emerald-300", children: centsToUsd(summary.memberDueCents) })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "rounded-xl border border-zinc-800 bg-zinc-900/70 p-4", children: [
        /* @__PURE__ */ jsx("p", { className: "text-xs uppercase tracking-[0.12em] text-zinc-400", children: "Member Paid" }),
        /* @__PURE__ */ jsx("p", { className: "mt-1 text-2xl font-bold text-blue-300", children: centsToUsd(summary.memberPaidCents) })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "rounded-xl border border-zinc-800 bg-zinc-900/70 p-4", children: [
        /* @__PURE__ */ jsx("p", { className: "text-xs uppercase tracking-[0.12em] text-zinc-400", children: "Member Pending" }),
        /* @__PURE__ */ jsx("p", { className: "mt-1 text-2xl font-bold text-orange-200", children: centsToUsd(summary.memberPendingCents) })
      ] })
    ] }),
    error ? /* @__PURE__ */ jsx("p", { className: "rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-2 text-sm text-rose-200", children: error }) : null,
    notice ? /* @__PURE__ */ jsx("p", { className: "rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-200", children: notice }) : null,
    /* @__PURE__ */ jsxs("section", { className: "rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5 sm:p-6", children: [
      /* @__PURE__ */ jsx("h2", { className: "text-xl font-bold text-zinc-50", children: "Submit A Merch Concept" }),
      /* @__PURE__ */ jsxs("form", { onSubmit: handleSubmit, className: "mt-4 space-y-3", children: [
        /* @__PURE__ */ jsx(
          "input",
          {
            type: "text",
            value: title,
            onChange: (event) => setTitle(event.target.value),
            placeholder: "Title",
            className: "w-full rounded-lg border border-zinc-700 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-100",
            required: true
          }
        ),
        /* @__PURE__ */ jsx(
          "textarea",
          {
            value: description,
            onChange: (event) => setDescription(event.target.value),
            placeholder: "Describe your design, target audience, and product concept",
            className: "h-32 w-full rounded-lg border border-zinc-700 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-100",
            required: true
          }
        ),
        /* @__PURE__ */ jsxs("div", { className: "grid gap-3 sm:grid-cols-2", children: [
          /* @__PURE__ */ jsxs("label", { className: "text-sm text-zinc-300", children: [
            /* @__PURE__ */ jsx("span", { className: "mb-1 block text-xs uppercase tracking-[0.12em] text-zinc-400", children: "Submission target" }),
            /* @__PURE__ */ jsxs(
              "select",
              {
                value: submissionTarget,
                onChange: (event) => setSubmissionTarget(event.target.value),
                className: "w-full rounded-lg border border-zinc-700 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-100",
                children: [
                  /* @__PURE__ */ jsx("option", { value: "wage_shop", children: "WAGE Shop" }),
                  /* @__PURE__ */ jsx("option", { value: "personal_store", children: "Personal Store" })
                ]
              }
            )
          ] }),
          /* @__PURE__ */ jsxs("label", { className: "text-sm text-zinc-300", children: [
            /* @__PURE__ */ jsx("span", { className: "mb-1 block text-xs uppercase tracking-[0.12em] text-zinc-400", children: "External store URL" }),
            /* @__PURE__ */ jsx(
              "input",
              {
                type: "url",
                value: externalStoreUrl,
                onChange: (event) => setExternalStoreUrl(event.target.value),
                placeholder: "https://",
                className: "w-full rounded-lg border border-zinc-700 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-100"
              }
            )
          ] })
        ] }),
        /* @__PURE__ */ jsxs("label", { className: "block text-sm text-zinc-300", children: [
          /* @__PURE__ */ jsx("span", { className: "mb-1 block text-xs uppercase tracking-[0.12em] text-zinc-400", children: "Upload media files" }),
          /* @__PURE__ */ jsx(
            "input",
            {
              type: "file",
              multiple: true,
              accept: "image/*,video/*,.obj,.fbx,.glb,.gltf,.stl",
              onChange: (event) => setFiles(Array.from(event.target.files || [])),
              className: "w-full rounded-lg border border-zinc-700 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-100"
            }
          )
        ] }),
        /* @__PURE__ */ jsx(
          "textarea",
          {
            value: manualMediaLinks,
            onChange: (event) => setManualMediaLinks(event.target.value),
            placeholder: "Additional media URLs (one per line)",
            className: "h-24 w-full rounded-lg border border-zinc-700 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-100"
          }
        ),
        /* @__PURE__ */ jsx(
          "textarea",
          {
            value: embedLinks,
            onChange: (event) => setEmbedLinks(event.target.value),
            placeholder: "Embeds/links (YouTube, product page, inspiration links - one per line)",
            className: "h-24 w-full rounded-lg border border-zinc-700 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-100"
          }
        ),
        /* @__PURE__ */ jsx(
          "button",
          {
            type: "submit",
            disabled: submitting,
            className: "rounded-lg bg-orange-300 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-orange-200 disabled:opacity-70",
            children: submitting ? "Submitting..." : "Submit Concept"
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ jsxs("section", { className: "space-y-4", children: [
      /* @__PURE__ */ jsx("h2", { className: "text-xl font-bold text-zinc-50", children: "Submissions" }),
      loading ? /* @__PURE__ */ jsx("div", { className: "rounded-xl border border-zinc-800 bg-zinc-900/70 p-4 text-sm text-zinc-300", children: "Loading submissions..." }) : sortedSubmissions.length === 0 ? /* @__PURE__ */ jsx("div", { className: "rounded-xl border border-zinc-800 bg-zinc-900/70 p-4 text-sm text-zinc-300", children: "No merch submissions yet." }) : sortedSubmissions.map((submission) => {
        const relatedEarnings = earnings.filter((entry) => entry.submissionId === submission.id);
        return /* @__PURE__ */ jsxs("article", { className: "rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5", children: [
          /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap items-center justify-between gap-3", children: [
            /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx("h3", { className: "text-lg font-bold text-zinc-50", children: submission.title }),
              /* @__PURE__ */ jsxs("p", { className: "text-xs uppercase tracking-[0.12em] text-zinc-400", children: [
                submission.submissionTarget === "wage_shop" ? "WAGE Shop" : "Personal Store",
                " | ",
                submission.status
              ] })
            ] }),
            /* @__PURE__ */ jsxs("p", { className: "text-xs text-zinc-400", children: [
              "Submitted ",
              new Date(submission.createdAt).toLocaleString()
            ] })
          ] }),
          /* @__PURE__ */ jsx("p", { className: "mt-3 whitespace-pre-line text-sm text-zinc-200", children: submission.description }),
          submission.externalStoreUrl ? /* @__PURE__ */ jsxs("p", { className: "mt-3 text-sm text-zinc-300", children: [
            "External store:",
            " ",
            /* @__PURE__ */ jsx("a", { href: submission.externalStoreUrl, target: "_blank", rel: "noreferrer", className: "text-blue-300 underline", children: submission.externalStoreUrl })
          ] }) : null,
          submission.mediaUrls.length > 0 ? /* @__PURE__ */ jsx("div", { className: "mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3", children: submission.mediaUrls.map((url) => /* @__PURE__ */ jsxs("div", { className: "rounded-lg border border-zinc-700 bg-zinc-950/50 p-2", children: [
            looksLikeImage(url) ? /* @__PURE__ */ jsx("img", { src: url, alt: submission.title, className: "h-44 w-full rounded object-cover" }) : null,
            looksLikeVideo(url) ? /* @__PURE__ */ jsx("video", { src: url, controls: true, className: "h-44 w-full rounded object-cover" }) : null,
            !looksLikeImage(url) && !looksLikeVideo(url) ? /* @__PURE__ */ jsx("a", { href: url, target: "_blank", rel: "noreferrer", className: "text-xs text-blue-300 underline break-all", children: url }) : null
          ] }, url)) }) : null,
          submission.embedLinks.length > 0 ? /* @__PURE__ */ jsx("ul", { className: "mt-4 space-y-2 text-sm", children: submission.embedLinks.map((link) => /* @__PURE__ */ jsx("li", { children: /* @__PURE__ */ jsx("a", { href: link, target: "_blank", rel: "noreferrer", className: "text-blue-300 underline break-all", children: link }) }, link)) }) : null,
          /* @__PURE__ */ jsxs("div", { className: "mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4", children: [
            /* @__PURE__ */ jsxs("div", { className: "rounded-lg border border-zinc-700 bg-zinc-950/50 p-3", children: [
              /* @__PURE__ */ jsx("p", { className: "text-xs uppercase tracking-[0.12em] text-zinc-400", children: "Creator Split" }),
              /* @__PURE__ */ jsxs("p", { className: "mt-1 text-sm font-semibold text-zinc-100", children: [
                submission.creatorSplitPercent,
                "%"
              ] })
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "rounded-lg border border-zinc-700 bg-zinc-950/50 p-3", children: [
              /* @__PURE__ */ jsx("p", { className: "text-xs uppercase tracking-[0.12em] text-zinc-400", children: "WAGE Split" }),
              /* @__PURE__ */ jsxs("p", { className: "mt-1 text-sm font-semibold text-zinc-100", children: [
                submission.wageSplitPercent,
                "%"
              ] })
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "rounded-lg border border-zinc-700 bg-zinc-950/50 p-3", children: [
              /* @__PURE__ */ jsx("p", { className: "text-xs uppercase tracking-[0.12em] text-zinc-400", children: "Total Member Due" }),
              /* @__PURE__ */ jsx("p", { className: "mt-1 text-sm font-semibold text-emerald-300", children: centsToUsd(relatedEarnings.reduce((acc, item) => acc + item.memberDueCents, 0)) })
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "rounded-lg border border-zinc-700 bg-zinc-950/50 p-3", children: [
              /* @__PURE__ */ jsx("p", { className: "text-xs uppercase tracking-[0.12em] text-zinc-400", children: "Pending Member" }),
              /* @__PURE__ */ jsx("p", { className: "mt-1 text-sm font-semibold text-orange-200", children: centsToUsd(
                relatedEarnings.reduce(
                  (acc, item) => acc + Math.max(0, item.memberDueCents - item.paidToMemberCents),
                  0
                )
              ) })
            ] })
          ] }),
          canReview ? /* @__PURE__ */ jsxs("div", { className: "mt-5 space-y-3 rounded-xl border border-zinc-700 bg-zinc-950/60 p-4", children: [
            /* @__PURE__ */ jsx("h4", { className: "text-sm font-bold uppercase tracking-[0.12em] text-zinc-300", children: "Admin Review" }),
            /* @__PURE__ */ jsxs("div", { className: "grid gap-3 sm:grid-cols-2 lg:grid-cols-4", children: [
              /* @__PURE__ */ jsxs("label", { className: "text-xs text-zinc-300", children: [
                /* @__PURE__ */ jsx("span", { className: "mb-1 block uppercase tracking-[0.12em] text-zinc-400", children: "Status" }),
                /* @__PURE__ */ jsxs(
                  "select",
                  {
                    value: reviewStatus[submission.id] ?? submission.status,
                    onChange: (event) => setReviewStatus((prev) => ({
                      ...prev,
                      [submission.id]: event.target.value
                    })),
                    className: "w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-2 text-sm text-zinc-100",
                    children: [
                      /* @__PURE__ */ jsx("option", { value: "submitted", children: "submitted" }),
                      /* @__PURE__ */ jsx("option", { value: "under_review", children: "under_review" }),
                      /* @__PURE__ */ jsx("option", { value: "accepted", children: "accepted" }),
                      /* @__PURE__ */ jsx("option", { value: "denied", children: "denied" })
                    ]
                  }
                )
              ] }),
              /* @__PURE__ */ jsxs("label", { className: "text-xs text-zinc-300", children: [
                /* @__PURE__ */ jsx("span", { className: "mb-1 block uppercase tracking-[0.12em] text-zinc-400", children: "Creator %" }),
                /* @__PURE__ */ jsx(
                  "input",
                  {
                    type: "number",
                    min: 0,
                    max: 100,
                    step: "0.1",
                    value: reviewCreatorSplit[submission.id] ?? submission.creatorSplitPercent,
                    onChange: (event) => setReviewCreatorSplit((prev) => ({
                      ...prev,
                      [submission.id]: Number(event.target.value)
                    })),
                    className: "w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-2 text-sm text-zinc-100"
                  }
                )
              ] }),
              /* @__PURE__ */ jsxs("label", { className: "text-xs text-zinc-300", children: [
                /* @__PURE__ */ jsx("span", { className: "mb-1 block uppercase tracking-[0.12em] text-zinc-400", children: "WAGE %" }),
                /* @__PURE__ */ jsx(
                  "input",
                  {
                    type: "number",
                    min: 0,
                    max: 100,
                    step: "0.1",
                    value: reviewWageSplit[submission.id] ?? submission.wageSplitPercent,
                    onChange: (event) => setReviewWageSplit((prev) => ({
                      ...prev,
                      [submission.id]: Number(event.target.value)
                    })),
                    className: "w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-2 text-sm text-zinc-100"
                  }
                )
              ] }),
              /* @__PURE__ */ jsxs("label", { className: "text-xs text-zinc-300", children: [
                /* @__PURE__ */ jsx("span", { className: "mb-1 block uppercase tracking-[0.12em] text-zinc-400", children: "Gross $" }),
                /* @__PURE__ */ jsx(
                  "input",
                  {
                    type: "number",
                    min: 0,
                    step: "0.01",
                    value: grossInputs[submission.id] ?? "",
                    onChange: (event) => setGrossInputs((prev) => ({
                      ...prev,
                      [submission.id]: event.target.value
                    })),
                    placeholder: "0.00",
                    className: "w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-2 text-sm text-zinc-100"
                  }
                )
              ] })
            ] }),
            /* @__PURE__ */ jsx(
              "textarea",
              {
                value: reviewNotes[submission.id] ?? submission.adminNotes ?? "",
                onChange: (event) => setReviewNotes((prev) => ({
                  ...prev,
                  [submission.id]: event.target.value
                })),
                placeholder: "Admin notes",
                className: "h-20 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
              }
            ),
            /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap gap-2", children: [
              /* @__PURE__ */ jsx(
                "button",
                {
                  type: "button",
                  onClick: () => void handleAdminReview(submission),
                  disabled: savingReviewId === submission.id,
                  className: "rounded-lg bg-orange-300 px-3 py-2 text-sm font-semibold text-zinc-950 disabled:opacity-70",
                  children: savingReviewId === submission.id ? "Saving..." : "Save Review"
                }
              ),
              /* @__PURE__ */ jsx(
                "button",
                {
                  type: "button",
                  onClick: () => void handleRecordEarnings(submission.id),
                  disabled: recordingEarnings === submission.id,
                  className: "rounded-lg border border-zinc-500 px-3 py-2 text-sm font-semibold text-zinc-100 disabled:opacity-70",
                  children: recordingEarnings === submission.id ? "Recording..." : "Record Earnings"
                }
              )
            ] })
          ] }) : null
        ] }, submission.id);
      })
    ] })
  ] });
}
const $$splitComponentImporter$f = () => import("./merch-VzGzQGpr.js");
const Route$L = createFileRoute("/merch")({
  head: () => ({
    meta: [{
      title: "Merch — W.A.G.E. Society"
    }, {
      name: "description",
      content: "Official W.A.G.E. Society merch for creators, marketers, and entrepreneurs building in public."
    }]
  }),
  component: lazyRouteComponent($$splitComponentImporter$f, "component")
});
const $$splitComponentImporter$e = () => import("./login-D5YHKl1Y.js");
const Route$K = createFileRoute("/login")({
  head: () => ({
    meta: [{
      title: "Login — W.A.G.E. Society"
    }, {
      name: "description",
      content: "Log in to your W.A.G.E. Society account."
    }, {
      name: "robots",
      content: "noindex, nofollow"
    }]
  }),
  component: lazyRouteComponent($$splitComponentImporter$e, "component")
});
const $$splitComponentImporter$d = () => import("./live-DbzADJRR.js");
const Route$J = createFileRoute("/live")({
  head: () => ({
    meta: [{
      title: "Live Streams — W.A.G.E. Society"
    }, {
      name: "description",
      content: "View all organization livestreams in one list with live/offline status and quick open links."
    }]
  }),
  component: lazyRouteComponent($$splitComponentImporter$d, "component")
});
const $$splitComponentImporter$c = () => import("./faq-Bcw04J07.js");
const Route$I = createFileRoute("/faq")({
  head: () => ({
    meta: [{
      title: "Organization FAQ — W.A.G.E. Society"
    }, {
      name: "description",
      content: "Answers about W.A.G.E. Society membership tracks, creator resources, marketing systems, and entrepreneur-focused community access."
    }, {
      property: "og:title",
      content: "Organization FAQ — W.A.G.E. Society"
    }, {
      property: "og:description",
      content: "Everything you need to know about joining W.A.G.E. Society as a creator, marketer, or entrepreneur."
    }, {
      property: "og:url",
      content: "https://playful-torte-0c9af1.netlify.app/faq"
    }],
    links: [{
      rel: "canonical",
      href: "https://playful-torte-0c9af1.netlify.app/faq"
    }]
  }),
  component: lazyRouteComponent($$splitComponentImporter$c, "component")
});
const $$splitComponentImporter$b = () => import("./download-CjnIz-Gg.js");
const Route$H = createFileRoute("/download")({
  head: () => ({
    meta: [{
      title: "Download the App — W.A.G.E. Society"
    }, {
      name: "description",
      content: "Download the W.A.G.E. Society Android APK, and install on iPhone/iPad through Safari Add to Home Screen."
    }, {
      property: "og:title",
      content: "Download the App — W.A.G.E. Society"
    }, {
      property: "og:description",
      content: "Download the W.A.G.E. Society Android APK, and install on iPhone/iPad through Safari Add to Home Screen."
    }, {
      property: "og:url",
      content: "https://wagesociety.com/download"
    }],
    links: [{
      rel: "canonical",
      href: "https://wagesociety.com/download"
    }]
  }),
  component: lazyRouteComponent($$splitComponentImporter$b, "component")
});
const $$splitComponentImporter$a = () => import("./directory-BHFIAXsS.js");
const Route$G = createFileRoute("/directory")({
  head: () => ({
    meta: [{
      title: "Creator Directory — W.A.G.E. Society"
    }, {
      name: "description",
      content: "Browse all signed-up creators and visit their public W.A.G.E. Society profiles."
    }]
  }),
  component: lazyRouteComponent($$splitComponentImporter$a, "component")
});
const $$splitComponentImporter$9 = () => import("./dashboard-BP9xoH8v.js");
const Route$F = createFileRoute("/dashboard")({
  beforeLoad: async () => {
    await requireAuthenticatedRoute("/login");
  },
  head: () => ({
    meta: [{
      title: "Organization Dashboard — W.A.G.E. Society"
    }, {
      name: "description",
      content: "Your W.A.G.E. Society organization dashboard for content creation, online marketing, and entrepreneurship execution."
    }, {
      name: "robots",
      content: "noindex, nofollow"
    }]
  }),
  component: lazyRouteComponent($$splitComponentImporter$9, "component")
});
const $$splitComponentImporter$8 = () => import("./appeals-BbY3GHSm.js");
const Route$E = createFileRoute("/appeals")({
  head: () => ({
    meta: [{
      title: "Appeals — W.A.G.E. Society"
    }, {
      name: "description",
      content: "Submit an access appeal for a restricted W.A.G.E. Society account."
    }, {
      name: "robots",
      content: "noindex, nofollow"
    }]
  }),
  component: lazyRouteComponent($$splitComponentImporter$8, "component")
});
const $$splitComponentImporter$7 = () => import("./admin-nJFrCAro.js");
const Route$D = createFileRoute("/admin")({
  beforeLoad: async () => {
    await requireAuthenticatedRoute();
  },
  head: () => ({
    meta: [{
      title: "Admin Hub — W.A.G.E. Society"
    }, {
      name: "description",
      content: "Central admin hub for users, shop, streams, and website feature management."
    }, {
      name: "robots",
      content: "noindex, nofollow"
    }]
  }),
  component: lazyRouteComponent($$splitComponentImporter$7, "component")
});
const $$splitComponentImporter$6 = () => import("./_username-CTTu6Vco.js");
const Route$C = createFileRoute("/$username")({
  head: () => ({
    meta: [{
      title: "Creator Profile — W.A.G.E. Society"
    }, {
      name: "description",
      content: "Public creator profile on W.A.G.E. Society with connected accounts, bio, and creator details."
    }]
  }),
  component: lazyRouteComponent($$splitComponentImporter$6, "component")
});
const $$splitComponentImporter$5 = () => import("./index-CnCbynUh.js");
const Route$B = createFileRoute("/")({
  head: () => ({
    meta: [{
      title: "W.A.G.E. Society — Creator Growth Organization"
    }, {
      name: "description",
      content: "Join W.A.G.E. Society, an organization for content creators, online marketers, and entrepreneurs building modern digital businesses together."
    }, {
      property: "og:title",
      content: "W.A.G.E. Society — Creator Growth Organization"
    }, {
      property: "og:description",
      content: "An organization for content creators, online marketers, and entrepreneurs who want tools, strategy, and community to grow."
    }, {
      property: "og:url",
      content: "https://playful-torte-0c9af1.netlify.app/"
    }],
    links: [{
      rel: "canonical",
      href: "https://playful-torte-0c9af1.netlify.app/"
    }]
  }),
  component: lazyRouteComponent($$splitComponentImporter$5, "component")
});
const $$splitComponentImporter$4 = () => import("./auth.callback-CDxictyK.js");
const Route$A = createFileRoute("/auth/callback")({
  head: () => ({
    meta: [{
      title: "Signing in - W.A.G.E. Society"
    }, {
      name: "robots",
      content: "noindex, nofollow"
    }]
  }),
  component: lazyRouteComponent($$splitComponentImporter$4, "component")
});
const supabaseUrl$1 = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serverKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE;
let adminClient = null;
function hasSupabaseAdminConfig() {
  return Boolean(supabaseUrl$1 && serverKey);
}
function getSupabaseAdminConfigIssues() {
  const issues = [];
  if (!supabaseUrl$1) {
    issues.push("Missing Supabase URL. Set SUPABASE_URL, VITE_SUPABASE_URL, or NEXT_PUBLIC_SUPABASE_URL.");
  }
  if (!serverKey) {
    issues.push(
      "Missing service role key. Set SUPABASE_SERVICE_ROLE_KEY, SUPABASE_SERVICE_KEY, SUPABASE_SECRET_KEY, or SUPABASE_SERVICE_ROLE. The admin client requires a server-only key — do not use anon/publishable keys here."
    );
  }
  return issues;
}
function getSupabaseAdminClient() {
  if (!hasSupabaseAdminConfig()) {
    throw new Error(getSupabaseAdminConfigIssues().join(" "));
  }
  if (!adminClient) {
    adminClient = createClient(supabaseUrl$1, serverKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
  }
  return adminClient;
}
function getStripeSecretKey$1() {
  return process.env.STRIPE_SECRET_KEY || process.env.STRIPE_API_KEY || process.env.STRIPE_SECRET || "";
}
function getStripeWebhookSecret() {
  return process.env.STRIPE_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SIGNING_SECRET || "";
}
function getStripe$1() {
  const key = getStripeSecretKey$1();
  if (!key) {
    throw new Error(
      "Billing webhook is not configured. Set STRIPE_SECRET_KEY (or STRIPE_API_KEY / STRIPE_SECRET)."
    );
  }
  return new Stripe(key, { apiVersion: "2026-03-25.dahlia" });
}
function extractPlanSlugFromSubscription(subscription) {
  const fromMeta = subscription.metadata?.membership_plan?.trim();
  if (fromMeta) return fromMeta;
  const firstItem = subscription.items.data[0];
  const fromPriceMeta = firstItem?.price?.metadata?.planSlug?.trim();
  if (fromPriceMeta) return fromPriceMeta;
  const fromProductMeta = firstItem?.price?.product;
  if (fromProductMeta && typeof fromProductMeta !== "string") {
    const slug = fromProductMeta.metadata?.planSlug?.trim();
    if (slug) return slug;
  }
  return null;
}
async function updateMembershipMetadataByEmail(email, updates) {
  const admin = getSupabaseAdminClient();
  const { data: users, error: usersError } = await admin.schema("auth").from("users").select("id, raw_user_meta_data").ilike("email", email).limit(1);
  if (usersError) throw new Error(usersError.message);
  const user = Array.isArray(users) ? users[0] : null;
  if (!user?.id) return;
  const currentMeta = user.raw_user_meta_data ?? {};
  const nextMeta = {
    ...currentMeta,
    ...updates
  };
  const { error: updateError } = await admin.auth.admin.updateUserById(user.id, {
    user_metadata: nextMeta
  });
  if (updateError) throw new Error(updateError.message);
}
const Route$z = createFileRoute("/api/stripe-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!getStripeSecretKey$1()) {
          return Response.json(
            {
              error: "Billing webhook is not configured. Missing STRIPE_SECRET_KEY in server environment."
            },
            { status: 503 }
          );
        }
        const webhookSecret = getStripeWebhookSecret();
        if (!webhookSecret) {
          return Response.json(
            {
              error: "Webhook signing secret not configured. Set STRIPE_WEBHOOK_SECRET (or STRIPE_WEBHOOK_SIGNING_SECRET)."
            },
            { status: 503 }
          );
        }
        const stripe = getStripe$1();
        let event;
        try {
          const payload = await request.text();
          const sig = request.headers.get("stripe-signature") || "";
          if (!sig) {
            return Response.json({ error: "Missing stripe-signature header." }, { status: 400 });
          }
          event = await stripe.webhooks.constructEventAsync(payload, sig, webhookSecret);
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Invalid webhook payload.";
          return Response.json({ error: msg }, { status: 400 });
        }
        try {
          if (event.type === "checkout.session.completed") {
            const session = event.data.object;
            const customerEmail = session.metadata?.customerEmail || session.customer_details?.email || void 0;
            const planSlug = session.metadata?.membership_plan || void 0;
            if (customerEmail) {
              const normalizedEmail = customerEmail.toLowerCase();
              const admin = getSupabaseAdminClient();
              await admin.rpc("ensure_org_member_role", {
                p_email: normalizedEmail
              });
              await updateMembershipMetadataByEmail(normalizedEmail, {
                membership_plan: planSlug || "free",
                stripe_customer_id: typeof session.customer === "string" ? session.customer : void 0,
                stripe_subscription_id: typeof session.subscription === "string" ? session.subscription : void 0
              });
            }
          }
          if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.created") {
            const subscription = event.data.object;
            const customerId = typeof subscription.customer === "string" ? subscription.customer : "";
            if (customerId) {
              const customer = await stripe.customers.retrieve(customerId);
              const customerEmail = typeof customer !== "string" && !customer.deleted ? customer.email?.toLowerCase() : void 0;
              if (customerEmail) {
                const planSlug = extractPlanSlugFromSubscription(subscription) || "free";
                const admin = getSupabaseAdminClient();
                await admin.rpc("ensure_org_member_role", {
                  p_email: customerEmail
                });
                await updateMembershipMetadataByEmail(customerEmail, {
                  membership_plan: planSlug,
                  stripe_customer_id: customerId,
                  stripe_subscription_id: subscription.id
                });
              }
            }
          }
          if (event.type === "customer.subscription.deleted") {
            const subscription = event.data.object;
            const customerId = typeof subscription.customer === "string" ? subscription.customer : "";
            if (customerId) {
              const customer = await stripe.customers.retrieve(customerId);
              const customerEmail = typeof customer !== "string" && !customer.deleted ? customer.email?.toLowerCase() : void 0;
              if (customerEmail) {
                await updateMembershipMetadataByEmail(customerEmail, {
                  membership_plan: "free",
                  stripe_customer_id: customerId,
                  stripe_subscription_id: void 0
                });
              }
            }
          }
        } catch {
          console.error("[stripe-webhook] fulfillment error", event.id);
        }
        return Response.json({ received: true });
      }
    }
  }
});
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
let serverPublicClient = null;
function createServerClient(accessToken) {
  return createClient(supabaseUrl, publishableKey, {
    global: accessToken ? {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    } : void 0,
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}
function getSupabaseServerPublicClient() {
  if (!supabaseUrl) {
    throw new Error("Missing Supabase URL. Set SUPABASE_URL or VITE_SUPABASE_URL.");
  }
  if (!publishableKey) {
    throw new Error(
      "Missing Supabase publishable key. Set SUPABASE_PUBLISHABLE_KEY, SUPABASE_ANON_KEY, VITE_SUPABASE_PUBLISHABLE_KEY, or NEXT_PUBLIC_SUPABASE_ANON_KEY."
    );
  }
  if (!serverPublicClient) {
    serverPublicClient = createServerClient();
  }
  return serverPublicClient;
}
function getSupabaseServerClientForToken(accessToken) {
  if (!supabaseUrl) {
    throw new Error("Missing Supabase URL. Set SUPABASE_URL or VITE_SUPABASE_URL.");
  }
  if (!publishableKey) {
    throw new Error(
      "Missing Supabase publishable key. Set SUPABASE_PUBLISHABLE_KEY, SUPABASE_ANON_KEY, VITE_SUPABASE_PUBLISHABLE_KEY, or NEXT_PUBLIC_SUPABASE_ANON_KEY."
    );
  }
  return createServerClient(accessToken);
}
const Route$y = createFileRoute("/api/shop")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const db = hasSupabaseAdminConfig() ? getSupabaseAdminClient() : getSupabaseServerPublicClient();
          const [{ data: merchData, error: merchError }, { data: plansData, error: plansError }] = await Promise.all([
            db.from("org_shop_merch_items").select("id, name, price, description, sort_order, is_active, created_at, updated_at").eq("is_active", true).order("sort_order", { ascending: true }).order("created_at", { ascending: true }),
            db.from("org_shop_membership_plans").select("id, slug, name, display_price, price_cents, description, features, sort_order, is_active, created_at, updated_at").eq("is_active", true).order("sort_order", { ascending: true }).order("created_at", { ascending: true })
          ]);
          if (merchError) return Response.json({ error: merchError.message }, { status: 500 });
          if (plansError) return Response.json({ error: plansError.message }, { status: 500 });
          return Response.json({
            merchItems: merchData || [],
            membershipPlans: plansData || []
          });
        } catch (error) {
          return Response.json(
            { error: error instanceof Error ? error.message : "Unexpected server error" },
            { status: 500 }
          );
        }
      }
    }
  }
});
function normalizeMemberUsername(value) {
  return value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/-{2,}/g, "-").replace(/^-+|-+$/g, "");
}
function readUsernameFromMetadata(meta) {
  const candidates = [meta?.username, meta?.preferred_username];
  for (const candidate of candidates) {
    const normalized = normalizeMemberUsername(candidate || "");
    if (normalized) return normalized;
  }
  return null;
}
function readDisplayNameFromMetadata(meta) {
  const candidates = [meta?.full_name, meta?.name];
  for (const candidate of candidates) {
    const trimmed = candidate?.trim();
    if (trimmed) return trimmed;
  }
  return null;
}
function readAvatarFromMetadata(meta) {
  const candidates = [meta?.avatar_url, meta?.picture];
  for (const candidate of candidates) {
    const trimmed = candidate?.trim();
    if (trimmed) return trimmed;
  }
  return null;
}
function makeBaseUsername(user) {
  const fromMeta = readUsernameFromMetadata(user.user_metadata);
  if (fromMeta) return fromMeta;
  const emailLocal = String(user.email || "").toLowerCase().trim().split("@")[0];
  const fromEmail = normalizeMemberUsername(emailLocal);
  if (fromEmail) return fromEmail;
  return `member-${String(user.id || "").slice(0, 8)}`;
}
function assignDeterministicUsernames(users) {
  const sorted = [...users].sort((a, b) => {
    const aCreated = a.created_at || "";
    const bCreated = b.created_at || "";
    if (aCreated !== bCreated) return aCreated.localeCompare(bCreated);
    return String(a.id || "").localeCompare(String(b.id || ""));
  });
  const taken = /* @__PURE__ */ new Set();
  const result = /* @__PURE__ */ new Map();
  for (const user of sorted) {
    const base = makeBaseUsername(user);
    let candidate = base;
    if (taken.has(candidate)) {
      const shortId = String(user.id || "").slice(0, 6).toLowerCase();
      candidate = normalizeMemberUsername(`${base}-${shortId}`) || `${base}-member`;
      let i = 2;
      while (taken.has(candidate)) {
        candidate = `${base}-${shortId}-${i}`;
        i += 1;
      }
    }
    taken.add(candidate);
    result.set(String(user.id), candidate);
  }
  return result;
}
function normalizeEmail(value) {
  const trimmed = String(value || "").trim().toLowerCase();
  return trimmed || null;
}
function normalizeDateOrNow(value) {
  const str = String(value || "").trim();
  return str || (/* @__PURE__ */ new Date()).toISOString();
}
function normalizeRows(data) {
  const rows = Array.isArray(data) ? data : [];
  return rows.filter((row) => Boolean(row.user_id)).map((row) => ({
    id: row.user_id,
    email: normalizeEmail(row.email),
    user_metadata: row.user_metadata || null,
    created_at: normalizeDateOrNow(row.created_at),
    updated_at: normalizeDateOrNow(row.updated_at || row.created_at),
    identities: null
  }));
}
async function listDirectAuthUsers(client) {
  const listUsers = client.auth?.admin?.listUsers;
  if (!listUsers) return [];
  const collected = [];
  let page = 1;
  const perPage = 1e3;
  while (page <= 10) {
    const { data, error } = await listUsers({ page, perPage });
    if (error) break;
    const pageUsers = Array.isArray(data?.users) ? data.users : [];
    if (!pageUsers.length) break;
    for (const row of pageUsers) {
      const id = String(row.id || "").trim();
      if (!id) continue;
      const createdAt = normalizeDateOrNow(row.created_at);
      const updatedAt = normalizeDateOrNow(row.updated_at || row.created_at);
      collected.push({
        id,
        email: normalizeEmail(row.email),
        user_metadata: row.user_metadata || null,
        created_at: createdAt,
        updated_at: updatedAt,
        identities: null
      });
    }
    if (pageUsers.length < perPage) break;
    page += 1;
  }
  return collected;
}
function mergeUsers(sources) {
  const byKey = /* @__PURE__ */ new Map();
  for (const source of sources) {
    for (const user of source) {
      const id = String(user.id || "").trim();
      const email = normalizeEmail(user.email);
      const key = id || email;
      if (!key) continue;
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, {
          id: id || key,
          email,
          user_metadata: user.user_metadata || null,
          created_at: normalizeDateOrNow(user.created_at),
          updated_at: normalizeDateOrNow(user.updated_at || user.created_at),
          identities: null
        });
        continue;
      }
      byKey.set(key, {
        ...existing,
        id: id || existing.id,
        email: email || existing.email || null,
        user_metadata: user.user_metadata || existing.user_metadata || null,
        created_at: normalizeDateOrNow(existing.created_at || user.created_at),
        updated_at: normalizeDateOrNow(user.updated_at || existing.updated_at || user.created_at),
        identities: null
      });
    }
  }
  return Array.from(byKey.values()).sort((a, b) => {
    const aCreated = String(a.created_at || "");
    const bCreated = String(b.created_at || "");
    if (aCreated !== bCreated) return aCreated.localeCompare(bCreated);
    return String(a.id || "").localeCompare(String(b.id || ""));
  });
}
async function listAuthIndexedUsers(client, limit = 1e4) {
  const candidates = [];
  try {
    const rpcResult = await Promise.resolve(client.rpc?.("list_auth_users_index"));
    if (!rpcResult.error) {
      candidates.push(normalizeRows(rpcResult.data));
    }
  } catch {
  }
  try {
    const { data, error } = await client.from?.("org_auth_user_index")?.select("user_id, email, user_metadata, created_at, updated_at")?.order("created_at", { ascending: true })?.limit(limit);
    if (!error) {
      candidates.push(normalizeRows(data));
    }
  } catch {
  }
  try {
    const directUsers = await listDirectAuthUsers(client);
    if (directUsers.length > 0) {
      candidates.push(directUsers);
    }
  } catch {
  }
  if (candidates.length === 0) {
    return [];
  }
  const merged = mergeUsers(candidates);
  if (merged.length <= limit) {
    return merged;
  }
  return merged.slice(0, limit);
}
function normalizeUsername$1(value) {
  return value.trim().toLowerCase();
}
function providerLabel(provider) {
  switch (provider.toLowerCase()) {
    case "custom:kick":
      return "Kick";
    case "discord":
      return "Discord";
    case "google":
      return "Google";
    case "facebook":
      return "Facebook";
    case "github":
      return "GitHub";
    case "twitter":
      return "X / Twitter";
    case "twitch":
      return "Twitch";
    case "apple":
      return "Apple";
    default:
      return provider;
  }
}
function providerProfileUrl(provider, handle) {
  const normalizedHandle = handle.replace(/^@/, "");
  switch (provider.toLowerCase()) {
    case "custom:kick":
      return `https://kick.com/${normalizedHandle}`;
    case "twitter":
      return `https://x.com/${normalizedHandle}`;
    case "twitch":
      return `https://twitch.tv/${normalizedHandle}`;
    case "github":
      return `https://github.com/${normalizedHandle}`;
    case "discord":
      return `https://discord.com/users/${normalizedHandle}`;
    case "facebook":
      return `https://facebook.com/${normalizedHandle}`;
    default:
      return null;
  }
}
const Route$x = createFileRoute("/api/public-profile")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const usernameParam = url.searchParams.get("username") || "";
          const normalizedRequestedUsername = normalizeUsername$1(usernameParam);
          if (!normalizedRequestedUsername) {
            return Response.json({ error: "username is required." }, { status: 400 });
          }
          const client = hasSupabaseAdminConfig() ? getSupabaseAdminClient() : getSupabaseServerPublicClient();
          const users = await listAuthIndexedUsers(client);
          const { data: profileRows, error: profileRowsError } = await client.from("org_member_profiles").select("email, display_name, avatar_url, bio, skills, updated_at").limit(1e4);
          if (profileRowsError && profileRowsError.code !== "42P01") {
            return Response.json({ error: profileRowsError.message }, { status: 500 });
          }
          const profiles = Array.isArray(profileRows) ? profileRows : [];
          const profileByEmail = new Map(
            profiles.map((row) => [String(row.email || "").trim().toLowerCase(), row]).filter(([email]) => Boolean(email))
          );
          if (users.length === 0) {
            const match = profiles.find((row) => {
              const email2 = String(row.email || "").toLowerCase().trim();
              const emailUsername2 = email2.split("@")[0] || "";
              const display = String(row.display_name || "").trim();
              const candidate = normalizeUsername$1(display || emailUsername2);
              return candidate === normalizedRequestedUsername;
            });
            if (!match) {
              return Response.json({ error: "Profile not found." }, { status: 404 });
            }
            const email = String(match.email || "").toLowerCase().trim();
            const emailUsername = email.split("@")[0] || normalizedRequestedUsername;
            return Response.json({
              profile: {
                username: normalizeUsername$1(String(match.display_name || "").trim() || emailUsername),
                displayName: String(match.display_name || "").trim() || emailUsername,
                avatarUrl: match.avatar_url || null,
                bio: match.bio || null,
                skills: Array.isArray(match.skills) ? match.skills : [],
                connectedAccounts: [],
                updatedAt: match.updated_at || null
              }
            });
          }
          const usernameMap = assignDeterministicUsernames(users);
          const userByUsername = /* @__PURE__ */ new Map();
          for (const user of users) {
            const email = String(user.email || "").trim().toLowerCase();
            if (!email) continue;
            const profile2 = profileByEmail.get(email);
            const profileUsername2 = normalizeMemberUsername(profile2?.display_name || "");
            const deterministicUsername = usernameMap.get(String(user.id || ""));
            const username2 = profileUsername2 || deterministicUsername;
            if (username2) {
              userByUsername.set(normalizeUsername$1(username2), user);
            }
            if (deterministicUsername && deterministicUsername !== username2) {
              userByUsername.set(normalizeUsername$1(deterministicUsername), user);
            }
          }
          const authUser = userByUsername.get(normalizedRequestedUsername);
          if (!authUser?.id || !authUser.email) {
            return Response.json({ error: "Profile not found." }, { status: 404 });
          }
          const admin = hasSupabaseAdminConfig() ? getSupabaseAdminClient() : null;
          const profilePromise = Promise.resolve({
            data: profileByEmail.get(String(authUser.email).toLowerCase()) || null,
            error: null
          });
          const identitiesPromise = admin ? admin.schema("auth").from("identities").select("provider, identity_data").eq("user_id", authUser.id) : Promise.resolve({ data: [], error: null });
          const [{ data: rawProfile, error: profileError }, { data: rawIdentities, error: identitiesError }] = await Promise.all([profilePromise, identitiesPromise]);
          if (profileError && profileError.code !== "42P01") {
            return Response.json({ error: profileError.message }, { status: 500 });
          }
          if (identitiesError) {
            return Response.json({ error: identitiesError.message }, { status: 500 });
          }
          const profile = rawProfile || null;
          const identities = Array.isArray(rawIdentities) ? rawIdentities : [];
          const meta = authUser.user_metadata ?? null;
          const profileUsername = normalizeMemberUsername(profile?.display_name || "");
          const username = profileUsername || usernameMap.get(String(authUser.id)) || normalizedRequestedUsername;
          const connectedAccounts = identities.map((row) => {
            const handle = row.identity_data?.preferred_username || row.identity_data?.username || row.identity_data?.user_name || row.identity_data?.channel || null;
            const explicitUrl = row.identity_data?.profile_url || null;
            return {
              provider: row.provider,
              providerLabel: providerLabel(row.provider),
              handle,
              url: explicitUrl || (handle ? providerProfileUrl(row.provider, handle) : null)
            };
          }).filter((entry) => Boolean(entry.provider));
          return Response.json({
            profile: {
              username,
              displayName: profile?.display_name || readDisplayNameFromMetadata(meta) || username,
              avatarUrl: profile?.avatar_url || readAvatarFromMetadata(meta),
              bio: profile?.bio || null,
              skills: profile?.skills || [],
              connectedAccounts,
              updatedAt: profile?.updated_at || null
            }
          });
        } catch (error) {
          if (error instanceof Error) {
            console.error("[public-profile] failed to load profile", error.message);
          }
          return Response.json({ error: "Could not load public profile right now." }, { status: 500 });
        }
      }
    }
  }
});
function normalizeUsername(value) {
  return value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/-{2,}/g, "-").replace(/^-+|-+$/g, "");
}
function getBearerToken$4(request) {
  const authHeader = request.headers.get("authorization") || request.headers.get("Authorization") || "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) return void 0;
  const token = authHeader.slice(7).trim();
  return token || void 0;
}
const Route$w = createFileRoute("/api/public-directory")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const q = (url.searchParams.get("q") || "").trim().toLowerCase();
          const limitParam = Number(url.searchParams.get("limit") || "200");
          const limit = Number.isFinite(limitParam) ? Math.max(1, Math.min(500, Math.floor(limitParam))) : 200;
          const client = hasSupabaseAdminConfig() ? getSupabaseAdminClient() : getSupabaseServerClientForToken(getBearerToken$4(request));
          let users = await listAuthIndexedUsers(client);
          if (users.length === 0 && hasSupabaseAdminConfig()) {
            const admin = getSupabaseAdminClient();
            const collected = [];
            let page = 1;
            const perPage = 1e3;
            while (page <= 10) {
              const { data: usersData, error: usersError } = await admin.auth.admin.listUsers({ page, perPage });
              if (usersError) break;
              const pageUsers = usersData?.users || [];
              if (!pageUsers.length) break;
              collected.push(...pageUsers);
              if (pageUsers.length < perPage) break;
              page += 1;
            }
            users = collected.map((row) => ({
              id: row.id,
              email: row.email,
              user_metadata: row.user_metadata || null,
              created_at: row.created_at,
              updated_at: row.updated_at || row.created_at,
              identities: null
            }));
          }
          const { data: profiles, error: profilesError } = await client.from("org_member_profiles").select("email, display_name, avatar_url, bio").limit(1e4);
          if (profilesError) {
            return Response.json({ error: profilesError.message }, { status: 500 });
          }
          const profileRows = Array.isArray(profiles) ? profiles : [];
          const profileByEmail = new Map(profileRows.map((row) => [String(row.email || "").trim().toLowerCase(), row]));
          const usernameMap = assignDeterministicUsernames(users);
          let entries = users.map((user) => {
            const email = String(user.email || "").trim().toLowerCase();
            if (!email || !user.id) return null;
            const profile = profileByEmail.get(email);
            const profileUsername = normalizeMemberUsername(profile?.display_name || "");
            const username = profileUsername || usernameMap.get(String(user.id));
            if (!username) return null;
            const displayName = profile?.display_name?.trim() || readDisplayNameFromMetadata(user.user_metadata || null) || username;
            const metadata = user.user_metadata || {};
            const connectedProviders = /* @__PURE__ */ new Set();
            if (metadata.kick_username) connectedProviders.add("kick");
            if (metadata.selected_youtube_channel) connectedProviders.add("youtube");
            if (metadata.twitch_username) connectedProviders.add("twitch");
            if (metadata.youtube_handle) connectedProviders.add("youtube");
            const identities = Array.isArray(user.identities) ? user.identities : [];
            for (const identity of identities) {
              const provider = String(identity?.provider || "").trim().toLowerCase();
              if (provider && provider !== "email") {
                connectedProviders.add(provider);
              }
            }
            return {
              username,
              displayName,
              avatarUrl: profile?.avatar_url || readAvatarFromMetadata(user.user_metadata || null),
              bio: profile?.bio || null,
              connectedCount: connectedProviders.size
            };
          }).filter((entry) => Boolean(entry)).filter((entry) => {
            if (!q) return true;
            const haystack = `${entry.username} ${entry.displayName} ${entry.bio || ""}`.toLowerCase();
            return haystack.includes(q);
          }).sort((a, b) => a.username.localeCompare(b.username)).slice(0, limit);
          if (entries.length === 0) {
            const { data: roleEmails } = await client.from("org_user_roles").select("email").limit(1e4);
            const roleRows = Array.isArray(roleEmails) ? roleEmails : [];
            const allEmails = /* @__PURE__ */ new Set();
            for (const profile of profileRows) {
              const email = String(profile.email || "").trim().toLowerCase();
              if (email) allEmails.add(email);
            }
            for (const roleRow of roleRows) {
              const email = String(roleRow.email || "").trim().toLowerCase();
              if (email) allEmails.add(email);
            }
            entries = Array.from(allEmails).map((email) => {
              const profile = profileByEmail.get(email);
              const rawUsername = profile?.display_name?.trim() || email.split("@")[0] || "";
              const username = normalizeUsername(rawUsername);
              if (!username) return null;
              return {
                username,
                displayName: profile?.display_name?.trim() || username,
                avatarUrl: profile?.avatar_url || null,
                bio: profile?.bio || null,
                connectedCount: 0
              };
            }).filter((entry) => Boolean(entry)).filter((entry) => {
              if (!q) return true;
              const haystack = `${entry.username} ${entry.displayName} ${entry.bio || ""}`.toLowerCase();
              return haystack.includes(q);
            }).sort((a, b) => a.username.localeCompare(b.username)).slice(0, limit);
          }
          return Response.json({ entries });
        } catch (error) {
          if (error instanceof Error) {
            console.error("[public-directory] failed to load directory", error.message);
          }
          return Response.json(
            { error: error instanceof Error ? error.message : "Could not load directory right now." },
            { status: 500 }
          );
        }
      }
    }
  }
});
const BUCKET$3 = "blog-media";
const LATEST_METADATA_PATH$1 = "app-releases/android/latest.json";
const LOCAL_PUBLIC_METADATA_PATH = path.join(process.cwd(), "public", LATEST_METADATA_PATH$1);
const LOCAL_PUBLIC_APK_PATH = path.join(process.cwd(), "public", "wagesociety.apk");
const Route$v = createFileRoute("/api/public-apk")({
  server: {
    handlers: {
      GET: async () => {
        try {
          if (!hasSupabaseAdminConfig()) {
            try {
              const raw2 = await fs.readFile(LOCAL_PUBLIC_METADATA_PATH, "utf8");
              const release2 = JSON.parse(raw2);
              return Response.json({ release: release2 });
            } catch {
              try {
                const stat = await fs.stat(LOCAL_PUBLIC_APK_PATH);
                return Response.json({
                  release: {
                    version: "local",
                    uploadedAt: stat.mtime.toISOString(),
                    fileName: "wagesociety.apk",
                    fileSizeBytes: stat.size,
                    url: "/wagesociety.apk"
                  }
                });
              } catch {
                return Response.json({ release: null });
              }
            }
          }
          const admin = getSupabaseAdminClient();
          const { data, error } = await admin.storage.from(BUCKET$3).download(LATEST_METADATA_PATH$1);
          if (error || !data) {
            return Response.json({ release: null });
          }
          const raw = await data.text();
          const release = JSON.parse(raw);
          return Response.json({ release });
        } catch {
          return Response.json({ release: null });
        }
      }
    }
  }
});
const OWNER_SUPERADMIN_EMAILS = /* @__PURE__ */ new Set(["stotteyman@gmail.com"]);
const SUPERADMIN_FALLBACK_PERMISSIONS = [
  "view_dashboard",
  "view_creator_tools",
  "view_revenue_tracker",
  "view_live_streams",
  "use_autoclipper",
  "manage_livestreams",
  "view_merch",
  "manage_users",
  "manage_permissions",
  "access_admin_dashboard"
];
async function resolveRequester(request) {
  const authHeader = request.headers.get("authorization") || request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) {
    throw new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }
  const authClient = hasSupabaseAdminConfig() ? getSupabaseAdminClient() : getSupabaseServerPublicClient();
  const { data, error } = await authClient.auth.getUser(token);
  const email = data.user?.email?.toLowerCase();
  if (error || !email) {
    throw new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }
  return {
    email,
    source: "supabase-auth"
  };
}
async function resolveOrgRole(email) {
  const normalizedEmail = email.toLowerCase();
  if (OWNER_SUPERADMIN_EMAILS.has(normalizedEmail)) {
    if (!hasSupabaseAdminConfig()) {
      return "superadmin";
    }
    const admin2 = getSupabaseAdminClient();
    const { error: error2 } = await admin2.rpc("set_org_member_role", {
      p_target_email: normalizedEmail,
      p_role: "superadmin",
      p_granted_by: "system:owner-bootstrap"
    });
    if (error2) {
      return "superadmin";
    }
    return "superadmin";
  }
  if (!hasSupabaseAdminConfig()) {
    return "user";
  }
  const admin = getSupabaseAdminClient();
  const { data, error } = await admin.rpc("ensure_org_member_role", {
    p_email: normalizedEmail
  });
  if (error || !data) {
    throw new Response(JSON.stringify({ error: `Role resolution failed: ${error?.message || "Unknown error"}` }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
  if (!isOrgRole(data)) {
    throw new Response(JSON.stringify({ error: "Invalid role in role resolution" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
  return data;
}
async function getRolePermissions(role) {
  if (role === "banned") {
    return [];
  }
  if (!hasSupabaseAdminConfig()) {
    return role === "superadmin" ? SUPERADMIN_FALLBACK_PERMISSIONS : [];
  }
  const admin = getSupabaseAdminClient();
  const { data, error } = await admin.rpc("list_org_permissions_for_role", {
    p_role: role
  });
  if (error) {
    if (role === "superadmin") {
      return SUPERADMIN_FALLBACK_PERMISSIONS;
    }
    throw new Response(JSON.stringify({ error: `Permission lookup failed: ${error.message}` }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
  return (data || []).map((row) => row.permission_key);
}
async function getBanRecord(email) {
  const admin = getSupabaseAdminClient();
  const { data, error } = await admin.from("org_user_roles").select("banned_by, ban_reason, banned_until").eq("email", email.toLowerCase()).maybeSingle();
  if (error) {
    throw new Response(JSON.stringify({ error: `Ban lookup failed: ${error.message}` }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
  if (!data) {
    return null;
  }
  return {
    bannedBy: data.banned_by,
    banReason: data.ban_reason,
    bannedUntil: data.banned_until
  };
}
function resolveViewAsRole(request, actorRole) {
  const rawViewAsRole = request.headers.get("x-view-as-role")?.toLowerCase() || "";
  if (!rawViewAsRole || !isOrgRole(rawViewAsRole)) {
    return null;
  }
  if (actorRole === "banned") {
    return null;
  }
  if (actorRole === "superadmin") {
    return rawViewAsRole;
  }
  if (!canManageRole(actorRole, "user")) {
    return null;
  }
  return canManageRole(actorRole, rawViewAsRole) ? rawViewAsRole : null;
}
async function getRequesterAccess(request) {
  const requester = await resolveRequester(request);
  const actorRole = await resolveOrgRole(requester.email);
  const viewAsRole = resolveViewAsRole(request, actorRole);
  const role = viewAsRole || actorRole;
  if (actorRole === "banned") {
    return {
      requester,
      role,
      actorRole,
      viewingAs: viewAsRole,
      permissions: [],
      isSuperadmin: false,
      ban: await getBanRecord(requester.email)
    };
  }
  if (role === "superadmin") {
    const allPermissions = await getRolePermissions("superadmin");
    return {
      requester,
      role,
      actorRole,
      viewingAs: viewAsRole,
      permissions: allPermissions,
      isSuperadmin: true,
      ban: null
    };
  }
  const permissions = await getRolePermissions(role);
  return {
    requester,
    role,
    actorRole,
    viewingAs: viewAsRole,
    permissions,
    isSuperadmin: false,
    ban: null
  };
}
async function requirePermission(request, permission) {
  const access = await getRequesterAccess(request);
  if (access.role === "banned") {
    throw new Response(JSON.stringify({ error: "Banned accounts have no platform access" }), {
      status: 403,
      headers: { "Content-Type": "application/json" }
    });
  }
  if (access.isSuperadmin) {
    return access;
  }
  if (!access.permissions.includes(permission)) {
    throw new Response(JSON.stringify({ error: `Missing permission: ${permission}` }), {
      status: 403,
      headers: { "Content-Type": "application/json" }
    });
  }
  return access;
}
const BUCKET$2 = "blog-media";
const FOLDER = "profile-avatars";
const ALLOWED_MIME_TYPES = /* @__PURE__ */ new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const ALLOWED_EXTENSIONS$1 = /* @__PURE__ */ new Set(["jpg", "jpeg", "png", "webp", "gif"]);
const MAX_SIZE$1 = 8 * 1024 * 1024;
function getExtension$1(filename) {
  const parts = filename.toLowerCase().split(".");
  return parts.length > 1 ? parts.pop() || "" : "";
}
function getAuthToken(request) {
  const authHeader = request.headers.get("authorization") || "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) return void 0;
  const token = authHeader.slice(7).trim();
  return token || void 0;
}
const Route$u = createFileRoute("/api/profile-photo-upload")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const access = await requirePermission(request, "view_dashboard");
          if (access.role === "banned") {
            return Response.json({ error: "Banned users cannot upload profile photos." }, { status: 403 });
          }
          const requesterEmail = access.requester.email;
          const form = await request.formData();
          const file = form.get("file");
          if (!(file instanceof File)) {
            return Response.json({ error: "Image file is required." }, { status: 400 });
          }
          if (file.size <= 0) {
            return Response.json({ error: "File is empty." }, { status: 400 });
          }
          if (file.size > MAX_SIZE$1) {
            return Response.json(
              { error: `Image is too large. Maximum size is ${Math.floor(MAX_SIZE$1 / (1024 * 1024))} MB.` },
              { status: 413 }
            );
          }
          const ext = getExtension$1(file.name);
          const hasValidMime = ALLOWED_MIME_TYPES.has(file.type);
          const hasValidExt = ALLOWED_EXTENSIONS$1.has(ext);
          if (!hasValidMime && !hasValidExt) {
            return Response.json({ error: "Unsupported image type. Use JPG, PNG, WEBP, or GIF." }, { status: 400 });
          }
          const safeEmail = requesterEmail.replace(/[^a-z0-9._-]+/gi, "_");
          const stamp = Date.now();
          const random = Math.random().toString(36).slice(2, 10);
          const extension = hasValidExt ? ext : "jpg";
          const path2 = `${FOLDER}/${safeEmail}/${stamp}-${random}.${extension}`;
          const contentType = file.type || "application/octet-stream";
          const data = await file.arrayBuffer();
          if (hasSupabaseAdminConfig()) {
            const admin = getSupabaseAdminClient();
            const { error: uploadError2 } = await admin.storage.from(BUCKET$2).upload(path2, data, { contentType, upsert: false });
            if (uploadError2) {
              return Response.json({ error: uploadError2.message }, { status: 500 });
            }
            const { data: publicData2 } = admin.storage.from(BUCKET$2).getPublicUrl(path2);
            return Response.json({ url: publicData2.publicUrl, path: path2 }, { status: 201 });
          }
          const token = getAuthToken(request);
          if (!token) {
            return Response.json(
              { error: "Missing bearer token for upload in fallback mode." },
              { status: 401 }
            );
          }
          const scopedClient = getSupabaseServerClientForToken(token);
          const { error: uploadError } = await scopedClient.storage.from(BUCKET$2).upload(path2, data, { contentType, upsert: false });
          if (uploadError) {
            return Response.json({ error: uploadError.message }, { status: 500 });
          }
          const { data: publicData } = scopedClient.storage.from(BUCKET$2).getPublicUrl(path2);
          return Response.json({ url: publicData.publicUrl, path: path2 }, { status: 201 });
        } catch (error) {
          if (error instanceof Response) return error;
          return Response.json(
            { error: error instanceof Error ? error.message : "Unexpected server error" },
            { status: 500 }
          );
        }
      }
    }
  }
});
const Route$t = createFileRoute("/api/profile")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          await requirePermission(request, "view_creator_tools");
          const url = new URL(request.url);
          const email = url.searchParams.get("email");
          if (!email) return Response.json({ error: "email is required" }, { status: 400 });
          const admin = getSupabaseAdminClient();
          const { data, error } = await admin.from("org_member_profiles").select("email, display_name, avatar_url, bio, skills").eq("email", email).maybeSingle();
          if (error && error.code !== "42P01") {
            return Response.json({ error: error.message }, { status: 500 });
          }
          return Response.json({ profile: data || null });
        } catch (error) {
          if (error instanceof Response) return error;
          return Response.json({ error: "Unexpected server error" }, { status: 500 });
        }
      }
    }
  }
});
const WRITE_ROLES$1 = /* @__PURE__ */ new Set(["superadmin", "admin", "manager", "staff", "helper", "user"]);
const ALLOWED_IMAGES = /* @__PURE__ */ new Set(["jpg", "jpeg", "png", "gif", "webp"]);
const ALLOWED_VIDEOS = /* @__PURE__ */ new Set(["mp4", "webm", "mov", "avi", "mkv"]);
const Route$s = createFileRoute("/api/news-upload")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          let requesterEmail = "";
          let accessToken = "";
          if (hasSupabaseAdminConfig()) {
            const access = await getRequesterAccess(request);
            if (!WRITE_ROLES$1.has(access.role)) {
              return Response.json({ error: "Insufficient permissions" }, { status: 403 });
            }
            requesterEmail = access.requester.email;
          } else {
            const authHeader = request.headers.get("authorization") || request.headers.get("Authorization") || "";
            const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
            if (!token) {
              return Response.json({ error: "Unauthorized" }, { status: 401 });
            }
            const client = getSupabaseServerClientForToken(token);
            const {
              data: { user },
              error: error2
            } = await client.auth.getUser(token);
            if (error2 || !user?.email) {
              return Response.json({ error: "Unauthorized" }, { status: 401 });
            }
            requesterEmail = user.email.toLowerCase();
            accessToken = token;
          }
          const form = await request.formData();
          const file = form.get("file");
          if (!file) {
            return Response.json({ error: "No file uploaded" }, { status: 400 });
          }
          const ext = file.name.split(".").pop()?.toLowerCase() || "bin";
          const isImage = ALLOWED_IMAGES.has(ext);
          const isVideo = ALLOWED_VIDEOS.has(ext);
          if (!isImage && !isVideo) {
            return Response.json({ error: "Invalid file type" }, { status: 400 });
          }
          const bucket = "blog-media";
          const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
          const filePath = `${requesterEmail}/${Date.now()}-${safeName}`;
          const supabase = hasSupabaseAdminConfig() ? getSupabaseAdminClient() : getSupabaseServerClientForToken(accessToken || void 0);
          const { error } = await supabase.storage.from(bucket).upload(filePath, file, {
            contentType: file.type,
            upsert: false
          });
          if (error) {
            return Response.json({ error: error.message }, { status: 500 });
          }
          const publicUrl = supabase.storage.from(bucket).getPublicUrl(filePath).data.publicUrl;
          return Response.json({ url: publicUrl, kind: isImage ? "image" : "video" }, { status: 201 });
        } catch (error) {
          if (error instanceof Response) return error;
          return Response.json(
            { error: error instanceof Error ? error.message : "Unexpected server error" },
            { status: 500 }
          );
        }
      }
    }
  }
});
const WRITE_ROLES = /* @__PURE__ */ new Set(["superadmin", "admin", "manager", "staff", "helper", "user"]);
const NewsPostSchema = z.object({
  title: z.string().min(3).max(200),
  body: z.string().min(1).max(2e4),
  image_urls: z.array(z.string().url()).max(10).default([]),
  video_urls: z.array(z.string().url()).max(10).default([]),
  embed_links: z.array(z.string().url()).max(20).default([])
});
function isMissingBlogTableError(error) {
  const code = String(error?.code || "").toUpperCase();
  const message = String(error?.message || "").toLowerCase();
  return code === "42P01" || code === "PGRST205" || message.includes("org_blog_posts") || message.includes("schema cache");
}
const Route$r = createFileRoute("/api/news")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const client = getSupabaseServerPublicClient();
          const { data, error } = await client.from("org_blog_posts").select("id, title, body, author_email, image_urls, video_urls, embed_links, created_at, updated_at").eq("is_published", true).order("created_at", { ascending: false });
          if (error) {
            if (isMissingBlogTableError(error)) {
              return Response.json([]);
            }
            return Response.json({ error: error.message }, { status: 500 });
          }
          const posts = (data || []).map((row) => ({
            id: row.id,
            title: row.title,
            body: row.body,
            author: row.author_email,
            image_urls: row.image_urls || [],
            video_urls: row.video_urls || [],
            embed_links: row.embed_links || [],
            created_at: row.created_at,
            updated_at: row.updated_at
          }));
          return Response.json(posts);
        } catch (error) {
          if (error instanceof Response) return error;
          return Response.json(
            { error: error instanceof Error ? error.message : "Unexpected server error" },
            { status: 500 }
          );
        }
      },
      POST: async ({ request }) => {
        try {
          let authorEmail = "";
          let canContribute = false;
          if (hasSupabaseAdminConfig()) {
            const access = await getRequesterAccess(request);
            canContribute = WRITE_ROLES.has(access.role) && access.role !== "banned";
            authorEmail = access.requester.email;
          } else {
            return Response.json(
              { error: "Blog contributions require SUPABASE_SERVICE_ROLE_KEY in this environment." },
              { status: 503 }
            );
          }
          if (!canContribute) {
            return Response.json({ error: "Insufficient permissions" }, { status: 403 });
          }
          const payload = NewsPostSchema.safeParse(await request.json());
          if (!payload.success) {
            return Response.json({ error: payload.error.flatten() }, { status: 400 });
          }
          const normalized = {
            title: payload.data.title.trim(),
            body: payload.data.body.trim(),
            image_urls: payload.data.image_urls,
            video_urls: payload.data.video_urls,
            embed_links: payload.data.embed_links
          };
          const db = hasSupabaseAdminConfig() ? getSupabaseAdminClient() : getSupabaseServerPublicClient();
          const { data, error } = await db.from("org_blog_posts").insert([
            {
              ...normalized,
              author_email: authorEmail
            }
          ]).select("id, title, body, author_email, image_urls, video_urls, embed_links, created_at, updated_at");
          if (error) {
            if (isMissingBlogTableError(error)) {
              return Response.json(
                { error: "Blog storage table is not set up yet. Please run the blog schema migration first." },
                { status: 503 }
              );
            }
            return Response.json({ error: error.message }, { status: 500 });
          }
          return Response.json((data || [])[0], { status: 201 });
        } catch (error) {
          if (error instanceof Response) return error;
          return Response.json(
            { error: error instanceof Error ? error.message : "Unexpected server error" },
            { status: 500 }
          );
        }
      },
      HEAD: async () => {
        return new Response(null, { status: 200 });
      },
      OPTIONS: async () => {
        return new Response(null, {
          status: 204,
          headers: {
            Allow: "GET, POST, HEAD, OPTIONS"
          }
        });
      }
    }
  }
});
const SUBSCRIBE_RATE_LIMIT_WINDOW_MS = 5 * 60 * 1e3;
const SUBSCRIBE_RATE_LIMIT_MAX_REQUESTS = 10;
const subscribeRequestLog = /* @__PURE__ */ new Map();
function getQuarterStartIso(now) {
  const quarter = Math.floor(now.getUTCMonth() / 3);
  const quarterStartMonth = quarter * 3;
  return new Date(Date.UTC(now.getUTCFullYear(), quarterStartMonth, 1, 0, 0, 0, 0)).toISOString();
}
function average(values) {
  if (!values.length) return null;
  const total = values.reduce((sum, value) => sum + value, 0);
  return total / values.length;
}
function getRequestIp(request) {
  const forwardedFor = request.headers.get("x-forwarded-for") || "";
  const firstForwarded = forwardedFor.split(",")[0]?.trim();
  if (firstForwarded) return firstForwarded;
  return request.headers.get("x-real-ip") || "unknown";
}
function isRateLimited(request) {
  const key = getRequestIp(request);
  const now = Date.now();
  const cutoff = now - SUBSCRIBE_RATE_LIMIT_WINDOW_MS;
  const prior = subscribeRequestLog.get(key) || [];
  const active = prior.filter((value) => value >= cutoff);
  if (active.length >= SUBSCRIBE_RATE_LIMIT_MAX_REQUESTS) {
    subscribeRequestLog.set(key, active);
    return true;
  }
  active.push(now);
  subscribeRequestLog.set(key, active);
  return false;
}
const subscribeSchema = z.object({
  email: z.string().trim().email().max(200),
  liveAlerts: z.boolean().default(true),
  newsletter: z.boolean().default(true),
  productUpdates: z.boolean().default(false),
  communityUpdates: z.boolean().default(false),
  source: z.string().trim().max(60).optional()
});
const Route$q = createFileRoute("/api/marketing-proof")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const access = await getRequesterAccess(request);
          if (isRateLimited(request)) {
            return Response.json(
              { error: "Too many requests. Please wait and try again." },
              { status: 429 }
            );
          }
          const body = await request.json();
          const parsed = subscribeSchema.safeParse(body);
          if (!parsed.success) {
            return Response.json({ error: "Invalid payload" }, { status: 400 });
          }
          const { email, liveAlerts, newsletter, productUpdates, communityUpdates, source } = parsed.data;
          const requestedEmail = email.toLowerCase();
          const accountEmail = access.requester.email.toLowerCase();
          if (requestedEmail !== accountEmail) {
            return Response.json(
              { error: "Subscription email must match your account email." },
              { status: 403 }
            );
          }
          if (!liveAlerts && !newsletter && !productUpdates && !communityUpdates) {
            return Response.json({ error: "Please choose at least one notification type." }, { status: 400 });
          }
          const admin = getSupabaseAdminClient();
          const { error } = await admin.from("notification_subscribers").upsert(
            {
              email: requestedEmail,
              live_alerts: liveAlerts,
              newsletter,
              product_updates: productUpdates,
              community_updates: communityUpdates,
              source: source || "app",
              status: "active",
              subscribed_at: (/* @__PURE__ */ new Date()).toISOString(),
              unsubscribed_at: null,
              updated_at: (/* @__PURE__ */ new Date()).toISOString()
            },
            { onConflict: "email" }
          );
          if (error) return Response.json({ error: "Could not save subscription right now." }, { status: 500 });
          return Response.json({ ok: true, subscribed: true });
        } catch (error) {
          if (error instanceof Response) return error;
          return Response.json({ error: "Unexpected server error" }, { status: 500 });
        }
      },
      GET: async ({ request }) => {
        try {
          await requirePermission(request, "access_admin_dashboard");
          const admin = getSupabaseAdminClient();
          const quarterStartIso = getQuarterStartIso(/* @__PURE__ */ new Date());
          const [
            { count: activeMembersCount, error: membersError },
            { count: winsThisQuarterCount, error: winsError },
            { data: completedEntriesData, error: completedEntriesError }
          ] = await Promise.all([
            admin.from("org_user_roles").select("email", { head: true, count: "exact" }).neq("role", "banned"),
            admin.from("org_dashboard_tool_entries").select("id", { head: true, count: "exact" }).eq("status", "done").gte("updated_at", quarterStartIso),
            admin.from("org_dashboard_tool_entries").select("created_at, updated_at").eq("status", "done").not("updated_at", "is", null).limit(1e3)
          ]);
          if (membersError) return Response.json({ error: membersError.message }, { status: 500 });
          if (winsError) return Response.json({ error: winsError.message }, { status: 500 });
          if (completedEntriesError) return Response.json({ error: completedEntriesError.message }, { status: 500 });
          const completionHours = (completedEntriesData || []).map((entry) => {
            const createdAt = new Date(entry.created_at).getTime();
            const updatedAt = new Date(entry.updated_at).getTime();
            if (!Number.isFinite(createdAt) || !Number.isFinite(updatedAt)) return null;
            const diffMs = updatedAt - createdAt;
            if (diffMs < 0) return null;
            return diffMs / (1e3 * 60 * 60);
          }).filter((value) => value !== null);
          return Response.json({
            activeMembers: activeMembersCount || 0,
            memberWinsThisQuarter: winsThisQuarterCount || 0,
            averageTimeToFirstActionHours: average(completionHours),
            sampleSize: completionHours.length,
            asOf: (/* @__PURE__ */ new Date()).toISOString()
          });
        } catch {
          return Response.json({ error: "Unexpected server error" }, { status: 500 });
        }
      }
    }
  }
});
const trackViewSchema = z.object({
  documentId: z.string().uuid()
});
const adminViewsQuerySchema = z.object({
  documentId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100)
});
const Route$p = createFileRoute("/api/knowledge-vault")({
  server: {
    handlers: {
      /**
       * POST /api/knowledge-vault
       * Body: { documentId: string }
       * Records that the authenticated user viewed a document.
       */
      POST: async ({ request }) => {
        try {
          const access = await requirePermission(request, "view_creator_tools");
          const body = await request.json();
          const parsed = trackViewSchema.safeParse(body);
          if (!parsed.success) {
            return Response.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
          }
          const admin = getSupabaseAdminClient();
          const { error } = await admin.from("org_knowledge_vault_views").insert({
            document_id: parsed.data.documentId,
            viewer_email: access.requester.email,
            viewer_role: access.role
          });
          if (error && error.code !== "42P01") {
            return Response.json({ error: error.message }, { status: 500 });
          }
          return Response.json({ tracked: true });
        } catch (error) {
          if (error instanceof Response) return error;
          return Response.json({ error: "Unexpected server error" }, { status: 500 });
        }
      },
      /**
       * GET /api/knowledge-vault?documentId=<id>&limit=<n>
       * Admin-only: returns view history for a document or all documents.
       */
      GET: async ({ request }) => {
        try {
          const access = await requirePermission(request, "access_admin_dashboard");
          const url = new URL(request.url);
          const parsed = adminViewsQuerySchema.safeParse({
            documentId: url.searchParams.get("documentId") ?? void 0,
            limit: url.searchParams.get("limit") ?? 100
          });
          if (!parsed.success) {
            return Response.json({ error: "Invalid query" }, { status: 400 });
          }
          const admin = getSupabaseAdminClient();
          let query = admin.from("org_knowledge_vault_views").select("id, document_id, viewer_email, viewer_role, viewed_at").order("viewed_at", { ascending: false }).limit(parsed.data.limit);
          if (parsed.data.documentId) {
            query = query.eq("document_id", parsed.data.documentId);
          }
          const { data, error } = await query;
          if (error && error.code === "42P01") {
            return Response.json({ views: [], note: "Views table not yet created." });
          }
          if (error) return Response.json({ error: error.message }, { status: 500 });
          return Response.json({
            requester: { email: access.requester.email, role: access.role },
            views: data || []
          });
        } catch (error) {
          if (error instanceof Response) return error;
          return Response.json({ error: "Unexpected server error" }, { status: 500 });
        }
      }
    }
  }
});
const Route$o = createFileRoute("/api/kick-login")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const clientId = process.env.KICK_CLIENT_ID;
        const redirectUri = process.env.KICK_REDIRECT_URI || `${new URL(request.url).origin}/api/kick-callback`;
        if (!clientId) {
          return Response.json({ error: "Kick OAuth is not configured on this server." }, { status: 500 });
        }
        const state = crypto.randomUUID();
        const popup = new URL(request.url).searchParams.get("popup") === "1" ? "1" : "0";
        const params = new URLSearchParams({
          response_type: "code",
          client_id: clientId,
          redirect_uri: redirectUri,
          scope: "user:profile",
          state
        });
        const authUrl = `https://id.kick.com/oauth/authorize?${params.toString()}`;
        const response = Response.redirect(authUrl, 302);
        response.headers.set(
          "Set-Cookie",
          `kick_oauth_state=${state}|${popup}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`
        );
        return response;
      }
    }
  }
});
const LOCALHOST_HOSTS = /* @__PURE__ */ new Set(["localhost", "127.0.0.1"]);
function normalizePath(path2) {
  if (!path2) return "/";
  return path2.startsWith("/") ? path2 : `/${path2}`;
}
function normalizeAuthOrigin(origin) {
  try {
    const parsed = new URL(origin);
    if (LOCALHOST_HOSTS.has(parsed.hostname) && parsed.port !== "3000") {
      parsed.port = "3000";
    }
    return parsed.origin;
  } catch {
    return origin;
  }
}
function buildAuthRedirectUrl(origin, path2) {
  return `${normalizeAuthOrigin(origin)}${normalizePath(path2)}`;
}
function getClientAuthRedirectUrl(path2) {
  if (typeof window === "undefined") return path2;
  return buildAuthRedirectUrl(window.location.origin, path2);
}
function popupResponse(origin, payload, clearCookie) {
  const json = JSON.stringify({ type: "kick-oauth-complete", ...payload });
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/></head><body><script>
try { window.opener && window.opener.postMessage(${json}, ${JSON.stringify(origin)}); } catch(e){}
window.close();
<\/script></body></html>`;
  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Set-Cookie": clearCookie }
  });
}
const Route$n = createFileRoute("/api/kick-callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const authOrigin = normalizeAuthOrigin(url.origin);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const errorParam = url.searchParams.get("error");
        const clearCookie = "kick_oauth_state=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0";
        const cookieHeader = request.headers.get("cookie") || "";
        const cookieRaw = cookieHeader.split(";").map((c) => c.trim()).find((c) => c.startsWith("kick_oauth_state="))?.replace("kick_oauth_state=", "") ?? "";
        const [cookieState, popupFlag] = cookieRaw.includes("|") ? cookieRaw.split("|", 2) : [cookieRaw, "0"];
        const isPopup = popupFlag === "1";
        const errRedirect = (errCode) => {
          if (isPopup) return popupResponse(authOrigin, { status: "error", error: errCode }, clearCookie);
          return Response.redirect(buildAuthRedirectUrl(authOrigin, `/dashboard?error=${errCode}`), 302);
        };
        if (errorParam) return errRedirect("kick_oauth_denied");
        if (!state || !cookieState || state !== cookieState) return errRedirect("kick_oauth_invalid_state");
        if (!code) return errRedirect("kick_oauth_no_code");
        const clientId = process.env.KICK_CLIENT_ID;
        const clientSecret = process.env.KICK_CLIENT_SECRET;
        const redirectUri = process.env.KICK_REDIRECT_URI || buildAuthRedirectUrl(authOrigin, "/api/kick-callback");
        if (!clientId || !clientSecret) return errRedirect("kick_not_configured");
        try {
          const tokenResponse = await fetch("https://id.kick.com/oauth/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              grant_type: "authorization_code",
              client_id: clientId,
              client_secret: clientSecret,
              redirect_uri: redirectUri,
              code
            }).toString()
          });
          if (!tokenResponse.ok) return errRedirect("kick_token_exchange_failed");
          const tokens = await tokenResponse.json();
          const profileResponse = await fetch("https://kick.com/api/v1/user", {
            headers: { Authorization: `Bearer ${tokens.access_token}` }
          });
          if (!profileResponse.ok) return errRedirect("kick_profile_fetch_failed");
          const kickUser = await profileResponse.json();
          const email = kickUser.email || `kick_${kickUser.id}@kick.wagesociety.local`;
          const admin = getSupabaseAdminClient();
          const { data: existingUsers } = await admin.auth.admin.listUsers();
          const existing = existingUsers?.users?.find((u) => u.email === email);
          if (existing) {
            const existingMeta = existing.user_metadata ?? {};
            await admin.auth.admin.updateUserById(existing.id, {
              user_metadata: {
                ...existingMeta,
                username: kickUser.username,
                full_name: kickUser.name || kickUser.username,
                avatar_url: kickUser.profile_pic || null,
                kick_username: kickUser.username,
                kick_id: kickUser.id,
                membership_plan: String(existingMeta.membership_plan || "free")
              }
            });
          } else {
            const { data: newUser, error: createError } = await admin.auth.admin.createUser({
              email,
              email_confirm: true,
              user_metadata: {
                username: kickUser.username,
                full_name: kickUser.name || kickUser.username,
                avatar_url: kickUser.profile_pic || null,
                kick_username: kickUser.username,
                kick_id: kickUser.id,
                membership_plan: "free",
                onboarding_completed: false
              }
            });
            if (createError || !newUser.user) return errRedirect("kick_account_create_failed");
            await admin.rpc("ensure_org_member_role", {
              p_email: email,
              p_role: "user"
            });
          }
          const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
            type: "magiclink",
            email,
            options: { redirectTo: buildAuthRedirectUrl(authOrigin, "/dashboard") }
          });
          if (linkError || !linkData?.properties?.action_link) return errRedirect("kick_session_create_failed");
          if (isPopup) {
            return popupResponse(authOrigin, { status: "success", kickUsername: kickUser.username, magicLink: linkData.properties.action_link }, clearCookie);
          }
          const redirect2 = Response.redirect(linkData.properties.action_link, 302);
          redirect2.headers.set("Set-Cookie", clearCookie);
          return redirect2;
        } catch {
          return errRedirect("kick_unexpected_error");
        }
      }
    }
  }
});
function getStripeSecretKey() {
  return process.env.STRIPE_SECRET_KEY || process.env.STRIPE_API_KEY || process.env.STRIPE_SECRET || "";
}
function getStripe() {
  const key = getStripeSecretKey();
  if (!key) {
    throw new Error(
      "Billing is not configured. Set STRIPE_SECRET_KEY (or STRIPE_API_KEY / STRIPE_SECRET) in Netlify environment variables."
    );
  }
  return new Stripe(key, { apiVersion: "2026-03-25.dahlia" });
}
function getBaseUrl(request) {
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") || "http";
  if (!host) return "http://localhost:3000";
  return `${proto}://${host}`;
}
function getBearerToken$3(request) {
  const authHeader = request.headers.get("authorization") || request.headers.get("Authorization") || "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) return void 0;
  const token = authHeader.slice(7).trim();
  return token || void 0;
}
function getServerClientForRequest(request) {
  if (hasSupabaseAdminConfig()) {
    return getSupabaseAdminClient();
  }
  const token = getBearerToken$3(request);
  if (token) {
    return getSupabaseServerClientForToken(token);
  }
  return getSupabaseServerPublicClient();
}
async function updateUserMembershipMetadata(request, email, updates) {
  if (hasSupabaseAdminConfig()) {
    const admin = getSupabaseAdminClient();
    const { data: users, error: usersError } = await admin.schema("auth").from("users").select("id, email, raw_user_meta_data").ilike("email", email).limit(1);
    if (usersError) throw new Error(usersError.message);
    const user2 = Array.isArray(users) ? users[0] : null;
    if (!user2?.id) return;
    const currentMeta2 = user2.raw_user_meta_data ?? {};
    const nextMeta2 = {
      ...currentMeta2,
      ...updates
    };
    const { error: updateError2 } = await admin.auth.admin.updateUserById(user2.id, {
      user_metadata: nextMeta2
    });
    if (updateError2) throw new Error(updateError2.message);
    return;
  }
  const token = getBearerToken$3(request);
  if (!token) {
    throw new Error("Missing user token for metadata update");
  }
  const userClient = getSupabaseServerClientForToken(token);
  const {
    data: { user },
    error: userError
  } = await userClient.auth.getUser(token);
  if (userError || !user?.email) {
    throw new Error(userError?.message || "Could not resolve current user");
  }
  if (user.email.toLowerCase() !== email.toLowerCase()) {
    throw new Error("Metadata update email mismatch");
  }
  const currentMeta = user.user_metadata ?? {};
  const nextMeta = {
    ...currentMeta,
    ...updates
  };
  const { error: updateError } = await userClient.auth.updateUser({
    data: nextMeta
  });
  if (updateError) throw new Error(updateError.message);
}
const Route$m = createFileRoute("/api/create-payment-intent")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          if (!getStripeSecretKey()) {
            return Response.json(
              {
                error: "Billing is not configured. Missing STRIPE_SECRET_KEY in server environment."
              },
              { status: 503 }
            );
          }
          const access = await getRequesterAccess(request);
          const body = await request.json();
          const normalizedPlanSlug = String(body.planSlug || "").trim().toLowerCase();
          const { email, name } = body;
          if (!normalizedPlanSlug || !email) {
            return Response.json({ error: "planSlug and email are required." }, { status: 400 });
          }
          const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!EMAIL_RE.test(email)) {
            return Response.json({ error: "Invalid email address." }, { status: 400 });
          }
          if (email.toLowerCase() !== access.requester.email) {
            return Response.json({ error: "Email must match the authenticated user." }, { status: 403 });
          }
          const serverClient = getServerClientForRequest(request);
          const { data: _plan, error: planError } = await serverClient.from("org_shop_membership_plans").select("id, slug, name, price_cents, display_price").eq("slug", normalizedPlanSlug).eq("is_active", true).single();
          const plan = _plan;
          if (planError || !plan) {
            return Response.json(
              {
                error: "Plan not found.",
                planSlug: normalizedPlanSlug,
                details: planError?.message || null
              },
              { status: 404 }
            );
          }
          const stripe = getStripe();
          const existingCustomers = await stripe.customers.list({ email, limit: 1 });
          let customer = existingCustomers.data[0];
          if (!customer) {
            customer = await stripe.customers.create({
              email,
              name: name || void 0,
              metadata: { membership_plan: plan.slug }
            });
          }
          const activeStatuses = ["active", "trialing", "past_due", "incomplete"];
          const subs = await stripe.subscriptions.list({
            customer: customer.id,
            status: "all",
            limit: 25
          });
          const existingSubscription = subs.data.find(
            (sub) => activeStatuses.includes(sub.status)
          );
          const baseUrl = getBaseUrl(request);
          if (plan.price_cents === 0) {
            if (existingSubscription) {
              await stripe.subscriptions.cancel(existingSubscription.id);
            }
            await updateUserMembershipMetadata(request, email.toLowerCase(), {
              membership_plan: plan.slug,
              stripe_customer_id: customer.id,
              stripe_subscription_id: void 0
            });
            await serverClient.rpc("ensure_org_member_role", {
              p_email: email.toLowerCase()
            });
            return Response.json({
              free: true,
              planSlug: plan.slug,
              successUrl: `${baseUrl}/dashboard?membership=${encodeURIComponent(plan.slug)}&status=success`
            });
          }
          if (existingSubscription) {
            const createdPrice = await stripe.prices.create({
              currency: "usd",
              unit_amount: plan.price_cents,
              recurring: { interval: "month" },
              product_data: {
                name: `${plan.name} Membership`,
                metadata: { planSlug: plan.slug }
              },
              metadata: { planSlug: plan.slug }
            });
            const currentItem = existingSubscription.items.data[0];
            if (!currentItem) {
              return Response.json({ error: "Subscription item not found." }, { status: 500 });
            }
            const updatedSubscription = await stripe.subscriptions.update(existingSubscription.id, {
              items: [
                {
                  id: currentItem.id,
                  price: createdPrice.id
                }
              ],
              proration_behavior: "always_invoice",
              metadata: {
                ...existingSubscription.metadata || {},
                membership_plan: plan.slug,
                customerEmail: email.toLowerCase()
              }
            });
            await updateUserMembershipMetadata(request, email.toLowerCase(), {
              membership_plan: plan.slug,
              stripe_customer_id: customer.id,
              stripe_subscription_id: updatedSubscription.id
            });
            await serverClient.rpc("ensure_org_member_role", {
              p_email: email.toLowerCase()
            });
            return Response.json({
              updated: true,
              planSlug: plan.slug,
              subscriptionId: updatedSubscription.id,
              successUrl: `${baseUrl}/dashboard?membership=${encodeURIComponent(plan.slug)}&status=success`
            });
          }
          const session = await stripe.checkout.sessions.create({
            mode: "subscription",
            customer: customer.id,
            success_url: `${baseUrl}/dashboard?membership=${encodeURIComponent(plan.slug)}&status=success&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${baseUrl}/dashboard?membership=${encodeURIComponent(plan.slug)}&status=cancelled`,
            line_items: [
              {
                quantity: 1,
                price_data: {
                  currency: "usd",
                  unit_amount: plan.price_cents,
                  recurring: { interval: "month" },
                  product_data: {
                    name: `${plan.name} Membership`,
                    metadata: {
                      planSlug: plan.slug
                    }
                  }
                }
              }
            ],
            subscription_data: {
              metadata: {
                membership_plan: plan.slug,
                customerEmail: email.toLowerCase()
              }
            },
            metadata: {
              membership_plan: plan.slug,
              customerEmail: email.toLowerCase()
            }
          });
          return Response.json({
            checkoutUrl: session.url,
            sessionId: session.id,
            customerId: customer.id,
            planName: plan.name,
            displayPrice: plan.display_price
          });
        } catch (err) {
          if (err instanceof Response) {
            return err;
          }
          const message = err instanceof Error ? err.message : "Unexpected server error.";
          return Response.json({ error: message }, { status: 500 });
        }
      }
    }
  }
});
const createSchema$1 = z.object({
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().max(2e3).default(""),
  skillsNeeded: z.array(z.string().trim().max(40)).max(20).default([]),
  spotsAvailable: z.number().int().min(1).max(20).default(1),
  projectUrl: z.string().url().optional().or(z.literal(""))
});
const updateSchema$3 = createSchema$1.partial().extend({
  id: z.string().uuid(),
  status: z.enum(["open", "closed", "completed"]).optional()
});
const deleteSchema = z.object({ id: z.string().uuid() });
const Route$l = createFileRoute("/api/collab")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const access = await requirePermission(request, "view_creator_tools");
          const url = new URL(request.url);
          const mine = url.searchParams.get("mine") === "1";
          const admin = getSupabaseAdminClient();
          let query = admin.from("org_collab_requests").select("id, owner_email, title, description, skills_needed, spots_available, status, project_url, created_at, updated_at").order("created_at", { ascending: false });
          if (mine) {
            query = query.eq("owner_email", access.requester.email);
          } else {
            query = query.eq("status", "open");
          }
          const { data, error } = await query;
          if (error && error.code !== "42P01") {
            return Response.json({ error: error.message }, { status: 500 });
          }
          const requests = data || [];
          const { data: myApps } = await admin.from("org_collab_applications").select("request_id").eq("applicant_email", access.requester.email);
          const myAppRequestIds = new Set(
            (myApps || []).map((a) => a.request_id)
          );
          let appCounts = {};
          if (mine && requests.length) {
            const ids = requests.map((r) => r.id);
            const { data: counts } = await admin.from("org_collab_applications").select("request_id").in("request_id", ids);
            for (const row of counts || []) {
              appCounts[row.request_id] = (appCounts[row.request_id] || 0) + 1;
            }
          }
          return Response.json({
            requests: requests.map((r) => ({
              ...r,
              hasApplied: myAppRequestIds.has(r.id),
              isOwner: r.owner_email === access.requester.email,
              applicantCount: appCounts[r.id] || 0
            }))
          });
        } catch (error) {
          if (error instanceof Response) return error;
          return Response.json({ error: "Unexpected server error" }, { status: 500 });
        }
      },
      POST: async ({ request }) => {
        try {
          const access = await requirePermission(request, "view_creator_tools");
          const body = await request.json();
          const parsed = createSchema$1.safeParse(body);
          if (!parsed.success) {
            return Response.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
          }
          const admin = getSupabaseAdminClient();
          const { data, error } = await admin.from("org_collab_requests").insert({
            owner_email: access.requester.email,
            title: parsed.data.title,
            description: parsed.data.description,
            skills_needed: parsed.data.skillsNeeded,
            spots_available: parsed.data.spotsAvailable,
            project_url: parsed.data.projectUrl || null
          }).select("id, owner_email, title, description, skills_needed, spots_available, status, project_url, created_at, updated_at").single();
          if (error) return Response.json({ error: error.message }, { status: 500 });
          return Response.json({ request: data });
        } catch (error) {
          if (error instanceof Response) return error;
          return Response.json({ error: "Unexpected server error" }, { status: 500 });
        }
      },
      PUT: async ({ request }) => {
        try {
          const access = await requirePermission(request, "view_creator_tools");
          const body = await request.json();
          const parsed = updateSchema$3.safeParse(body);
          if (!parsed.success) {
            return Response.json({ error: "Invalid payload" }, { status: 400 });
          }
          const { id, ...fields } = parsed.data;
          const admin = getSupabaseAdminClient();
          const { data, error } = await admin.from("org_collab_requests").update({
            ...fields.title !== void 0 && { title: fields.title },
            ...fields.description !== void 0 && { description: fields.description },
            ...fields.skillsNeeded !== void 0 && { skills_needed: fields.skillsNeeded },
            ...fields.spotsAvailable !== void 0 && { spots_available: fields.spotsAvailable },
            ...fields.status !== void 0 && { status: fields.status },
            ...fields.projectUrl !== void 0 && { project_url: fields.projectUrl || null },
            updated_at: (/* @__PURE__ */ new Date()).toISOString()
          }).eq("id", id).eq("owner_email", access.requester.email).select("id").maybeSingle();
          if (error) return Response.json({ error: error.message }, { status: 500 });
          if (!data) return Response.json({ error: "Not found or not authorized" }, { status: 403 });
          return Response.json({ updated: true });
        } catch (error) {
          if (error instanceof Response) return error;
          return Response.json({ error: "Unexpected server error" }, { status: 500 });
        }
      },
      DELETE: async ({ request }) => {
        try {
          const access = await requirePermission(request, "view_creator_tools");
          const body = await request.json();
          const parsed = deleteSchema.safeParse(body);
          if (!parsed.success) {
            return Response.json({ error: "Invalid payload" }, { status: 400 });
          }
          const admin = getSupabaseAdminClient();
          const { error } = await admin.from("org_collab_requests").delete().eq("id", parsed.data.id).eq("owner_email", access.requester.email);
          if (error) return Response.json({ error: error.message }, { status: 500 });
          return Response.json({ deleted: true });
        } catch (error) {
          if (error instanceof Response) return error;
          return Response.json({ error: "Unexpected server error" }, { status: 500 });
        }
      }
    }
  }
});
const USERNAME_REGEX$2 = /^[a-zA-Z0-9_-]{3,20}$/;
const Route$k = createFileRoute("/api/check-username")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const username = (url.searchParams.get("username") ?? "").trim();
        const currentEmail = (url.searchParams.get("currentEmail") ?? "").trim().toLowerCase();
        if (!USERNAME_REGEX$2.test(username)) {
          return Response.json(
            {
              available: false,
              username,
              reason: "Username must be 3–20 characters and contain only letters, numbers, underscores, or hyphens."
            },
            { status: 200 }
          );
        }
        try {
          const client = hasSupabaseAdminConfig() ? getSupabaseAdminClient() : getSupabaseServerPublicClient();
          const { data, error } = await client.from("org_member_profiles").select("email, display_name").ilike("display_name", username).limit(1);
          if (error && error.code !== "42P01") {
            return Response.json({ available: true, username, reason: "Availability check is limited in this environment." });
          }
          let takenInMetadata = false;
          const normalized = username.toLowerCase();
          let authIndexUsers = await listAuthIndexedUsers(client);
          if (authIndexUsers.length === 0 && hasSupabaseAdminConfig()) {
            const admin = getSupabaseAdminClient();
            const { data: authUsersPage, error: authUsersError } = await admin.auth.admin.listUsers({
              page: 1,
              perPage: 1e3
            });
            if (!authUsersError) {
              authIndexUsers = (authUsersPage?.users || []).map((row) => ({
                id: row.id,
                email: row.email,
                user_metadata: row.user_metadata ?? null,
                created_at: row.created_at,
                updated_at: row.updated_at || row.created_at,
                identities: null
              }));
            }
          }
          takenInMetadata = authIndexUsers.some((row) => {
            const rowEmail = String(row.email || "").toLowerCase();
            if (currentEmail && rowEmail === currentEmail) return false;
            const meta = row.user_metadata ?? null;
            const candidates = [meta?.username, meta?.preferred_username];
            return candidates.some((candidate) => candidate?.trim().toLowerCase() === normalized);
          });
          const takenInProfiles = (Array.isArray(data) ? data : []).some((row) => {
            const rowEmail = String(row.email || "").toLowerCase();
            if (currentEmail && rowEmail === currentEmail) return false;
            return true;
          });
          const taken = takenInProfiles || takenInMetadata;
          return Response.json({ available: !taken, username });
        } catch {
          return Response.json({ available: true, username, reason: "Availability check is temporarily unavailable." });
        }
      }
    }
  }
});
const $$splitComponentImporter$3 = () => import("./admin.users-BfIde_-U.js");
const Route$j = createFileRoute("/admin/users")({
  beforeLoad: async () => {
    await requireAuthenticatedRoute();
  },
  head: () => ({
    meta: [{
      title: "Admin Users — W.A.G.E. Society"
    }, {
      name: "description",
      content: "Manage members, roles, and permissions."
    }, {
      name: "robots",
      content: "noindex, nofollow"
    }]
  }),
  component: lazyRouteComponent($$splitComponentImporter$3, "component")
});
const $$splitComponentImporter$2 = () => import("./admin.shop-CgUa7UmU.js");
const Route$i = createFileRoute("/admin/shop")({
  beforeLoad: async () => {
    await requireAuthenticatedRoute();
  },
  head: () => ({
    meta: [{
      title: "Admin Shop — W.A.G.E. Society"
    }, {
      name: "description",
      content: "Shop CRUD management center for merch and membership plans."
    }, {
      name: "robots",
      content: "noindex, nofollow"
    }]
  }),
  component: lazyRouteComponent($$splitComponentImporter$2, "component")
});
const $$splitComponentImporter$1 = () => import("./admin.apk-ByweOf5i.js");
const Route$h = createFileRoute("/admin/apk")({
  beforeLoad: async () => {
    await requireAuthenticatedRoute();
  },
  head: () => ({
    meta: [{
      title: "APK Release Manager — W.A.G.E. Society"
    }]
  }),
  component: lazyRouteComponent($$splitComponentImporter$1, "component")
});
const toolSchema$1 = z.enum(["bulletin-board", "content-calendar", "revenue-tracker", "creator-task-board", "collaboration-hub", "knowledge-vault", "promotion-hub", "merch-studio", "creator-growth-system"]);
const $$splitComponentImporter = () => import("./dashboard.tools._tool-ABTph49r.js");
const Route$g = createFileRoute("/dashboard/tools/$tool")({
  component: lazyRouteComponent($$splitComponentImporter, "component"),
  beforeLoad: async ({
    params
  }) => {
    await requireAuthenticatedRoute();
    const parsed = toolSchema$1.safeParse(params.tool);
    if (!parsed.success) {
      throw notFound();
    }
  }
});
const toolSchema = z.enum([
  "bulletin-board",
  "content-calendar",
  "revenue-tracker",
  "creator-task-board",
  "collaboration-hub",
  "knowledge-vault",
  "promotion-hub"
]);
const statusSchema = z.enum(["idea", "planned", "active", "blocked", "done"]);
const baseEntrySchema = z.object({
  title: z.string().trim().min(1).max(160),
  details: z.string().trim().max(4e3).default(""),
  status: statusSchema.default("active"),
  eventDate: z.string().datetime().nullable().optional(),
  amountCents: z.number().int().min(0).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional()
});
const createEntrySchema = baseEntrySchema;
const updateEntrySchema = baseEntrySchema.extend({
  id: z.string().uuid()
});
const deleteEntrySchema = z.object({
  id: z.string().uuid()
});
const requiredPermissionByTool = {
  "bulletin-board": "view_creator_tools",
  "content-calendar": "view_creator_tools",
  "revenue-tracker": "view_revenue_tracker",
  "creator-task-board": "view_creator_tools",
  "collaboration-hub": "view_creator_tools",
  "knowledge-vault": "view_creator_tools",
  "promotion-hub": "view_creator_tools"
};
function resolveToolAndPermission(rawTool) {
  const parsed = toolSchema.safeParse(rawTool);
  if (!parsed.success) {
    throw new Response(JSON.stringify({ error: "Invalid tool key" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }
  const tool = parsed.data;
  const permission = requiredPermissionByTool[tool];
  return { tool, permission };
}
function getBearerToken$2(request) {
  const authHeader = request.headers.get("authorization") || "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) return void 0;
  const token = authHeader.slice(7).trim();
  return token || void 0;
}
function getDbClient(request) {
  if (hasSupabaseAdminConfig()) return getSupabaseAdminClient();
  const token = getBearerToken$2(request);
  if (token) return getSupabaseServerClientForToken(token);
  return getSupabaseServerPublicClient();
}
function errorMessage(error, fallback) {
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}
async function authorizeForTool(request, rawTool) {
  const { tool, permission } = resolveToolAndPermission(rawTool);
  const access = await requirePermission(request, permission);
  return { tool, access };
}
function requesterPayload(access) {
  return {
    ...access.requester,
    role: access.role
  };
}
const Route$f = createFileRoute("/api/tools/$tool")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const { tool, access } = await authorizeForTool(request, params.tool);
          const admin = getDbClient(request);
          const url = new URL(request.url);
          const isAdmin = access.role === "admin" || access.role === "superadmin";
          const viewAll = isAdmin && url.searchParams.get("all") === "1";
          const ownerFilter = tool === "revenue-tracker" && !viewAll ? access.requester.email : null;
          let query = admin.from("org_dashboard_tool_entries").select("id, tool_key, title, details, status, event_date, amount_cents, metadata, created_by, updated_by, created_at, updated_at").eq("tool_key", tool);
          if (ownerFilter) {
            query = query.eq("created_by", ownerFilter);
          }
          query = query.order("event_date", { ascending: false, nullsFirst: false }).order("updated_at", { ascending: false });
          const { data, error } = await query;
          if (error) return Response.json({ error: error.message }, { status: 500 });
          return Response.json({
            requester: requesterPayload(access),
            tool,
            entries: data || []
          });
        } catch (error) {
          if (error instanceof Response) return error;
          return Response.json({ error: errorMessage(error, "Unexpected server error") }, { status: 500 });
        }
      },
      POST: async ({ request, params }) => {
        try {
          const { tool, access } = await authorizeForTool(request, params.tool);
          const admin = getDbClient(request);
          const body = await request.json();
          const parsed = createEntrySchema.safeParse(body);
          if (!parsed.success) {
            return Response.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
          }
          const { data, error } = await admin.from("org_dashboard_tool_entries").insert({
            tool_key: tool,
            title: parsed.data.title,
            details: parsed.data.details,
            status: parsed.data.status,
            event_date: parsed.data.eventDate ?? null,
            amount_cents: parsed.data.amountCents ?? null,
            metadata: parsed.data.metadata || {},
            created_by: access.requester.email,
            updated_by: access.requester.email
          }).select("id, tool_key, title, details, status, event_date, amount_cents, metadata, created_by, updated_by, created_at, updated_at").single();
          if (error) return Response.json({ error: error.message }, { status: 500 });
          return Response.json({ entry: data });
        } catch (error) {
          if (error instanceof Response) return error;
          return Response.json({ error: errorMessage(error, "Unexpected server error") }, { status: 500 });
        }
      },
      PUT: async ({ request, params }) => {
        try {
          const { tool, access } = await authorizeForTool(request, params.tool);
          const admin = getDbClient(request);
          const body = await request.json();
          const parsed = updateEntrySchema.safeParse(body);
          if (!parsed.success) {
            return Response.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
          }
          const isAdmin = access.role === "admin" || access.role === "superadmin";
          let updateQuery = admin.from("org_dashboard_tool_entries").update({
            title: parsed.data.title,
            details: parsed.data.details,
            status: parsed.data.status,
            event_date: parsed.data.eventDate ?? null,
            amount_cents: parsed.data.amountCents ?? null,
            metadata: parsed.data.metadata || {},
            updated_by: access.requester.email,
            updated_at: (/* @__PURE__ */ new Date()).toISOString()
          }).eq("id", parsed.data.id).eq("tool_key", tool);
          if (!isAdmin) {
            updateQuery = updateQuery.eq("created_by", access.requester.email);
          }
          const { data, error } = await updateQuery.select("id, tool_key, title, details, status, event_date, amount_cents, metadata, created_by, updated_by, created_at, updated_at").maybeSingle();
          if (error) return Response.json({ error: error.message }, { status: 500 });
          if (!data) {
            return Response.json({ error: "Entry not found or not allowed." }, { status: 404 });
          }
          return Response.json({ entry: data });
        } catch (error) {
          if (error instanceof Response) return error;
          return Response.json({ error: errorMessage(error, "Unexpected server error") }, { status: 500 });
        }
      },
      DELETE: async ({ request, params }) => {
        try {
          const { tool, access } = await authorizeForTool(request, params.tool);
          const admin = getDbClient(request);
          const body = await request.json();
          const parsed = deleteEntrySchema.safeParse(body);
          if (!parsed.success) {
            return Response.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
          }
          const isAdmin = access.role === "admin" || access.role === "superadmin";
          let deleteQuery = admin.from("org_dashboard_tool_entries").delete().eq("id", parsed.data.id).eq("tool_key", tool);
          if (!isAdmin) {
            deleteQuery = deleteQuery.eq("created_by", access.requester.email);
          }
          const { data, error } = await deleteQuery.select("id");
          if (error) return Response.json({ error: error.message }, { status: 500 });
          if (!Array.isArray(data) || data.length === 0) {
            return Response.json({ error: "Entry not found or not allowed." }, { status: 404 });
          }
          return Response.json({ deleted: true });
        } catch (error) {
          if (error instanceof Response) return error;
          return Response.json({ error: errorMessage(error, "Unexpected server error") }, { status: 500 });
        }
      }
    }
  }
});
const BUCKET$1 = "merch-studio-media";
const ALLOWED_EXTENSIONS = /* @__PURE__ */ new Set([
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "mp4",
  "webm",
  "mov",
  "m4v",
  "obj",
  "fbx",
  "glb",
  "gltf",
  "stl"
]);
const MAX_SIZE = 120 * 1024 * 1024;
function getExtension(filename) {
  const name = filename.toLowerCase();
  const parts = name.split(".");
  return parts.length > 1 ? parts.pop() || "" : "";
}
const Route$e = createFileRoute("/api/merch-studio/upload")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const access = await requirePermission(request, "view_merch");
          if (access.role === "banned") {
            return Response.json({ error: "Banned users cannot upload merch studio media." }, { status: 403 });
          }
          const requesterEmail = access.requester.email;
          const form = await request.formData();
          const file = form.get("file");
          if (!(file instanceof File)) {
            return Response.json({ error: "File is required." }, { status: 400 });
          }
          if (file.size <= 0) {
            return Response.json({ error: "File is empty." }, { status: 400 });
          }
          if (file.size > MAX_SIZE) {
            return Response.json(
              { error: `File is too large. Maximum size is ${Math.floor(MAX_SIZE / (1024 * 1024))} MB.` },
              { status: 413 }
            );
          }
          const ext = getExtension(file.name);
          if (!ALLOWED_EXTENSIONS.has(ext)) {
            return Response.json({ error: "Unsupported file type." }, { status: 400 });
          }
          const safeEmail = (requesterEmail || "member").replace(/[^a-z0-9._-]+/gi, "_");
          const stamp = Date.now();
          const random = Math.random().toString(36).slice(2, 10);
          const path2 = `${safeEmail}/${stamp}-${random}.${ext}`;
          const contentType = file.type || "application/octet-stream";
          const buffer = await file.arrayBuffer();
          if (hasSupabaseAdminConfig()) {
            const admin = getSupabaseAdminClient();
            const { error: uploadError2 } = await admin.storage.from(BUCKET$1).upload(path2, buffer, { contentType, upsert: false });
            if (uploadError2) {
              return Response.json({ error: uploadError2.message }, { status: 500 });
            }
            const { data: pub2 } = admin.storage.from(BUCKET$1).getPublicUrl(path2);
            return Response.json({ url: pub2.publicUrl, path: path2 }, { status: 201 });
          }
          const authHeader = request.headers.get("authorization");
          const token = authHeader?.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : void 0;
          if (!token) {
            return Response.json(
              { error: "Missing bearer token for upload in fallback mode." },
              { status: 401 }
            );
          }
          const scopedClient = getSupabaseServerClientForToken(token);
          const { error: uploadError } = await scopedClient.storage.from(BUCKET$1).upload(path2, buffer, { contentType, upsert: false });
          if (uploadError) {
            return Response.json({ error: uploadError.message }, { status: 500 });
          }
          const { data: pub } = scopedClient.storage.from(BUCKET$1).getPublicUrl(path2);
          return Response.json({ url: pub.publicUrl, path: path2 }, { status: 201 });
        } catch (error) {
          if (error instanceof Response) return error;
          return Response.json(
            { error: error instanceof Error ? error.message : "Unexpected server error" },
            { status: 500 }
          );
        }
      }
    }
  }
});
const createSubmissionSchema = z.object({
  title: z.string().trim().min(3).max(180),
  description: z.string().trim().min(10).max(5e3),
  submissionTarget: z.enum(["personal_store", "wage_shop"]),
  mediaUrls: z.array(z.string().url()).max(30).default([]),
  embedLinks: z.array(z.string().url()).max(30).default([]),
  externalStoreUrl: z.string().url().optional().or(z.literal(""))
});
const adminReviewSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["under_review", "accepted", "denied"]),
  adminNotes: z.string().max(5e3).optional(),
  creatorSplitPercent: z.number().min(0).max(100),
  wageSplitPercent: z.number().min(0).max(100)
});
function mapSubmission(row) {
  return {
    id: row.id,
    creatorEmail: row.creator_email,
    title: row.title,
    description: row.description,
    submissionTarget: row.submission_target,
    mediaUrls: row.media_urls || [],
    embedLinks: row.embed_links || [],
    externalStoreUrl: row.external_store_url,
    status: row.status,
    adminNotes: row.admin_notes,
    creatorSplitPercent: Number(row.creator_split_percent),
    wageSplitPercent: Number(row.wage_split_percent),
    approvedBy: row.approved_by,
    approvedAt: row.approved_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
const Route$d = createFileRoute("/api/merch-studio/submissions")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          if (hasSupabaseAdminConfig()) {
            const access = await getRequesterAccess(request);
            if (access.role === "banned") {
              return Response.json({ error: "Banned users cannot use Merch Studio." }, { status: 403 });
            }
            const canReview = access.isSuperadmin || access.permissions.includes("access_admin_dashboard");
            const admin = getSupabaseAdminClient();
            let query = admin.from("org_merch_studio_submissions").select("*").order("created_at", { ascending: false });
            if (!canReview) {
              query = query.eq("creator_email", access.requester.email);
            }
            const { data, error } = await query;
            if (error) return Response.json({ error: error.message }, { status: 500 });
            return Response.json({
              canReview,
              submissions: (data || []).map((row) => mapSubmission(row))
            });
          }
          return Response.json(
            { error: "Merch Studio currently requires SUPABASE_SERVICE_ROLE_KEY in this environment." },
            { status: 503 }
          );
        } catch (error) {
          if (error instanceof Response) return error;
          return Response.json(
            { error: error instanceof Error ? error.message : "Unexpected server error" },
            { status: 500 }
          );
        }
      },
      POST: async ({ request }) => {
        try {
          if (!hasSupabaseAdminConfig()) {
            return Response.json(
              { error: "Merch Studio submissions require SUPABASE_SERVICE_ROLE_KEY in this environment." },
              { status: 503 }
            );
          }
          const access = await requirePermission(request, "view_merch");
          if (access.role === "banned") {
            return Response.json({ error: "Banned users cannot use Merch Studio." }, { status: 403 });
          }
          const payload = createSubmissionSchema.safeParse(await request.json());
          if (!payload.success) {
            return Response.json({ error: payload.error.flatten() }, { status: 400 });
          }
          const admin = getSupabaseAdminClient();
          const { data, error } = await admin.from("org_merch_studio_submissions").insert([
            {
              creator_email: access.requester.email,
              title: payload.data.title,
              description: payload.data.description,
              submission_target: payload.data.submissionTarget,
              media_urls: payload.data.mediaUrls,
              embed_links: payload.data.embedLinks,
              external_store_url: payload.data.externalStoreUrl || null,
              status: "submitted"
            }
          ]).select("*").single();
          if (error) return Response.json({ error: error.message }, { status: 500 });
          return Response.json({ submission: mapSubmission(data) }, { status: 201 });
        } catch (error) {
          if (error instanceof Response) return error;
          return Response.json(
            { error: error instanceof Error ? error.message : "Unexpected server error" },
            { status: 500 }
          );
        }
      },
      PUT: async ({ request }) => {
        try {
          const payload = adminReviewSchema.safeParse(await request.json());
          if (!payload.success) {
            return Response.json({ error: payload.error.flatten() }, { status: 400 });
          }
          if (Math.round((payload.data.creatorSplitPercent + payload.data.wageSplitPercent) * 100) !== 1e4) {
            return Response.json({ error: "Creator and WAGE split must add up to 100%." }, { status: 400 });
          }
          if (!hasSupabaseAdminConfig()) {
            return Response.json(
              { error: "Merch Studio reviews require SUPABASE_SERVICE_ROLE_KEY in this environment." },
              { status: 503 }
            );
          }
          const access = await requirePermission(request, "access_admin_dashboard");
          const admin = getSupabaseAdminClient();
          const updatePayload = {
            status: payload.data.status,
            admin_notes: payload.data.adminNotes || null,
            creator_split_percent: payload.data.creatorSplitPercent,
            wage_split_percent: payload.data.wageSplitPercent,
            approved_by: access.requester.email,
            approved_at: payload.data.status === "accepted" ? (/* @__PURE__ */ new Date()).toISOString() : null,
            updated_at: (/* @__PURE__ */ new Date()).toISOString()
          };
          const { data, error } = await admin.from("org_merch_studio_submissions").update(updatePayload).eq("id", payload.data.id).select("*").single();
          if (error) return Response.json({ error: error.message }, { status: 500 });
          return Response.json({ submission: mapSubmission(data) });
        } catch (error) {
          if (error instanceof Response) return error;
          return Response.json(
            { error: error instanceof Error ? error.message : "Unexpected server error" },
            { status: 500 }
          );
        }
      }
    }
  }
});
const createEarningSchema = z.object({
  submissionId: z.string().uuid(),
  grossCents: z.number().int().min(0),
  periodStart: z.string().optional(),
  periodEnd: z.string().optional(),
  notes: z.string().max(5e3).optional()
});
const updatePaidSchema = z.object({
  id: z.string().uuid(),
  paidToMemberCents: z.number().int().min(0),
  paidToWageCents: z.number().int().min(0)
});
function mapEarning(row) {
  return {
    id: row.id,
    submissionId: row.submission_id,
    recordedBy: row.recorded_by,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    grossCents: row.gross_cents,
    memberDueCents: row.member_due_cents,
    wageDueCents: row.wage_due_cents,
    paidToMemberCents: row.paid_to_member_cents,
    paidToWageCents: row.paid_to_wage_cents,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
const Route$c = createFileRoute("/api/merch-studio/earnings")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          if (hasSupabaseAdminConfig()) {
            const access = await getRequesterAccess(request);
            if (access.role === "banned") {
              return Response.json({ error: "Banned users cannot use Merch Studio." }, { status: 403 });
            }
            const canReview = access.isSuperadmin || access.permissions.includes("access_admin_dashboard");
            const admin = getSupabaseAdminClient();
            let query = admin.from("org_merch_studio_earnings").select("id, submission_id, recorded_by, period_start, period_end, gross_cents, member_due_cents, wage_due_cents, paid_to_member_cents, paid_to_wage_cents, notes, created_at, updated_at").order("created_at", { ascending: false });
            if (!canReview) {
              const { data: ownSubmissions, error: ownError } = await admin.from("org_merch_studio_submissions").select("id").eq("creator_email", access.requester.email);
              if (ownError) {
                return Response.json({ error: ownError.message }, { status: 500 });
              }
              const ids = (ownSubmissions || []).map((row) => row.id);
              if (ids.length === 0) {
                return Response.json({ canReview, earnings: [], summary: { memberDueCents: 0, memberPaidCents: 0, memberPendingCents: 0 } });
              }
              query = query.in("submission_id", ids);
            }
            const { data, error } = await query;
            if (error) return Response.json({ error: error.message }, { status: 500 });
            const rawRows = data || [];
            const mapped = rawRows.map(mapEarning);
            const summary = { memberDueCents: 0, memberPaidCents: 0, memberPendingCents: 0 };
            for (const entry of mapped) {
              summary.memberDueCents += entry.memberDueCents;
              summary.memberPaidCents += entry.paidToMemberCents;
              summary.memberPendingCents += Math.max(0, entry.memberDueCents - entry.paidToMemberCents);
            }
            return Response.json({ canReview, earnings: mapped, summary });
          }
          return Response.json(
            { error: "Merch Studio earnings require SUPABASE_SERVICE_ROLE_KEY in this environment." },
            { status: 503 }
          );
        } catch (error) {
          if (error instanceof Response) return error;
          return Response.json(
            { error: error instanceof Error ? error.message : "Unexpected server error" },
            { status: 500 }
          );
        }
      },
      POST: async ({ request }) => {
        try {
          const payload = createEarningSchema.safeParse(await request.json());
          if (!payload.success) {
            return Response.json({ error: payload.error.flatten() }, { status: 400 });
          }
          if (!hasSupabaseAdminConfig()) {
            return Response.json(
              { error: "Recording earnings requires SUPABASE_SERVICE_ROLE_KEY in this environment." },
              { status: 503 }
            );
          }
          const access = await requirePermission(request, "access_admin_dashboard");
          const admin = getSupabaseAdminClient();
          const { data: submission, error: submissionError } = await admin.from("org_merch_studio_submissions").select("id, creator_email, title, creator_split_percent, wage_split_percent").eq("id", payload.data.submissionId).single();
          if (submissionError) return Response.json({ error: submissionError.message }, { status: 500 });
          const submissionRow = submission;
          const memberDueCents = Math.round(payload.data.grossCents * (Number(submissionRow.creator_split_percent) / 100));
          const wageDueCents = payload.data.grossCents - memberDueCents;
          const { data, error } = await admin.from("org_merch_studio_earnings").insert([
            {
              submission_id: payload.data.submissionId,
              recorded_by: access.requester.email,
              period_start: payload.data.periodStart || null,
              period_end: payload.data.periodEnd || null,
              gross_cents: payload.data.grossCents,
              member_due_cents: memberDueCents,
              wage_due_cents: wageDueCents,
              notes: payload.data.notes || null
            }
          ]).select("*").single();
          if (error) return Response.json({ error: error.message }, { status: 500 });
          return Response.json({ earning: mapEarning(data) }, { status: 201 });
        } catch (error) {
          if (error instanceof Response) return error;
          return Response.json(
            { error: error instanceof Error ? error.message : "Unexpected server error" },
            { status: 500 }
          );
        }
      },
      PUT: async ({ request }) => {
        try {
          const payload = updatePaidSchema.safeParse(await request.json());
          if (!payload.success) {
            return Response.json({ error: payload.error.flatten() }, { status: 400 });
          }
          if (!hasSupabaseAdminConfig()) {
            return Response.json(
              { error: "Updating payout tracking requires SUPABASE_SERVICE_ROLE_KEY in this environment." },
              { status: 503 }
            );
          }
          await requirePermission(request, "access_admin_dashboard");
          const admin = getSupabaseAdminClient();
          const { data, error } = await admin.from("org_merch_studio_earnings").update({
            paid_to_member_cents: payload.data.paidToMemberCents,
            paid_to_wage_cents: payload.data.paidToWageCents,
            updated_at: (/* @__PURE__ */ new Date()).toISOString()
          }).eq("id", payload.data.id).select("*").single();
          if (error) return Response.json({ error: error.message }, { status: 500 });
          return Response.json({ earning: mapEarning(data) });
        } catch (error) {
          if (error instanceof Response) return error;
          return Response.json(
            { error: error instanceof Error ? error.message : "Unexpected server error" },
            { status: 500 }
          );
        }
      }
    }
  }
});
const USERNAME_REGEX$1 = /^[a-zA-Z0-9_-]{3,20}$/;
const updateSchema$2 = z.object({
  displayName: z.string().trim().max(20).optional(),
  avatarUrl: z.string().url().optional().or(z.literal("")),
  bio: z.string().trim().max(500).optional(),
  skills: z.array(z.string().trim().max(40)).max(30).optional(),
  selectedYouTubeChannel: z.string().trim().max(200).nullable().optional(),
  connectedKickUsername: z.string().trim().max(120).nullable().optional()
});
function readDisplayNameFromMeta(meta) {
  const candidates = [meta?.username, meta?.preferred_username];
  for (const candidate of candidates) {
    const trimmed = candidate?.trim();
    if (trimmed) return trimmed;
  }
  return null;
}
function getBearerToken$1(request) {
  const authHeader = request.headers.get("authorization") || "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) return void 0;
  const token = authHeader.slice(7).trim();
  return token || void 0;
}
function getSupabaseServerAuthConfig() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey2 = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return {
    url: url || null,
    publishableKey: publishableKey2 || null
  };
}
async function updateAuthUserMetadataWithToken(accessToken, metadata) {
  const { url, publishableKey: publishableKey2 } = getSupabaseServerAuthConfig();
  if (!url || !publishableKey2) {
    return { error: "Supabase auth update config is missing on server." };
  }
  const response = await fetch(`${url}/auth/v1/user`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: publishableKey2,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ data: metadata })
  });
  if (response.ok) {
    return { error: null };
  }
  let detail = "Could not update auth profile metadata.";
  try {
    const payload = await response.json();
    detail = payload.error_description || payload.msg || payload.message || detail;
  } catch {
  }
  return { error: detail };
}
function createFallbackProfile(email, displayName) {
  return {
    email,
    display_name: displayName,
    avatar_url: null,
    bio: null,
    skills: [],
    livestream_links: [],
    updated_at: null
  };
}
const BUILTIN_OAUTH_PROVIDER_META = {
  discord: { label: "Discord", description: "Link your Discord account" },
  google: { label: "Google / YouTube", description: "Link your Google account" },
  kick: { label: "Kick", description: "Link your Kick account" },
  "custom:kick": { label: "Kick", description: "Link your Kick account" },
  apple: { label: "Apple", description: "Link your Apple account" },
  facebook: { label: "Facebook", description: "Link your Facebook account" }
};
function toTitleCase(value) {
  return value.split(/[\s_-]+/).filter(Boolean).map((word) => word[0]?.toUpperCase() + word.slice(1)).join(" ");
}
function providerOptionFromKey(key, explicitLabel) {
  const normalized = key.trim().toLowerCase();
  const builtin = BUILTIN_OAUTH_PROVIDER_META[normalized];
  if (builtin) {
    return { key: normalized, label: builtin.label, description: builtin.description };
  }
  const customName = normalized.startsWith("custom:") ? normalized.slice("custom:".length) : normalized;
  const label = (explicitLabel || "").trim() || toTitleCase(customName) || normalized;
  return {
    key: normalized,
    label,
    description: `Link your ${label} account`
  };
}
async function getAvailableOAuthProviders(client, includeIdentityProviderScan) {
  const identityPromise = includeIdentityProviderScan ? client.schema("auth").from("identities").select("provider").neq("provider", "email") : Promise.resolve({ data: null, error: null });
  const [{ data: identityRows, error: identityError }, { data: customRows, error: customError }] = await Promise.all([
    identityPromise,
    client.schema("auth").from("custom_oauth_providers").select("identifier, name, enabled").eq("enabled", true)
  ]);
  const optionsByKey = /* @__PURE__ */ new Map();
  if (!identityError) {
    for (const row of identityRows ?? []) {
      const provider = String(row.provider || "").trim().toLowerCase();
      if (!provider) continue;
      optionsByKey.set(provider, providerOptionFromKey(provider));
    }
  }
  if (!customError) {
    for (const row of customRows ?? []) {
      if (row.enabled === false) continue;
      const identifier = String(row.identifier || "").trim().toLowerCase();
      if (!identifier) continue;
      optionsByKey.set(identifier, providerOptionFromKey(identifier, row.name));
    }
  }
  return Array.from(optionsByKey.values()).sort((a, b) => a.label.localeCompare(b.label));
}
function normalizeYouTubeSelection(raw) {
  const value = String(raw || "").trim();
  if (!value) return null;
  if (value.startsWith("handle:") || value.startsWith("channel:") || value.startsWith("user:") || value.startsWith("custom:")) {
    return value;
  }
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (host.includes("youtube.com") || host === "youtu.be") {
      const segments = url.pathname.split("/").filter(Boolean);
      if (segments[0]?.startsWith("@")) {
        return `handle:${segments[0].slice(1).toLowerCase()}`;
      }
      if (segments[0] === "channel" && segments[1]) return `channel:${segments[1]}`;
      if (segments[0] === "user" && segments[1]) return `user:${segments[1]}`;
      if (segments[0] === "c" && segments[1]) return `custom:${segments[1]}`;
    }
  } catch {
  }
  return null;
}
function streamKeyToYouTubeUrl(key) {
  if (key.startsWith("handle:")) return `https://www.youtube.com/@${key.slice("handle:".length)}`;
  if (key.startsWith("channel:")) return `https://www.youtube.com/channel/${key.slice("channel:".length)}`;
  if (key.startsWith("user:")) return `https://www.youtube.com/user/${key.slice("user:".length)}`;
  if (key.startsWith("custom:")) return `https://www.youtube.com/c/${key.slice("custom:".length)}`;
  return key;
}
function buildYouTubeOptions(meta, authUser) {
  const options = /* @__PURE__ */ new Map();
  const selected = normalizeYouTubeSelection(meta?.selected_youtube_channel);
  if (selected) {
    options.set(selected, {
      key: selected,
      label: `Selected channel (${selected})`,
      url: streamKeyToYouTubeUrl(selected)
    });
  }
  const identities = Array.isArray(authUser?.identities) ? authUser.identities : [];
  const googleIdentity = identities.find((identity) => String(identity?.provider || "").toLowerCase() === "google");
  const googleData = googleIdentity?.identity_data || {};
  const candidates = /* @__PURE__ */ new Set();
  const metaUsername = String(meta?.username || meta?.preferred_username || "").trim().replace(/^@/, "");
  if (metaUsername) candidates.add(metaUsername);
  const googleEmail = String(googleData.email || "").trim().toLowerCase();
  const emailPrefix = googleEmail.split("@")[0]?.replace(/^@/, "");
  if (emailPrefix) candidates.add(emailPrefix);
  const fullName = String(googleData.full_name || googleData.name || "").trim();
  if (fullName) {
    const compact = fullName.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (compact.length >= 3) candidates.add(compact);
  }
  for (const candidate of candidates) {
    const key = `handle:${candidate.toLowerCase()}`;
    if (!options.has(key)) {
      options.set(key, {
        key,
        label: `@${candidate}`,
        url: streamKeyToYouTubeUrl(key)
      });
    }
  }
  return Array.from(options.values());
}
function buildConnectedStreamAccounts(meta, authUser) {
  const identities = Array.isArray(authUser?.identities) ? authUser.identities : [];
  const kickIdentity = identities.find((identity) => {
    const provider = String(identity?.provider || "").trim().toLowerCase();
    return provider === "kick" || provider === "custom:kick";
  });
  const googleIdentity = identities.find((identity) => String(identity?.provider || "").trim().toLowerCase() === "google");
  const kickData = kickIdentity?.identity_data || {};
  const kickUsernameCandidates = [
    meta?.kick_username,
    kickData.preferred_username,
    kickData.username,
    kickData.login
  ];
  let kickUsername = null;
  for (const candidate of kickUsernameCandidates) {
    const normalized = String(candidate || "").trim().replace(/^@/, "");
    if (normalized) {
      kickUsername = normalized;
      break;
    }
  }
  const selected = normalizeYouTubeSelection(meta?.selected_youtube_channel);
  const youtubeOptions = buildYouTubeOptions(meta, authUser);
  return {
    kick: {
      connected: Boolean(kickIdentity),
      username: kickUsername,
      url: kickUsername ? `https://kick.com/${kickUsername}` : null
    },
    youtube: {
      connected: Boolean(googleIdentity),
      selected,
      options: youtubeOptions
    }
  };
}
const Route$b = createFileRoute("/api/me/profile")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const requester = await resolveRequester(request);
          const canUseAdmin = hasSupabaseAdminConfig();
          const token = getBearerToken$1(request);
          const client = canUseAdmin ? getSupabaseAdminClient() : token ? getSupabaseServerClientForToken(token) : getSupabaseServerPublicClient();
          const profilePromise = client.from("org_member_profiles").select("email, display_name, avatar_url, bio, skills, updated_at").eq("email", requester.email).maybeSingle();
          const authUserPromise = canUseAdmin ? getSupabaseAdminClient().schema("auth").from("users").select("id, raw_user_meta_data").eq("email", requester.email).maybeSingle() : token ? getSupabaseServerClientForToken(token).auth.getUser(token) : Promise.resolve({ data: { user: null }, error: null });
          const [{ data: profileRaw, error: profileError }, { data: authUser, error: authUserError }] = await Promise.all([
            profilePromise,
            authUserPromise
          ]);
          const profile = profileRaw || null;
          if (profileError && profileError.code !== "42P01") {
            return Response.json({ error: profileError.message }, { status: 500 });
          }
          if (authUserError) {
            return Response.json({ error: authUserError.message }, { status: 500 });
          }
          const oauthProviders = await getAvailableOAuthProviders(client, canUseAdmin);
          const authUserRecord = canUseAdmin ? authUser : authUser?.user;
          if (canUseAdmin && authUserRecord?.id) {
            const { data: identityRows, error: identityError } = await getSupabaseAdminClient().schema("auth").from("identities").select("provider, identity_data").eq("user_id", authUserRecord.id);
            if (identityError) {
              return Response.json({ error: identityError.message }, { status: 500 });
            }
            authUserRecord.identities = Array.isArray(identityRows) ? identityRows : [];
          }
          const meta = authUserRecord?.raw_user_meta_data ?? authUserRecord?.user_metadata ?? null;
          const streamAccounts = buildConnectedStreamAccounts(meta, authUserRecord);
          const authDisplayName = readDisplayNameFromMeta(meta);
          return Response.json({
            oauth_providers: oauthProviders,
            stream_accounts: streamAccounts,
            profile: profile ? {
              ...profile,
              display_name: profile.display_name || authDisplayName,
              livestream_links: [
                ...streamAccounts.kick.url ? [streamAccounts.kick.url] : [],
                ...streamAccounts.youtube.selected ? [streamKeyToYouTubeUrl(streamAccounts.youtube.selected)] : []
              ]
            } : {
              ...createFallbackProfile(requester.email, authDisplayName),
              livestream_links: [
                ...streamAccounts.kick.url ? [streamAccounts.kick.url] : [],
                ...streamAccounts.youtube.selected ? [streamKeyToYouTubeUrl(streamAccounts.youtube.selected)] : []
              ]
            }
          });
        } catch (error) {
          if (error instanceof Response) return error;
          return Response.json(
            { error: error instanceof Error ? error.message : "Unexpected server error" },
            { status: 500 }
          );
        }
      },
      PUT: async ({ request }) => {
        try {
          const requester = await resolveRequester(request);
          const body = await request.json();
          const parsed = updateSchema$2.safeParse(body);
          if (!parsed.success) {
            return Response.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
          }
          const selectedYouTubeChannel = parsed.data.selectedYouTubeChannel !== void 0 ? normalizeYouTubeSelection(parsed.data.selectedYouTubeChannel) : void 0;
          if (parsed.data.selectedYouTubeChannel !== void 0 && parsed.data.selectedYouTubeChannel !== null && !selectedYouTubeChannel) {
            return Response.json({ error: "Invalid YouTube channel selection." }, { status: 400 });
          }
          const connectedKickUsername = parsed.data.connectedKickUsername !== void 0 ? String(parsed.data.connectedKickUsername || "").trim().replace(/^@/, "") || null : void 0;
          const canUseAdmin = hasSupabaseAdminConfig();
          const token = getBearerToken$1(request);
          const client = canUseAdmin ? getSupabaseAdminClient() : getSupabaseServerClientForToken(token);
          let authUserList = [];
          if (canUseAdmin) {
            const { data: authUsers, error: authUsersError } = await getSupabaseAdminClient().schema("auth").from("users").select("id, email, raw_user_meta_data");
            if (authUsersError) {
              return Response.json({ error: authUsersError.message }, { status: 500 });
            }
            authUserList = Array.isArray(authUsers) ? authUsers : [];
          }
          if (parsed.data.displayName !== void 0) {
            const newName = parsed.data.displayName.trim();
            if (newName && !USERNAME_REGEX$1.test(newName)) {
              return Response.json(
                { error: "Username must be 3–20 characters and contain only letters, numbers, underscores, or hyphens." },
                { status: 400 }
              );
            }
            if (newName) {
              const { data: existing, error: checkError } = await client.from("org_member_profiles").select("email").ilike("display_name", newName).neq("email", requester.email).limit(1);
              if (checkError && checkError.code !== "42P01") {
                return Response.json({ error: "Could not verify username availability." }, { status: 500 });
              }
              if (Array.isArray(existing) && existing.length > 0) {
                return Response.json({ error: "That username is already taken. Please choose another." }, { status: 409 });
              }
              if (canUseAdmin) {
                const normalized = newName.toLowerCase();
                const takenInAuth = authUserList.some((userRow) => {
                  const rowEmail = String(userRow.email || "").toLowerCase();
                  if (!rowEmail || rowEmail === requester.email) return false;
                  const metadata = userRow.raw_user_meta_data ?? null;
                  const candidates = [metadata?.username, metadata?.preferred_username];
                  return candidates.some((candidate) => candidate?.trim().toLowerCase() === normalized);
                });
                if (takenInAuth) {
                  return Response.json({ error: "That username is already taken. Please choose another." }, { status: 409 });
                }
              }
            }
          }
          const currentAuthUser = authUserList.find(
            (userRow) => String(userRow.email || "").toLowerCase() === requester.email
          );
          if (canUseAdmin && currentAuthUser?.id && (parsed.data.displayName !== void 0 || selectedYouTubeChannel !== void 0 || connectedKickUsername !== void 0)) {
            const existingMeta = currentAuthUser.raw_user_meta_data ?? {};
            const trimmedDisplayName = parsed.data.displayName?.trim() || "";
            const nextName = trimmedDisplayName || readDisplayNameFromMeta(existingMeta) || "";
            const { error: updateAuthError } = await getSupabaseAdminClient().auth.admin.updateUserById(currentAuthUser.id, {
              user_metadata: {
                ...existingMeta,
                username: nextName,
                preferred_username: nextName,
                selected_youtube_channel: selectedYouTubeChannel !== void 0 ? selectedYouTubeChannel : existingMeta.selected_youtube_channel || null,
                kick_username: connectedKickUsername !== void 0 ? connectedKickUsername : existingMeta.kick_username || null
              }
            });
            if (updateAuthError) {
              return Response.json({ error: updateAuthError.message }, { status: 500 });
            }
          }
          if (!canUseAdmin && token && (parsed.data.displayName !== void 0 || selectedYouTubeChannel !== void 0 || connectedKickUsername !== void 0)) {
            const userClient = getSupabaseServerClientForToken(token);
            const {
              data: { user: tokenUser },
              error: tokenUserError
            } = await userClient.auth.getUser(token);
            if (tokenUserError || !tokenUser?.email) {
              return Response.json({ error: tokenUserError?.message || "Could not resolve current user" }, { status: 401 });
            }
            if (String(tokenUser.email).trim().toLowerCase() !== requester.email) {
              return Response.json({ error: "Metadata update email mismatch" }, { status: 403 });
            }
            const existingMeta = tokenUser.user_metadata ?? {};
            const trimmedDisplayName = parsed.data.displayName?.trim() || "";
            const nextName = trimmedDisplayName || readDisplayNameFromMeta(existingMeta) || "";
            const nextMeta = {
              ...existingMeta,
              username: nextName,
              preferred_username: nextName,
              selected_youtube_channel: selectedYouTubeChannel !== void 0 ? selectedYouTubeChannel : existingMeta.selected_youtube_channel || null,
              kick_username: connectedKickUsername !== void 0 ? connectedKickUsername : existingMeta.kick_username || null
            };
            const { error: authMetadataError } = await updateAuthUserMetadataWithToken(token, nextMeta);
            if (authMetadataError) {
              return Response.json({ error: authMetadataError }, { status: 500 });
            }
          }
          const payload = {
            email: requester.email,
            updated_at: (/* @__PURE__ */ new Date()).toISOString()
          };
          if (parsed.data.displayName !== void 0) {
            payload.display_name = parsed.data.displayName;
          }
          if (parsed.data.avatarUrl !== void 0) payload.avatar_url = parsed.data.avatarUrl || null;
          if (parsed.data.bio !== void 0) payload.bio = parsed.data.bio;
          if (parsed.data.skills !== void 0) payload.skills = parsed.data.skills;
          const { data, error } = await client.from("org_member_profiles").upsert(payload, { onConflict: "email" }).select("email, display_name, avatar_url, bio, skills, updated_at").single();
          if (error && error.code !== "42P01") {
            return Response.json({ error: error.message }, { status: 500 });
          }
          if (selectedYouTubeChannel) {
            const youtubeUrl = streamKeyToYouTubeUrl(selectedYouTubeChannel);
            const displayName = data?.display_name || parsed.data.displayName?.trim() || requester.email.split("@")[0];
            const avatarUrl = data?.avatar_url || parsed.data.avatarUrl || null;
            const { error: livestreamError } = await client.from("org_member_livestreams").upsert(
              {
                email: requester.email,
                platform: "youtube",
                stream_key: selectedYouTubeChannel,
                stream_url: youtubeUrl,
                display_name: displayName,
                avatar_url: avatarUrl
              },
              { onConflict: "email,platform" }
            );
            if (livestreamError && livestreamError.code !== "42P01") {
              console.error("Failed to save livestream selection:", livestreamError);
            }
          } else if (selectedYouTubeChannel === null) {
            const { error: deleteError } = await client.from("org_member_livestreams").delete().eq("email", requester.email).eq("platform", "youtube");
            if (deleteError) {
              console.error("Failed to delete livestream selection:", deleteError);
            }
          }
          if (data) {
            const ownAuthMeta2 = currentAuthUser?.raw_user_meta_data ?? null;
            const streamAccounts = buildConnectedStreamAccounts(ownAuthMeta2, null);
            return Response.json({
              profile: {
                ...data,
                livestream_links: [
                  ...streamAccounts.kick.url ? [streamAccounts.kick.url] : [],
                  ...streamAccounts.youtube.selected ? [streamKeyToYouTubeUrl(streamAccounts.youtube.selected)] : []
                ]
              }
            });
          }
          const ownAuthMeta = currentAuthUser?.raw_user_meta_data ?? null;
          const fallbackDisplayName = parsed.data.displayName?.trim() || readDisplayNameFromMeta(ownAuthMeta);
          return Response.json({
            profile: {
              ...createFallbackProfile(requester.email, fallbackDisplayName || null),
              livestream_links: [
                ...ownAuthMeta?.kick_username ? [`https://kick.com/${String(ownAuthMeta.kick_username).replace(/^@/, "")}`] : [],
                ...ownAuthMeta?.selected_youtube_channel ? [streamKeyToYouTubeUrl(String(ownAuthMeta.selected_youtube_channel))] : []
              ]
            }
          });
        } catch (error) {
          if (error instanceof Response) return error;
          return Response.json(
            { error: error instanceof Error ? error.message : "Unexpected server error" },
            { status: 500 }
          );
        }
      }
    }
  }
});
const Route$a = createFileRoute("/api/me/access")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const access = await getRequesterAccess(request);
          return Response.json({
            requester: access.requester,
            role: access.role,
            actorRole: access.actorRole,
            viewingAs: access.viewingAs,
            permissions: access.permissions,
            isSuperadmin: access.isSuperadmin,
            ban: access.ban
          });
        } catch (error) {
          if (error instanceof Response) return error;
          return Response.json({ error: "Unexpected server error" }, { status: 500 });
        }
      }
    }
  }
});
let kickTokenCache = null;
const OFFLINE_SNAPSHOT = {
  status: "offline",
  viewerCount: null,
  followerCount: null,
  accountCreatedAt: null
};
function isHostMatch(hostname, domain) {
  const normalizedHost = hostname.toLowerCase();
  const normalizedDomain = domain.toLowerCase();
  return normalizedHost === normalizedDomain || normalizedHost.endsWith(`.${normalizedDomain}`);
}
function extractYouTubeChannelRef(url) {
  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length === 0) return null;
  const [first, second] = segments;
  if (first.startsWith("@")) {
    return `handle:${first.toLowerCase()}`;
  }
  if (first === "channel" && second) {
    return `channel:${second}`;
  }
  if (first === "user" && second) {
    return `user:${second}`;
  }
  if (first === "c" && second) {
    return `custom:${second}`;
  }
  return null;
}
function extractTwitchChannel(url) {
  if (!isHostMatch(url.hostname, "twitch.tv")) return null;
  const slug = url.pathname.split("/").filter(Boolean)[0];
  if (!slug) return null;
  const reserved = /* @__PURE__ */ new Set(["directory", "settings", "login", "signup"]);
  if (reserved.has(slug.toLowerCase())) return null;
  return slug.toLowerCase();
}
function extractKickChannel(url) {
  if (!isHostMatch(url.hostname, "kick.com")) return null;
  const slug = url.pathname.split("/").filter(Boolean)[0];
  if (!slug) return null;
  const reserved = /* @__PURE__ */ new Set(["categories", "search", "video", "settings", "login", "signup"]);
  if (reserved.has(slug.toLowerCase())) return null;
  return slug.toLowerCase();
}
function parseLivestreamLink(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Invalid URL format");
  }
  const host = url.hostname.toLowerCase();
  if (isHostMatch(host, "twitch.tv")) {
    const channel = extractTwitchChannel(url);
    if (!channel) throw new Error("Could not parse Twitch channel from link");
    return {
      platform: "twitch",
      streamKey: channel
    };
  }
  if (isHostMatch(host, "youtube.com") || host === "youtu.be") {
    const channelRef = extractYouTubeChannelRef(url);
    if (!channelRef) {
      throw new Error("Could not parse YouTube channel from link. Use a channel URL like /@handle or /channel/UC....");
    }
    return {
      platform: "youtube",
      streamKey: channelRef
    };
  }
  if (isHostMatch(host, "kick.com")) {
    const channel = extractKickChannel(url);
    if (!channel) throw new Error("Could not parse Kick channel from link");
    return {
      platform: "kick",
      streamKey: channel
    };
  }
  throw new Error("Unsupported platform. Only Twitch, YouTube, and Kick are currently supported.");
}
function parseStoredYouTubeKey(streamKey) {
  if (streamKey.startsWith("handle:")) {
    return { kind: "handle", value: streamKey.slice("handle:".length) };
  }
  if (streamKey.startsWith("channel:")) {
    return { kind: "channel", value: streamKey.slice("channel:".length) };
  }
  if (streamKey.startsWith("user:")) {
    return { kind: "user", value: streamKey.slice("user:".length) };
  }
  if (streamKey.startsWith("custom:")) {
    return { kind: "custom", value: streamKey.slice("custom:".length) };
  }
  return { kind: "video", value: streamKey };
}
async function fetchYouTubeChannelById(channelId, apiKey) {
  const channelUrl = new URL("https://www.googleapis.com/youtube/v3/channels");
  channelUrl.searchParams.set("part", "snippet,statistics");
  channelUrl.searchParams.set("id", channelId);
  channelUrl.searchParams.set("key", apiKey);
  const response = await fetch(channelUrl.toString(), { method: "GET" });
  if (!response.ok) return null;
  const data = await response.json();
  return data.items?.[0] || null;
}
async function resolveYouTubeChannel(streamKey, apiKey) {
  const parsed = parseStoredYouTubeKey(streamKey);
  if (parsed.kind === "channel") {
    const channel = await fetchYouTubeChannelById(parsed.value, apiKey);
    if (!channel?.id) return null;
    return channel;
  }
  if (parsed.kind === "handle") {
    const handle = parsed.value.startsWith("@") ? parsed.value : `@${parsed.value}`;
    const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
    searchUrl.searchParams.set("part", "snippet");
    searchUrl.searchParams.set("type", "channel");
    searchUrl.searchParams.set("q", handle);
    searchUrl.searchParams.set("maxResults", "5");
    searchUrl.searchParams.set("key", apiKey);
    const response = await fetch(searchUrl.toString(), { method: "GET" });
    if (!response.ok) return null;
    const data = await response.json();
    const matched = data.items?.find((item) => {
      const customUrl = item.snippet?.customUrl?.toLowerCase();
      return customUrl === handle.toLowerCase();
    }) || data.items?.[0];
    const channelId = matched?.id?.channelId;
    if (!channelId) return null;
    return fetchYouTubeChannelById(channelId, apiKey);
  }
  if (parsed.kind === "user" || parsed.kind === "custom") {
    const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
    searchUrl.searchParams.set("part", "snippet");
    searchUrl.searchParams.set("type", "channel");
    searchUrl.searchParams.set("q", parsed.value);
    searchUrl.searchParams.set("maxResults", "5");
    searchUrl.searchParams.set("key", apiKey);
    const response = await fetch(searchUrl.toString(), { method: "GET" });
    if (!response.ok) return null;
    const data = await response.json();
    const query = parsed.value.toLowerCase();
    const matched = data.items?.find((item) => {
      const title = item.snippet?.channelTitle?.toLowerCase();
      const customUrl = item.snippet?.customUrl?.replace(/^@/, "").toLowerCase();
      return title === query || customUrl === query;
    }) || data.items?.[0];
    const channelId = matched?.id?.channelId;
    if (!channelId) return null;
    return fetchYouTubeChannelById(channelId, apiKey);
  }
  return null;
}
async function getYouTubeSnapshot(videoId) {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return OFFLINE_SNAPSHOT;
  }
  const parsed = parseStoredYouTubeKey(videoId);
  if (parsed.kind !== "video") {
    const channel = await resolveYouTubeChannel(videoId, apiKey);
    if (!channel?.id) {
      return OFFLINE_SNAPSHOT;
    }
    const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
    searchUrl.searchParams.set("part", "snippet");
    searchUrl.searchParams.set("channelId", channel.id);
    searchUrl.searchParams.set("eventType", "live");
    searchUrl.searchParams.set("type", "video");
    searchUrl.searchParams.set("maxResults", "1");
    searchUrl.searchParams.set("key", apiKey);
    const searchResponse = await fetch(searchUrl.toString(), {
      method: "GET"
    });
    let liveVideoId = null;
    if (searchResponse.ok) {
      const searchData = await searchResponse.json();
      liveVideoId = searchData.items?.[0]?.id?.videoId || null;
    }
    if (!liveVideoId) {
      return {
        status: "offline",
        viewerCount: null,
        followerCount: channel.statistics?.subscriberCount ? Number.parseInt(channel.statistics.subscriberCount, 10) : null,
        accountCreatedAt: channel.snippet?.publishedAt || null
      };
    }
    const liveSnapshot = await getYouTubeSnapshot(liveVideoId);
    return {
      ...liveSnapshot,
      followerCount: channel.statistics?.subscriberCount ? Number.parseInt(channel.statistics.subscriberCount, 10) : liveSnapshot.followerCount,
      accountCreatedAt: channel.snippet?.publishedAt || liveSnapshot.accountCreatedAt
    };
  }
  const apiUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
  apiUrl.searchParams.set("part", "snippet,liveStreamingDetails");
  apiUrl.searchParams.set("id", parsed.value);
  apiUrl.searchParams.set("key", apiKey);
  const response = await fetch(apiUrl.toString(), {
    method: "GET"
  });
  if (!response.ok) {
    return OFFLINE_SNAPSHOT;
  }
  const data = await response.json();
  const item = data.items?.[0];
  if (!item) return OFFLINE_SNAPSHOT;
  const viewerCountRaw = item.liveStreamingDetails?.concurrentViewers;
  const viewerCount = viewerCountRaw ? Number.parseInt(viewerCountRaw, 10) : null;
  let followerCount = null;
  let accountCreatedAt = null;
  const channelId = item.snippet?.channelId;
  if (channelId) {
    const channelUrl = new URL("https://www.googleapis.com/youtube/v3/channels");
    channelUrl.searchParams.set("part", "snippet,statistics");
    channelUrl.searchParams.set("id", channelId);
    channelUrl.searchParams.set("key", apiKey);
    const channelResponse = await fetch(channelUrl.toString(), {
      method: "GET"
    });
    if (channelResponse.ok) {
      const channelData = await channelResponse.json();
      const channel = channelData.items?.[0];
      followerCount = channel?.statistics?.subscriberCount ? Number.parseInt(channel.statistics.subscriberCount, 10) : null;
      accountCreatedAt = channel?.snippet?.publishedAt || null;
    }
  }
  const started = !!item.liveStreamingDetails?.actualStartTime;
  const ended = !!item.liveStreamingDetails?.actualEndTime;
  const isLive = item.snippet?.liveBroadcastContent === "live" || started && !ended;
  return {
    status: isLive ? "live" : "offline",
    viewerCount,
    followerCount,
    accountCreatedAt
  };
}
async function getTwitchSnapshot(channelLogin) {
  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return OFFLINE_SNAPSHOT;
  }
  const tokenResponse = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "client_credentials"
    })
  });
  if (!tokenResponse.ok) {
    return OFFLINE_SNAPSHOT;
  }
  const tokenData = await tokenResponse.json();
  if (!tokenData.access_token) {
    return OFFLINE_SNAPSHOT;
  }
  const headers = {
    "Client-Id": clientId,
    Authorization: `Bearer ${tokenData.access_token}`
  };
  let userId = null;
  let accountCreatedAt = null;
  const userResponse = await fetch(`https://api.twitch.tv/helix/users?login=${encodeURIComponent(channelLogin)}`, {
    headers
  });
  if (userResponse.ok) {
    const userData = await userResponse.json();
    const user = userData.data?.[0];
    userId = user?.id || null;
    accountCreatedAt = user?.created_at || null;
  }
  const streamResponse = await fetch(`https://api.twitch.tv/helix/streams?user_login=${encodeURIComponent(channelLogin)}`, {
    headers
  });
  if (!streamResponse.ok) {
    return {
      ...OFFLINE_SNAPSHOT,
      accountCreatedAt
    };
  }
  const streamData = await streamResponse.json();
  const liveStream = streamData.data?.[0];
  const viewerCount = liveStream?.viewer_count ?? null;
  let followerCount = null;
  if (userId) {
    const followersResponse = await fetch(`https://api.twitch.tv/helix/channels/followers?broadcaster_id=${encodeURIComponent(userId)}`, {
      headers
    });
    if (followersResponse.ok) {
      const followersData = await followersResponse.json();
      followerCount = typeof followersData.total === "number" ? followersData.total : null;
    }
  }
  return {
    status: liveStream ? "live" : "offline",
    viewerCount,
    followerCount,
    accountCreatedAt
  };
}
async function getKickSnapshot(channelSlug) {
  const kickClientId = process.env.KICK_CLIENT_ID;
  const kickClientSecret = process.env.KICK_CLIENT_SECRET;
  if (kickClientId && kickClientSecret) {
    const officialSnapshot = await getKickSnapshotFromOfficialApi(channelSlug, kickClientId, kickClientSecret);
    if (officialSnapshot) {
      return officialSnapshot;
    }
  }
  const encodedSlug = encodeURIComponent(channelSlug);
  const endpoints = [
    `https://kick.com/api/v2/channels/${encodedSlug}`,
    `https://kick.com/api/v2/channels/${encodedSlug}/livestream`,
    `https://kick.com/api/v1/channels/${encodedSlug}`,
    `https://kick.com/api/v1/channels/${encodedSlug}/livestream`
  ];
  const parsedSnapshots = [];
  for (const endpoint of endpoints) {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        Accept: "application/json, text/plain, */*",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
        Referer: "https://kick.com/",
        Origin: "https://kick.com"
      }
    });
    if (!response.ok) {
      continue;
    }
    const data = await response.json();
    const livestreamId = data.livestream?.id ?? data.data?.livestream?.id;
    const isLiveFlag = data.is_live ?? data.data?.is_live ?? data.livestream?.is_live ?? data.data?.livestream?.is_live;
    const viewerCount = data.livestream?.viewer_count ?? data.data?.livestream?.viewer_count ?? data.viewer_count ?? data.data?.viewer_count ?? null;
    const followerCount = data.followers_count ?? data.data?.followers_count ?? data.follower_count ?? data.data?.follower_count ?? null;
    const accountCreatedAt = data.user?.created_at ?? data.data?.user?.created_at ?? data.created_at ?? data.data?.created_at ?? null;
    parsedSnapshots.push({
      status: livestreamId || isLiveFlag === true || (viewerCount || 0) > 0 ? "live" : "offline",
      viewerCount,
      followerCount,
      accountCreatedAt
    });
  }
  if (parsedSnapshots.length > 0) {
    const liveSnapshot = parsedSnapshots.find((snapshot) => snapshot.status === "live");
    if (liveSnapshot) {
      return liveSnapshot;
    }
    const richestOffline = parsedSnapshots.reduce((best, current) => {
      const bestScore = (best.viewerCount ? 1 : 0) + (best.followerCount ? 1 : 0) + (best.accountCreatedAt ? 1 : 0);
      const currentScore = (current.viewerCount ? 1 : 0) + (current.followerCount ? 1 : 0) + (current.accountCreatedAt ? 1 : 0);
      return currentScore > bestScore ? current : best;
    }, parsedSnapshots[0]);
    return richestOffline;
  }
  const pageResponse = await fetch(`https://kick.com/${encodedSlug}`, {
    method: "GET",
    headers: {
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
      Referer: "https://kick.com/"
    }
  });
  if (pageResponse.ok) {
    const html = await pageResponse.text();
    const isLive = /"is_live"\s*:\s*true/i.test(html);
    const viewerMatch = html.match(/"viewer_count"\s*:\s*(\d+)/i);
    const followerMatch = html.match(/"followers?_count"\s*:\s*(\d+)/i);
    const createdAtMatch = html.match(/"created_at"\s*:\s*"([^"]+)"/i);
    return {
      status: isLive ? "live" : "offline",
      viewerCount: viewerMatch ? Number.parseInt(viewerMatch[1], 10) : null,
      followerCount: followerMatch ? Number.parseInt(followerMatch[1], 10) : null,
      accountCreatedAt: createdAtMatch?.[1] || null
    };
  }
  return OFFLINE_SNAPSHOT;
}
async function getKickSnapshotFromOfficialApi(channelSlug, clientId, clientSecret) {
  const accessToken = await getKickAppAccessToken(clientId, clientSecret);
  if (!accessToken) {
    return null;
  }
  const channelsUrl = new URL("https://api.kick.com/public/v1/channels");
  channelsUrl.searchParams.append("slug", channelSlug);
  const response = await fetch(channelsUrl.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Client-Id": clientId,
      Accept: "application/json"
    }
  });
  if (!response.ok) {
    return null;
  }
  const data = await response.json();
  const channel = data.data?.[0];
  if (!channel) {
    return OFFLINE_SNAPSHOT;
  }
  const isLive = channel.stream?.is_live === true;
  const viewerCount = channel.stream?.viewer_count ?? null;
  const followerCount = channel.followers_count ?? channel.follower_count ?? null;
  const accountCreatedAt = channel.user?.created_at ?? channel.created_at ?? null;
  return {
    status: isLive || (viewerCount || 0) > 0 ? "live" : "offline",
    viewerCount,
    followerCount,
    accountCreatedAt
  };
}
async function getKickAppAccessToken(clientId, clientSecret) {
  const now = Date.now();
  if (kickTokenCache && now < kickTokenCache.expiresAt) {
    return kickTokenCache.accessToken;
  }
  const response = await fetch("https://id.kick.com/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json"
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret
    })
  });
  if (!response.ok) {
    return null;
  }
  const data = await response.json();
  if (!data.access_token) {
    return null;
  }
  const expiresInMs = Math.max((data.expires_in || 3600) - 60, 60) * 1e3;
  kickTokenCache = {
    accessToken: data.access_token,
    expiresAt: now + expiresInMs
  };
  return data.access_token;
}
async function getLivestreamSnapshot(platform, streamKey) {
  try {
    if (platform === "youtube") {
      return await getYouTubeSnapshot(streamKey);
    }
    if (platform === "kick") {
      return await getKickSnapshot(streamKey);
    }
    return await getTwitchSnapshot(streamKey);
  } catch {
    return OFFLINE_SNAPSHOT;
  }
}
const addStreamSchema = z.object({
  url: z.string().url(),
  title: z.string().max(120).optional()
});
const removeStreamSchema = z.object({
  id: z.string().uuid()
});
const URL_REGEX = /https?:\/\/[^\s)]+/gi;
function normalizeUrl(value) {
  return value.trim().replace(/[),.;]+$/g, "");
}
function normalizeStreamKey(platform, streamKey) {
  if (platform === "youtube" && streamKey.startsWith("handle:")) {
    const handle = streamKey.slice("handle:".length).replace(/^@/, "");
    return `${platform}:handle:${handle}`;
  }
  return `${platform}:${streamKey}`;
}
function collectStringValues(input, depth = 0) {
  if (depth > 3 || input == null) return [];
  if (typeof input === "string") {
    const trimmed = input.trim();
    return trimmed ? [trimmed] : [];
  }
  if (Array.isArray(input)) {
    return input.flatMap((item) => collectStringValues(item, depth + 1));
  }
  if (typeof input === "object") {
    return Object.values(input).flatMap((value) => collectStringValues(value, depth + 1));
  }
  return [];
}
function extractUrls(input) {
  const values = collectStringValues(input);
  const urls = [];
  for (const value of values) {
    const matches = value.match(URL_REGEX);
    if (!matches) continue;
    for (const match of matches) {
      const normalized = normalizeUrl(match);
      if (normalized) urls.push(normalized);
    }
  }
  return urls;
}
function toKickUrl(value) {
  const username = String(value || "").trim().replace(/^@/, "");
  if (!username) return null;
  return `https://kick.com/${username}`;
}
function toTwitchUrl(value) {
  const username = String(value || "").trim().replace(/^@/, "");
  if (!username) return null;
  return `https://www.twitch.tv/${username}`;
}
function toYouTubeHandleUrl(value) {
  const username = String(value || "").trim().replace(/^@/, "");
  if (!username) return null;
  return `https://www.youtube.com/@${username}`;
}
function collectCandidateUrls(meta, profile) {
  const urls = /* @__PURE__ */ new Set();
  const kickFromUsername = toKickUrl(meta?.kick_username);
  if (kickFromUsername) urls.add(kickFromUsername);
  const twitchFromUsername = toTwitchUrl(meta?.twitch_username);
  if (twitchFromUsername) urls.add(twitchFromUsername);
  const selectedYouTubeChannel = String(meta?.selected_youtube_channel || "").trim();
  if (selectedYouTubeChannel) {
    if (selectedYouTubeChannel.startsWith("handle:")) {
      urls.add(`https://www.youtube.com/@${selectedYouTubeChannel.slice("handle:".length)}`);
    } else if (selectedYouTubeChannel.startsWith("channel:")) {
      urls.add(`https://www.youtube.com/channel/${selectedYouTubeChannel.slice("channel:".length)}`);
    } else if (selectedYouTubeChannel.startsWith("user:")) {
      urls.add(`https://www.youtube.com/user/${selectedYouTubeChannel.slice("user:".length)}`);
    } else if (selectedYouTubeChannel.startsWith("custom:")) {
      urls.add(`https://www.youtube.com/c/${selectedYouTubeChannel.slice("custom:".length)}`);
    } else {
      for (const url of extractUrls(selectedYouTubeChannel)) {
        urls.add(url);
      }
    }
  }
  const youtubeFromHandle = toYouTubeHandleUrl(meta?.youtube_handle);
  if (youtubeFromHandle) urls.add(youtubeFromHandle);
  return Array.from(urls);
}
function parseAutoCandidates(urls) {
  const dedupe = /* @__PURE__ */ new Set();
  const candidates = [];
  for (const url of urls) {
    try {
      const parsed = parseLivestreamLink(url);
      const key = `${parsed.platform}:${parsed.streamKey}`;
      if (dedupe.has(key)) continue;
      dedupe.add(key);
      candidates.push({
        url,
        platform: parsed.platform,
        stream_key: parsed.streamKey
      });
    } catch {
    }
  }
  return candidates;
}
function pickMostEngaged(candidates) {
  return [...candidates].sort((a, b) => {
    const aViewers = a.viewer_count || 0;
    const bViewers = b.viewer_count || 0;
    if (aViewers !== bViewers) return bViewers - aViewers;
    const aLive = a.status === "live" ? 1 : 0;
    const bLive = b.status === "live" ? 1 : 0;
    if (aLive !== bLive) return bLive - aLive;
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  })[0] || null;
}
const Route$9 = createFileRoute("/api/live/streams")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const client = hasSupabaseAdminConfig() ? getSupabaseAdminClient() : getSupabaseServerPublicClient();
          const { data: dbLivestreams, error: liveError } = await client.from("org_member_livestreams").select("*").limit(1e4);
          const autoStreams = [];
          const dbStreamsByEmail = /* @__PURE__ */ new Map();
          if (!liveError && Array.isArray(dbLivestreams)) {
            for (const livestream of dbLivestreams) {
              const email = String(livestream.email || "").trim().toLowerCase();
              if (!email) continue;
              if (!dbStreamsByEmail.has(email)) {
                dbStreamsByEmail.set(email, []);
              }
              dbStreamsByEmail.get(email).push(livestream);
            }
          }
          for (const [, streams] of dbStreamsByEmail) {
            const preferred = streams.sort((a, b) => {
              const aTime = new Date(a.updated_at).getTime();
              const bTime = new Date(b.updated_at).getTime();
              return bTime - aTime;
            })[0];
            if (!preferred) continue;
            try {
              const snapshot = await getLivestreamSnapshot(preferred.platform, preferred.stream_key);
              autoStreams.push({
                id: `db-${preferred.id}`,
                url: preferred.stream_url,
                title: preferred.display_name || preferred.email.split("@")[0] || null,
                platform: preferred.platform,
                stream_key: preferred.stream_key,
                created_by: preferred.email,
                created_at: preferred.created_at,
                updated_at: preferred.updated_at,
                status: snapshot.status,
                viewer_count: snapshot.viewerCount,
                follower_count: snapshot.followerCount,
                account_created_at: snapshot.accountCreatedAt
              });
            } catch (err) {
              console.error("Failed to fetch livestream snapshot:", err);
            }
          }
          const users = await listAuthIndexedUsers(client);
          const { data: profileRows } = await client.from("org_member_profiles").select("email, display_name, bio, updated_at").limit(1e4);
          const profileByEmail = new Map(
            (profileRows || []).map((row) => [String(row.email || "").trim().toLowerCase(), row])
          );
          const existingStreamKeys = new Set(
            autoStreams.map((stream) => normalizeStreamKey(stream.platform, stream.stream_key))
          );
          const existingEmails = new Set(
            autoStreams.map((stream) => String(stream.created_by || "").trim().toLowerCase())
          );
          for (const row of users) {
            const email = String(row.email || "").trim().toLowerCase();
            if (!row.id || !email) continue;
            if (existingEmails.has(email)) continue;
            const profile = profileByEmail.get(email);
            const candidates = parseAutoCandidates(
              collectCandidateUrls(row.user_metadata ?? null, profile)
            ).filter((candidate) => !existingStreamKeys.has(normalizeStreamKey(candidate.platform, candidate.stream_key)));
            if (candidates.length === 0) continue;
            const streamCandidates = await Promise.all(
              candidates.map(async (candidate) => {
                const snapshot = await getLivestreamSnapshot(candidate.platform, candidate.stream_key);
                return {
                  id: `auto-${row.id}-${candidate.platform}-${candidate.stream_key}`,
                  url: candidate.url,
                  title: profile?.display_name?.trim() || email.split("@")[0] || null,
                  platform: candidate.platform,
                  stream_key: candidate.stream_key,
                  created_by: email,
                  created_at: row.created_at || (/* @__PURE__ */ new Date()).toISOString(),
                  updated_at: profile?.updated_at || row.updated_at || row.created_at || (/* @__PURE__ */ new Date()).toISOString(),
                  status: snapshot.status,
                  viewer_count: snapshot.viewerCount,
                  follower_count: snapshot.followerCount,
                  account_created_at: snapshot.accountCreatedAt
                };
              })
            );
            const best = pickMostEngaged(streamCandidates);
            if (best) {
              autoStreams.push(best);
              existingStreamKeys.add(normalizeStreamKey(best.platform, best.stream_key));
            }
          }
          let requesterEmail = "anonymous";
          let requesterSource = "none";
          let canManage = false;
          let canUseAutoclipper = false;
          const autoclipperEnabled = hasSupabaseAdminConfig();
          const authHeader = request.headers.get("authorization") || "";
          const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
          if (token) {
            try {
              const access = await getRequesterAccess(request);
              requesterEmail = access.requester.email;
              requesterSource = access.requester.source;
              canManage = access.isSuperadmin || access.permissions.includes("manage_livestreams");
              canUseAutoclipper = autoclipperEnabled && (access.isSuperadmin || access.permissions.includes("use_autoclipper"));
            } catch {
            }
          }
          const sortedStreams = [...autoStreams].sort((a, b) => {
            const aLive = a.status === "live" ? 1 : 0;
            const bLive = b.status === "live" ? 1 : 0;
            if (aLive !== bLive) return bLive - aLive;
            const aViewers = a.viewer_count || 0;
            const bViewers = b.viewer_count || 0;
            if (aViewers !== bViewers) return bViewers - aViewers;
            return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
          });
          return Response.json({
            requester: {
              email: requesterEmail,
              source: requesterSource
            },
            canManage,
            canUseAutoclipper,
            streams: sortedStreams
          });
        } catch (error) {
          if (error instanceof Response) return error;
          return Response.json(
            { error: error instanceof Error ? error.message : "Unexpected server error" },
            { status: 500 }
          );
        }
      },
      POST: async ({ request }) => {
        try {
          const body = await request.json();
          const parsed = addStreamSchema.safeParse(body);
          if (!parsed.success) {
            return Response.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
          }
          const stream = parseLivestreamLink(parsed.data.url);
          if (!hasSupabaseAdminConfig()) {
            return Response.json(
              { error: "Admin livestream management requires SUPABASE_SERVICE_ROLE_KEY in this environment." },
              { status: 503 }
            );
          }
          const { requester } = await requirePermission(request, "manage_livestreams");
          const admin = getSupabaseAdminClient();
          const { data, error } = await admin.rpc("add_org_livestream", {
            p_url: parsed.data.url,
            p_title: parsed.data.title || null,
            p_platform: stream.platform,
            p_stream_key: stream.streamKey,
            p_created_by: requester.email
          });
          if (error) {
            return Response.json({ error: error.message }, { status: 500 });
          }
          return Response.json({ stream: data?.[0] || null });
        } catch (error) {
          if (error instanceof Response) return error;
          if (error instanceof Error) {
            return Response.json({ error: error.message }, { status: 400 });
          }
          return Response.json({ error: "Unexpected server error" }, { status: 500 });
        }
      },
      DELETE: async ({ request }) => {
        try {
          const body = await request.json();
          const parsed = removeStreamSchema.safeParse(body);
          if (!parsed.success) {
            return Response.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
          }
          if (!hasSupabaseAdminConfig()) {
            return Response.json(
              { error: "Admin livestream management requires SUPABASE_SERVICE_ROLE_KEY in this environment." },
              { status: 503 }
            );
          }
          await requirePermission(request, "manage_livestreams");
          const admin = getSupabaseAdminClient();
          const { data, error } = await admin.rpc("delete_org_livestream", {
            p_id: parsed.data.id
          });
          if (error) {
            return Response.json({ error: error.message }, { status: 500 });
          }
          return Response.json({ deleted: !!data });
        } catch (error) {
          if (error instanceof Response) return error;
          return Response.json(
            { error: error instanceof Error ? error.message : "Unexpected server error" },
            { status: 500 }
          );
        }
      }
    }
  }
});
function normalizePlatforms(platforms) {
  const allow = /* @__PURE__ */ new Set(["x", "threads", "instagram", "kick", "twitch"]);
  return Array.from(new Set(platforms.map((p) => p.trim().toLowerCase()).filter((p) => allow.has(p))));
}
function buildAutoCaption(input) {
  const platform = input.streamPlatform ? input.streamPlatform.toUpperCase() : "LIVE";
  const key = input.streamKey ? ` @${input.streamKey}` : "";
  const timestamp = (/* @__PURE__ */ new Date()).toLocaleString("en-US", { hour: "numeric", minute: "2-digit" });
  return `Fresh ${input.clipWindowMinutes || 5}m clip from ${platform}${key}. Highlight dropped at ${timestamp}. #WAGESociety #Creator`;
}
async function createAutoclipperJob(input) {
  const admin = getSupabaseAdminClient();
  const safePlatforms = normalizePlatforms(input.platforms);
  const clipWindowMinutes = Math.max(1, Math.min(15, input.clipWindowMinutes || 5));
  const caption = input.autoCaption ? buildAutoCaption({ ...input, clipWindowMinutes }) : "";
  const clipMetadata = {
    kind: "autoclip",
    status: "queued",
    source: input.source,
    requestedBy: input.requestedBy,
    command: input.commandText,
    clipWindowMinutes,
    autoPost: input.autoPost,
    autoCaption: input.autoCaption,
    platforms: safePlatforms,
    streamPlatform: input.streamPlatform || null,
    streamKey: input.streamKey || null,
    caption,
    clipRequestedAt: (/* @__PURE__ */ new Date()).toISOString(),
    clipUrl: null
  };
  const { data: clipJob, error: clipError } = await admin.from("org_dashboard_tool_entries").insert({
    tool_key: "promotion-hub",
    title: `Autoclip requested by ${input.requestedBy}`,
    details: caption || `Processing ${clipWindowMinutes} minute clip from chat command ${input.commandText}`,
    status: "active",
    event_date: (/* @__PURE__ */ new Date()).toISOString(),
    metadata: clipMetadata,
    created_by: input.requestedBy,
    updated_by: input.requestedBy
  }).select("id, metadata, created_at, updated_at").single();
  if (clipError) throw new Error(clipError.message);
  let queuedPostId = null;
  if (input.autoPost && safePlatforms.length > 0) {
    const { data: queuedPost, error: postError } = await admin.from("org_dashboard_tool_entries").insert({
      tool_key: "promotion-hub",
      title: (caption || `New clip from ${input.streamPlatform || "live stream"}`).slice(0, 160),
      details: caption,
      status: "planned",
      event_date: (/* @__PURE__ */ new Date()).toISOString(),
      metadata: {
        kind: "autoclip-social",
        clipJobId: clipJob.id,
        autoCaption: input.autoCaption,
        autoPost: input.autoPost,
        platforms: safePlatforms
      },
      created_by: input.requestedBy,
      updated_by: input.requestedBy
    }).select("id").single();
    if (!postError && queuedPost?.id) {
      queuedPostId = queuedPost.id;
      await admin.from("org_dashboard_tool_entries").update({
        metadata: {
          ...clipJob.metadata || {},
          queuedPostId
        },
        updated_by: input.requestedBy,
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      }).eq("id", clipJob.id);
    }
  }
  return {
    clipJobId: clipJob.id,
    queuedPostId,
    caption,
    platforms: safePlatforms
  };
}
const createSchema = z.object({
  commandText: z.string().trim().default("!clip"),
  streamPlatform: z.enum(["kick", "twitch", "youtube"]).optional(),
  streamKey: z.string().trim().max(120).optional(),
  autoPost: z.boolean().default(true),
  autoCaption: z.boolean().default(true),
  platforms: z.array(z.string()).max(10).default(["x", "kick", "instagram"]),
  clipWindowMinutes: z.number().int().min(1).max(15).default(5)
});
const updateSchema$1 = z.object({
  id: z.string().uuid(),
  status: z.enum(["queued", "processing", "ready", "posted", "failed"]),
  clipUrl: z.string().url().optional(),
  error: z.string().max(500).optional()
});
const chatSchema = z.object({
  message: z.string().trim().min(1),
  user: z.string().trim().min(1).default("chat-bot@system.local"),
  streamPlatform: z.enum(["kick", "twitch", "youtube"]).optional(),
  streamKey: z.string().trim().max(120).optional(),
  autoPost: z.boolean().default(true),
  autoCaption: z.boolean().default(true),
  platforms: z.array(z.string()).max(10).default(["x", "kick", "instagram"])
});
const AUTOCLIPPER_DISABLED_MESSAGE = "Autoclipper is disabled in this environment because SUPABASE_SERVICE_ROLE_KEY is not configured.";
function hasWebhookSecret(request) {
  const secret = process.env.AUTOCLIPPER_WEBHOOK_SECRET;
  if (!secret) return false;
  const incoming = request.headers.get("x-autoclipper-secret") || "";
  const incomingBuffer = Buffer.from(incoming);
  const secretBuffer = Buffer.from(secret);
  if (incomingBuffer.length !== secretBuffer.length) return false;
  try {
    return timingSafeEqual(incomingBuffer, secretBuffer);
  } catch {
    return false;
  }
}
async function fetchAutoclipRows(limit = 100) {
  const admin = getSupabaseAdminClient();
  const { data, error } = await admin.from("org_dashboard_tool_entries").select("id, title, details, status, metadata, created_by, created_at, updated_at, event_date").eq("tool_key", "promotion-hub").contains("metadata", { kind: "autoclip" }).order("created_at", { ascending: false }).limit(limit);
  if (error) throw new Error(error.message);
  return data || [];
}
function mapRowsToJobs(rows) {
  return rows.map((row) => {
    const metadata = row.metadata || {};
    return {
      id: row.id,
      status: metadata.status || "queued",
      command: String(metadata.command || "!clip"),
      source: String(metadata.source || "dashboard"),
      requestedBy: String(metadata.requestedBy || row.created_by || "unknown"),
      clipWindowMinutes: Number(metadata.clipWindowMinutes || 5),
      streamPlatform: metadata.streamPlatform || null,
      streamKey: metadata.streamKey || null,
      autoPost: Boolean(metadata.autoPost),
      autoCaption: Boolean(metadata.autoCaption),
      platforms: Array.isArray(metadata.platforms) ? metadata.platforms : [],
      caption: String(metadata.caption || ""),
      clipUrl: metadata.clipUrl || null,
      queuedPostId: metadata.queuedPostId || null,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  });
}
async function updateAutoclipJobStatus(input) {
  const admin = getSupabaseAdminClient();
  const { data: existing, error: fetchError } = await admin.from("org_dashboard_tool_entries").select("id, metadata").eq("id", input.id).eq("tool_key", "promotion-hub").contains("metadata", { kind: "autoclip" }).maybeSingle();
  if (fetchError) throw new Error(fetchError.message);
  if (!existing) throw new Error("Clip job not found.");
  const metadata = existing.metadata || {};
  const nextMetadata = {
    ...metadata,
    status: input.status,
    clipUrl: input.clipUrl || metadata.clipUrl || null
  };
  if (input.error) nextMetadata.error = input.error;
  if (input.note) nextMetadata.discordNote = input.note;
  const { error: updateError } = await admin.from("org_dashboard_tool_entries").update({
    status: input.status === "posted" ? "done" : input.status === "failed" ? "blocked" : "active",
    metadata: nextMetadata,
    updated_by: input.updatedBy,
    updated_at: (/* @__PURE__ */ new Date()).toISOString()
  }).eq("id", input.id);
  if (updateError) throw new Error(updateError.message);
}
const Route$8 = createFileRoute("/api/live/clips")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          if (!hasSupabaseAdminConfig()) {
            return Response.json({ error: AUTOCLIPPER_DISABLED_MESSAGE }, { status: 503 });
          }
          if (hasWebhookSecret(request)) {
            const rows2 = await fetchAutoclipRows(20);
            const jobs2 = mapRowsToJobs(rows2);
            return Response.json({ jobs: jobs2 });
          }
          const access = await requirePermission(request, "use_autoclipper");
          const rows = await fetchAutoclipRows(100);
          const jobs = mapRowsToJobs(rows);
          return Response.json({
            requester: {
              ...access.requester,
              role: access.role
            },
            jobs
          });
        } catch (error) {
          if (error instanceof Response) return error;
          const message = error instanceof Error ? error.message : "Unexpected server error";
          return Response.json({ error: message }, { status: 500 });
        }
      },
      POST: async ({ request }) => {
        try {
          if (!hasSupabaseAdminConfig()) {
            return Response.json({ error: AUTOCLIPPER_DISABLED_MESSAGE }, { status: 503 });
          }
          const body = await request.json();
          if (hasWebhookSecret(request)) {
            const parsedChat = chatSchema.safeParse(body);
            if (!parsedChat.success) {
              return Response.json({ error: "Invalid payload", details: parsedChat.error.flatten() }, { status: 400 });
            }
            if (!parsedChat.data.message.toLowerCase().startsWith("!clip")) {
              return Response.json({ ignored: true, reason: "Message is not a !clip command." });
            }
            const result2 = await createAutoclipperJob({
              requestedBy: parsedChat.data.user,
              source: "chat",
              commandText: parsedChat.data.message,
              streamPlatform: parsedChat.data.streamPlatform || null,
              streamKey: parsedChat.data.streamKey || null,
              autoPost: parsedChat.data.autoPost,
              autoCaption: parsedChat.data.autoCaption,
              platforms: parsedChat.data.platforms,
              clipWindowMinutes: 5
            });
            return Response.json({ ok: true, ...result2 });
          }
          const access = await requirePermission(request, "use_autoclipper");
          const parsed = createSchema.safeParse(body);
          if (!parsed.success) {
            return Response.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
          }
          const commandText = parsed.data.commandText || "!clip";
          if (!commandText.toLowerCase().startsWith("!clip")) {
            return Response.json({ error: "commandText must begin with !clip" }, { status: 400 });
          }
          const result = await createAutoclipperJob({
            requestedBy: access.requester.email,
            source: "dashboard",
            commandText,
            streamPlatform: parsed.data.streamPlatform || null,
            streamKey: parsed.data.streamKey || null,
            autoPost: parsed.data.autoPost,
            autoCaption: parsed.data.autoCaption,
            platforms: parsed.data.platforms,
            clipWindowMinutes: parsed.data.clipWindowMinutes
          });
          return Response.json({ ok: true, ...result });
        } catch (error) {
          if (error instanceof Response) return error;
          const message = error instanceof Error ? error.message : "Unexpected server error";
          return Response.json({ error: message }, { status: 500 });
        }
      },
      PUT: async ({ request }) => {
        try {
          if (!hasSupabaseAdminConfig()) {
            return Response.json({ error: AUTOCLIPPER_DISABLED_MESSAGE }, { status: 503 });
          }
          const body = await request.json();
          const parsed = updateSchema$1.safeParse(body);
          if (!parsed.success) {
            return Response.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
          }
          if (hasWebhookSecret(request)) {
            await updateAutoclipJobStatus({
              id: parsed.data.id,
              status: parsed.data.status,
              clipUrl: parsed.data.clipUrl,
              error: parsed.data.error,
              updatedBy: "discord-bot"
            });
            return Response.json({ ok: true });
          }
          const access = await requirePermission(request, "manage_livestreams");
          await updateAutoclipJobStatus({
            id: parsed.data.id,
            status: parsed.data.status,
            clipUrl: parsed.data.clipUrl,
            error: parsed.data.error,
            updatedBy: access.requester.email
          });
          return Response.json({ ok: true });
        } catch (error) {
          if (error instanceof Response) return error;
          const message = error instanceof Error ? error.message : "Unexpected server error";
          return Response.json({ error: message }, { status: 500 });
        }
      }
    }
  }
});
const applySchema = z.object({
  requestId: z.string().uuid(),
  message: z.string().trim().max(500).default("")
});
const Route$7 = createFileRoute("/api/collab/apply")({
  server: {
    handlers: {
      /**
       * POST /api/collab/apply
       * Body: { requestId, message? }
       * Creates or refreshes an application.
       */
      POST: async ({ request }) => {
        try {
          const access = await requirePermission(request, "view_creator_tools");
          const body = await request.json();
          const parsed = applySchema.safeParse(body);
          if (!parsed.success) {
            return Response.json({ error: "Invalid payload" }, { status: 400 });
          }
          const admin = getSupabaseAdminClient();
          const { data: req, error: reqError } = await admin.from("org_collab_requests").select("id, owner_email, status").eq("id", parsed.data.requestId).eq("status", "open").maybeSingle();
          if (reqError) return Response.json({ error: reqError.message }, { status: 500 });
          if (!req) return Response.json({ error: "Collab request not found or closed." }, { status: 404 });
          if (req.owner_email === access.requester.email) {
            return Response.json({ error: "You cannot apply to your own request." }, { status: 400 });
          }
          const { data, error } = await admin.from("org_collab_applications").upsert(
            {
              request_id: parsed.data.requestId,
              applicant_email: access.requester.email,
              message: parsed.data.message,
              status: "pending"
            },
            { onConflict: "request_id,applicant_email" }
          ).select("id, status").single();
          if (error) return Response.json({ error: error.message }, { status: 500 });
          return Response.json({ application: data });
        } catch (error) {
          if (error instanceof Response) return error;
          return Response.json({ error: "Unexpected server error" }, { status: 500 });
        }
      },
      /**
       * GET /api/collab/apply
       * Returns all applications the current user has submitted.
       */
      GET: async ({ request }) => {
        try {
          const access = await requirePermission(request, "view_creator_tools");
          const admin = getSupabaseAdminClient();
          const { data, error } = await admin.from("org_collab_applications").select("id, request_id, message, status, applied_at").eq("applicant_email", access.requester.email).order("applied_at", { ascending: false });
          if (error && error.code !== "42P01") {
            return Response.json({ error: error.message }, { status: 500 });
          }
          const apps = data || [];
          const requestIds = apps.map((a) => a.request_id);
          let requestMap = {};
          if (requestIds.length) {
            const { data: reqs } = await admin.from("org_collab_requests").select("id, title, owner_email").in("id", requestIds);
            for (const r of reqs || []) {
              requestMap[r.id] = { title: r.title, owner_email: r.owner_email };
            }
          }
          return Response.json({
            applications: apps.map((a) => ({
              ...a,
              requestTitle: requestMap[a.request_id]?.title || null,
              requestOwner: requestMap[a.request_id]?.owner_email || null
            }))
          });
        } catch (error) {
          if (error instanceof Response) return error;
          return Response.json({ error: "Unexpected server error" }, { status: 500 });
        }
      }
    }
  }
});
const updateSchema = z.object({
  applicationId: z.string().uuid(),
  status: z.enum(["accepted", "rejected"])
});
const Route$6 = createFileRoute("/api/collab/applicants")({
  server: {
    handlers: {
      /**
       * GET /api/collab/applicants?requestId=<uuid>
       * Returns applicants for the given request (owner/admin only).
       * Each applicant includes their public profile.
       */
      GET: async ({ request }) => {
        try {
          const access = await requirePermission(request, "view_creator_tools");
          const url = new URL(request.url);
          const requestId = url.searchParams.get("requestId");
          if (!requestId) return Response.json({ error: "requestId is required" }, { status: 400 });
          const admin = getSupabaseAdminClient();
          const isAdmin = access.role === "admin" || access.role === "superadmin";
          if (!isAdmin) {
            const { data: req } = await admin.from("org_collab_requests").select("owner_email").eq("id", requestId).maybeSingle();
            const owner = req?.owner_email;
            if (!owner || owner !== access.requester.email) {
              return Response.json({ error: "Not authorized" }, { status: 403 });
            }
          }
          const { data, error } = await admin.from("org_collab_applications").select("id, applicant_email, message, status, applied_at").eq("request_id", requestId).order("applied_at", { ascending: true });
          if (error) return Response.json({ error: error.message }, { status: 500 });
          const applicants = data || [];
          const emails = applicants.map((a) => a.applicant_email);
          let profiles = {};
          if (emails.length) {
            const { data: profileData } = await admin.from("org_member_profiles").select("email, display_name, avatar_url, bio, skills").in("email", emails);
            for (const p of profileData || []) {
              profiles[p.email] = p;
            }
          }
          return Response.json({
            applicants: applicants.map((a) => ({
              ...a,
              profile: profiles[a.applicant_email] || null
            }))
          });
        } catch (error) {
          if (error instanceof Response) return error;
          return Response.json({ error: "Unexpected server error" }, { status: 500 });
        }
      },
      /**
       * PUT /api/collab/applicants
       * Body: { applicationId, status: 'accepted' | 'rejected' }
       * Owner accepts/rejects an application.
       */
      PUT: async ({ request }) => {
        try {
          const access = await requirePermission(request, "view_creator_tools");
          const body = await request.json();
          const parsed = updateSchema.safeParse(body);
          if (!parsed.success) {
            return Response.json({ error: "Invalid payload" }, { status: 400 });
          }
          const admin = getSupabaseAdminClient();
          const isAdmin = access.role === "admin" || access.role === "superadmin";
          const { data: app } = await admin.from("org_collab_applications").select("id, request_id").eq("id", parsed.data.applicationId).maybeSingle();
          if (!app) return Response.json({ error: "Application not found" }, { status: 404 });
          if (!isAdmin) {
            const { data: req } = await admin.from("org_collab_requests").select("owner_email").eq("id", app.request_id).maybeSingle();
            const owner = req?.owner_email;
            if (!owner || owner !== access.requester.email) {
              return Response.json({ error: "Not authorized" }, { status: 403 });
            }
          }
          const { error } = await admin.from("org_collab_applications").update({ status: parsed.data.status }).eq("id", parsed.data.applicationId);
          if (error) return Response.json({ error: error.message }, { status: 500 });
          return Response.json({ updated: true });
        } catch (error) {
          if (error instanceof Response) return error;
          return Response.json({ error: "Unexpected server error" }, { status: 500 });
        }
      }
    }
  }
});
function getBearerToken(request) {
  const authHeader = request.headers.get("authorization") || request.headers.get("Authorization") || "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) return void 0;
  const token = authHeader.slice(7).trim();
  return token || void 0;
}
function getAdminOrRequestClient(request) {
  if (hasSupabaseAdminConfig()) {
    return getSupabaseAdminClient();
  }
  const token = getBearerToken(request);
  if (token) {
    return getSupabaseServerClientForToken(token);
  }
  return getSupabaseServerPublicClient();
}
function toStringOrNull(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}
function getDisplayName(userMetadata) {
  return toStringOrNull(userMetadata?.full_name) || toStringOrNull(userMetadata?.name) || toStringOrNull(userMetadata?.username) || toStringOrNull(userMetadata?.preferred_username);
}
const setRoleSchema = z.object({
  targetEmail: z.string().email(),
  role: z.enum(ORG_ROLES),
  banReason: z.string().trim().max(500).nullable().optional(),
  bannedUntil: z.string().datetime({ offset: true }).nullable().optional()
});
const setSubscriptionSchema = z.object({
  targetEmail: z.string().email(),
  membershipPlan: z.string().trim().min(1).max(80)
});
const USERNAME_REGEX = /^[a-zA-Z0-9_-]{3,20}$/;
const setUsernameSchema = z.object({
  targetEmail: z.string().email(),
  username: z.string().trim().min(3).max(20).regex(USERNAME_REGEX)
});
async function findAuthUserByEmail(email) {
  if (!hasSupabaseAdminConfig()) return null;
  const admin = getSupabaseAdminClient();
  let page = 1;
  const perPage = 1e3;
  while (page <= 10) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(error.message);
    const users = data?.users || [];
    if (!users.length) break;
    const match = users.find((user) => String(user.email || "").trim().toLowerCase() === email);
    if (match?.id) return match;
    if (users.length < perPage) break;
    page += 1;
  }
  return null;
}
const Route$5 = createFileRoute("/api/admin/roles")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const access = await getRequesterAccess(request);
          if (!access.isSuperadmin && !access.permissions.includes("manage_users")) {
            return Response.json({ error: "Manage users permission required" }, { status: 403 });
          }
          const admin = getAdminOrRequestClient(request);
          const { data, error } = await admin.rpc("list_org_member_roles");
          if (error) {
            return Response.json({ error: error.message }, { status: 500 });
          }
          const roleRows = Array.isArray(data) ? data || [] : [];
          const existingEmails = new Set(roleRows.map((row) => String(row.email || "").trim().toLowerCase()).filter(Boolean));
          let mergedRoles = [...roleRows];
          const inferredRows = [];
          let authUsers = await listAuthIndexedUsers(admin);
          if (hasSupabaseAdminConfig()) {
            const adminClient2 = getSupabaseAdminClient();
            const directAuthUsers = [];
            let page = 1;
            const perPage = 1e3;
            while (page <= 10) {
              const { data: usersData, error: usersError } = await adminClient2.auth.admin.listUsers({ page, perPage });
              if (usersError) break;
              const pageUsers = usersData?.users || [];
              if (!pageUsers.length) break;
              directAuthUsers.push(...pageUsers);
              if (pageUsers.length < perPage) break;
              page += 1;
            }
            if (directAuthUsers.length > 0) {
              const mergedAuthByEmail = /* @__PURE__ */ new Map();
              for (const indexedUser of authUsers) {
                const email = String(indexedUser.email || "").trim().toLowerCase();
                if (!email) continue;
                mergedAuthByEmail.set(email, {
                  id: String(indexedUser.id || email),
                  email,
                  created_at: indexedUser.created_at || indexedUser.updated_at || (/* @__PURE__ */ new Date()).toISOString(),
                  updated_at: indexedUser.updated_at || indexedUser.created_at || (/* @__PURE__ */ new Date()).toISOString(),
                  user_metadata: indexedUser.user_metadata
                });
              }
              for (const directUser of directAuthUsers) {
                const email = String(directUser.email || "").trim().toLowerCase();
                if (!email) continue;
                mergedAuthByEmail.set(email, {
                  id: String(directUser.id || email),
                  email,
                  created_at: directUser.created_at || directUser.updated_at || (/* @__PURE__ */ new Date()).toISOString(),
                  updated_at: directUser.updated_at || directUser.created_at || (/* @__PURE__ */ new Date()).toISOString(),
                  user_metadata: directUser.user_metadata || null
                });
              }
              authUsers = Array.from(mergedAuthByEmail.values()).map((user) => ({
                id: user.id,
                email: user.email,
                created_at: user.created_at,
                updated_at: user.updated_at,
                user_metadata: user.user_metadata,
                identities: null
              }));
            }
          }
          if (authUsers.length === 0 && hasSupabaseAdminConfig()) {
            const adminClient2 = getSupabaseAdminClient();
            const fallbackUsers = [];
            let page = 1;
            const perPage = 1e3;
            while (page <= 10) {
              const { data: usersData, error: usersError } = await adminClient2.auth.admin.listUsers({ page, perPage });
              if (usersError) break;
              const pageUsers = usersData?.users || [];
              if (!pageUsers.length) break;
              fallbackUsers.push(...pageUsers);
              if (pageUsers.length < perPage) break;
              page += 1;
            }
            authUsers = fallbackUsers.map((user) => ({
              id: String(user.id || user.email || "").toLowerCase(),
              email: user.email,
              created_at: user.created_at,
              updated_at: user.updated_at || user.created_at,
              user_metadata: user.user_metadata || null,
              identities: null
            }));
          }
          const authUsersByEmail = new Map(
            authUsers.map((user) => [String(user.email || "").trim().toLowerCase(), user]).filter(([email]) => Boolean(email))
          );
          const permissionCache = /* @__PURE__ */ new Map();
          const collectPermissionsForRole = async (targetRole) => {
            if (permissionCache.has(targetRole)) {
              return permissionCache.get(targetRole) || [];
            }
            const { data: permsData, error: permsError } = await admin.rpc("list_org_permissions_for_role", {
              p_role: targetRole
            });
            if (permsError) {
              permissionCache.set(targetRole, []);
              return [];
            }
            const keys = Array.isArray(permsData) ? permsData.map((row) => String(row?.permission_key || "").trim()).filter(Boolean) : [];
            permissionCache.set(targetRole, keys);
            return keys;
          };
          const indexInferredRows = authUsers.map((row) => {
            const email = String(row.email || "").trim().toLowerCase();
            if (!email || existingEmails.has(email)) return null;
            existingEmails.add(email);
            const createdAt = row.created_at || row.updated_at || (/* @__PURE__ */ new Date()).toISOString();
            const updatedAt = row.updated_at || row.created_at || createdAt;
            return {
              email,
              role: "user",
              granted_by: null,
              banned_by: null,
              ban_reason: null,
              banned_until: null,
              created_at: createdAt,
              updated_at: updatedAt,
              user_id: String(row.id || "").trim() || null,
              display_name: getDisplayName(row.user_metadata || null),
              membership_plan: toStringOrNull(row.user_metadata?.membership_plan),
              stripe_customer_id: toStringOrNull(row.user_metadata?.stripe_customer_id),
              stripe_subscription_id: toStringOrNull(row.user_metadata?.stripe_subscription_id)
            };
          }).filter((row) => Boolean(row));
          inferredRows.push(...indexInferredRows);
          if (hasSupabaseAdminConfig() && inferredRows.length > 0) {
            const adminClient2 = getSupabaseAdminClient();
            await adminClient2.from("org_user_roles").upsert(
              inferredRows.map((row) => ({
                email: row.email,
                role: "user",
                granted_by: row.granted_by
              })),
              { onConflict: "email", ignoreDuplicates: true }
            );
          }
          mergedRoles = [...roleRows, ...inferredRows];
          mergedRoles = await Promise.all(
            mergedRoles.map(async (row) => {
              const email = String(row.email || "").trim().toLowerCase();
              const authUser = authUsersByEmail.get(email);
              const userMetadata = authUser?.user_metadata || null;
              const effectivePermissions = await collectPermissionsForRole(row.role);
              return {
                ...row,
                email,
                user_id: row.user_id || String(authUser?.id || "").trim() || null,
                display_name: row.display_name || getDisplayName(userMetadata),
                membership_plan: row.membership_plan || toStringOrNull(userMetadata?.membership_plan) || "free",
                stripe_customer_id: row.stripe_customer_id || toStringOrNull(userMetadata?.stripe_customer_id),
                stripe_subscription_id: row.stripe_subscription_id || toStringOrNull(userMetadata?.stripe_subscription_id),
                effective_permissions: effectivePermissions
              };
            })
          );
          mergedRoles.sort((a, b) => a.email.localeCompare(b.email));
          return Response.json({
            requester: {
              ...access.requester,
              role: access.role,
              permissions: access.permissions
            },
            roles: mergedRoles
          });
        } catch (error) {
          if (error instanceof Response) return error;
          return Response.json(
            { error: error instanceof Error ? error.message : "Unexpected server error" },
            { status: 500 }
          );
        }
      },
      POST: async ({ request }) => {
        try {
          const { requester, role } = await requirePermission(request, "manage_users");
          const admin = getAdminOrRequestClient(request);
          const body = await request.json();
          const parsed = setRoleSchema.safeParse(body);
          if (!parsed.success) {
            return Response.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
          }
          const normalizedEmail = parsed.data.targetEmail.toLowerCase();
          const requestedRole = parsed.data.role;
          const { data: currentMember, error: currentMemberError } = await admin.from("org_user_roles").select("role").eq("email", normalizedEmail).maybeSingle();
          if (currentMemberError) {
            return Response.json({ error: currentMemberError.message }, { status: 500 });
          }
          if (currentMember?.role && !canManageRole(role, currentMember.role)) {
            return Response.json({ error: "You cannot change a member at your role level or above" }, { status: 403 });
          }
          if (!canManageRole(role, requestedRole)) {
            return Response.json({ error: "You cannot assign that role" }, { status: 403 });
          }
          if (requestedRole === "banned" && !parsed.data.banReason?.trim()) {
            return Response.json({ error: "Ban reason is required when banning a member" }, { status: 400 });
          }
          const { data, error } = await admin.rpc("set_org_member_role", {
            p_target_email: normalizedEmail,
            p_role: requestedRole,
            p_granted_by: requester.email,
            p_banned_by: requestedRole === "banned" ? requester.email : null,
            p_ban_reason: requestedRole === "banned" ? parsed.data.banReason?.trim() || null : null,
            p_banned_until: requestedRole === "banned" ? parsed.data.bannedUntil || null : null
          });
          if (error) {
            return Response.json({ error: error.message }, { status: 500 });
          }
          const updated = data?.[0] || null;
          const ban = updated?.role === "banned" ? await getBanRecord(normalizedEmail) : null;
          return Response.json({
            updated: updated ? {
              ...updated,
              ban
            } : null
          });
        } catch (error) {
          if (error instanceof Response) return error;
          return Response.json(
            { error: error instanceof Error ? error.message : "Unexpected server error" },
            { status: 500 }
          );
        }
      },
      PUT: async ({ request }) => {
        try {
          const access = await requirePermission(request, "manage_users");
          const admin = getAdminOrRequestClient(request);
          const body = await request.json();
          const parsed = setSubscriptionSchema.safeParse(body);
          if (!parsed.success) {
            return Response.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
          }
          if (!hasSupabaseAdminConfig()) {
            return Response.json(
              {
                error: "Supabase admin configuration missing on server.",
                details: getSupabaseAdminConfigIssues()
              },
              { status: 500 }
            );
          }
          const normalizedEmail = parsed.data.targetEmail.toLowerCase();
          const membershipPlan = parsed.data.membershipPlan.toLowerCase();
          const { data: currentMember, error: currentMemberError } = await admin.from("org_user_roles").select("role").eq("email", normalizedEmail).maybeSingle();
          if (currentMemberError) {
            return Response.json({ error: currentMemberError.message }, { status: 500 });
          }
          if (currentMember?.role && !canManageRole(access.role, currentMember.role)) {
            return Response.json({ error: "You cannot change a member at your role level or above" }, { status: 403 });
          }
          const { data: planRows, error: planError } = await admin.from("org_shop_membership_plans").select("slug, is_active");
          if (planError) {
            return Response.json({ error: planError.message }, { status: 500 });
          }
          const allowedPlans = Array.from(/* @__PURE__ */ new Set([
            "free",
            ...(planRows || []).filter((plan) => plan.is_active !== false).map((plan) => String(plan.slug || "").trim().toLowerCase()).filter(Boolean)
          ]));
          if (!allowedPlans.includes(membershipPlan)) {
            return Response.json({ error: "Invalid membership plan selected." }, { status: 400 });
          }
          const authUser = await findAuthUserByEmail(normalizedEmail);
          if (!authUser?.id) {
            return Response.json({ error: "Target auth user not found" }, { status: 404 });
          }
          const currentMeta = authUser.user_metadata ?? {};
          const nextMeta = {
            ...currentMeta,
            membership_plan: membershipPlan
          };
          if (membershipPlan === "free") {
            nextMeta.stripe_subscription_id = null;
          }
          const adminClient2 = getSupabaseAdminClient();
          const { error: updateError } = await adminClient2.auth.admin.updateUserById(authUser.id, {
            user_metadata: nextMeta
          });
          if (updateError) {
            return Response.json({ error: updateError.message }, { status: 500 });
          }
          return Response.json({
            updated: {
              email: normalizedEmail,
              membership_plan: membershipPlan,
              stripe_subscription_id: membershipPlan === "free" ? null : nextMeta.stripe_subscription_id || null
            }
          });
        } catch (error) {
          if (error instanceof Response) return error;
          return Response.json(
            { error: error instanceof Error ? error.message : "Unexpected server error" },
            { status: 500 }
          );
        }
      },
      PATCH: async ({ request }) => {
        try {
          const access = await requirePermission(request, "manage_users");
          const admin = getAdminOrRequestClient(request);
          const body = await request.json();
          const parsed = setUsernameSchema.safeParse(body);
          if (!parsed.success) {
            return Response.json(
              {
                error: "Invalid payload",
                details: parsed.error.flatten()
              },
              { status: 400 }
            );
          }
          const normalizedEmail = parsed.data.targetEmail.toLowerCase();
          const nextUsername = parsed.data.username.trim();
          const { data: currentMember, error: currentMemberError } = await admin.from("org_user_roles").select("role").eq("email", normalizedEmail).maybeSingle();
          if (currentMemberError) {
            return Response.json({ error: currentMemberError.message }, { status: 500 });
          }
          if (currentMember?.role && !canManageRole(access.role, currentMember.role)) {
            return Response.json({ error: "You cannot change a member at your role level or above" }, { status: 403 });
          }
          const { data: existingProfileUser, error: profileCheckError } = await admin.from("org_member_profiles").select("email").ilike("display_name", nextUsername).neq("email", normalizedEmail).limit(1);
          if (profileCheckError && profileCheckError.code !== "42P01") {
            return Response.json({ error: profileCheckError.message }, { status: 500 });
          }
          if (Array.isArray(existingProfileUser) && existingProfileUser.length > 0) {
            return Response.json({ error: "That username is already taken. Please choose another." }, { status: 409 });
          }
          const authUsers = await listAuthIndexedUsers(admin);
          const normalizedCandidate = nextUsername.toLowerCase();
          const takenInMetadata = authUsers.some((userRow) => {
            const rowEmail = String(userRow.email || "").toLowerCase();
            if (!rowEmail || rowEmail === normalizedEmail) return false;
            const metadata = userRow.user_metadata || null;
            const candidates = [metadata?.username, metadata?.preferred_username];
            return candidates.some((value) => String(value || "").trim().toLowerCase() === normalizedCandidate);
          });
          if (takenInMetadata) {
            return Response.json({ error: "That username is already taken. Please choose another." }, { status: 409 });
          }
          const { error: profileUpdateError } = await admin.from("org_member_profiles").upsert(
            {
              email: normalizedEmail,
              display_name: nextUsername,
              updated_at: (/* @__PURE__ */ new Date()).toISOString()
            },
            { onConflict: "email" }
          );
          if (profileUpdateError && profileUpdateError.code !== "42P01") {
            return Response.json({ error: profileUpdateError.message }, { status: 500 });
          }
          let authSyncWarning = null;
          if (hasSupabaseAdminConfig()) {
            const adminClient2 = getSupabaseAdminClient();
            const authUser = await findAuthUserByEmail(normalizedEmail);
            if (authUser?.id) {
              const currentMeta = authUser.user_metadata ?? {};
              const nextMeta = {
                ...currentMeta,
                username: nextUsername,
                preferred_username: nextUsername
              };
              const { error: updateAuthError } = await adminClient2.auth.admin.updateUserById(authUser.id, {
                user_metadata: nextMeta
              });
              if (updateAuthError) {
                authSyncWarning = `Profile username updated, but auth metadata sync failed: ${updateAuthError.message}`;
              }
            } else {
              authSyncWarning = "Profile username updated, but auth user record was not found for metadata sync.";
            }
          } else {
            authSyncWarning = "Profile username updated in local fallback mode (service-role key missing), so auth metadata sync was skipped.";
          }
          return Response.json({
            updated: {
              email: normalizedEmail,
              username: nextUsername
            },
            warning: authSyncWarning
          });
        } catch (error) {
          if (error instanceof Response) return error;
          return Response.json(
            { error: error instanceof Error ? error.message : "Unexpected server error" },
            { status: 500 }
          );
        }
      }
    }
  }
});
function getAdminOrPublicClient$2() {
  return hasSupabaseAdminConfig() ? getSupabaseAdminClient() : getSupabaseServerPublicClient();
}
const updatePermissionSchema = z.object({
  role: z.enum(ORG_ROLES),
  permissionKey: z.string().min(1),
  enabled: z.boolean()
});
const Route$4 = createFileRoute("/api/admin/permissions")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const access = await getRequesterAccess(request);
          if (!access.isSuperadmin && !access.permissions.includes("manage_permissions")) {
            return Response.json({ error: "Manage permissions permission required" }, { status: 403 });
          }
          const admin = getAdminOrPublicClient$2();
          const { data, error } = await admin.rpc("list_org_permission_matrix");
          if (error) {
            return Response.json({ error: error.message }, { status: 500 });
          }
          return Response.json({
            requester: {
              ...access.requester,
              role: access.role,
              permissions: access.permissions
            },
            matrix: data || []
          });
        } catch (error) {
          if (error instanceof Response) return error;
          return Response.json(
            { error: error instanceof Error ? error.message : "Unexpected server error" },
            { status: 500 }
          );
        }
      },
      POST: async ({ request }) => {
        try {
          const access = await requirePermission(request, "manage_permissions");
          const admin = getAdminOrPublicClient$2();
          const body = await request.json();
          const parsed = updatePermissionSchema.safeParse(body);
          if (!parsed.success) {
            return Response.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
          }
          const targetRole = parsed.data.role;
          if (!access.isSuperadmin && !canManageRole(access.role, targetRole)) {
            return Response.json({ error: "You cannot edit permissions for that role" }, { status: 403 });
          }
          const { data, error } = await admin.rpc("set_org_role_permission", {
            p_role: targetRole,
            p_permission_key: parsed.data.permissionKey,
            p_enabled: parsed.data.enabled,
            p_granted_by: access.requester.email
          });
          if (error) {
            return Response.json({ error: error.message }, { status: 500 });
          }
          return Response.json({ updated: data?.[0] || null });
        } catch (error) {
          if (error instanceof Response) return error;
          return Response.json(
            { error: error instanceof Error ? error.message : "Unexpected server error" },
            { status: 500 }
          );
        }
      }
    }
  }
});
const BUCKET = "blog-media";
const RELEASES_DIR = "app-releases/android";
const LATEST_METADATA_PATH = `${RELEASES_DIR}/latest.json`;
const ALLOWED_TYPES = /* @__PURE__ */ new Set([
  "application/vnd.android.package-archive",
  "application/octet-stream"
]);
function sanitizeFilename(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}
const Route$3 = createFileRoute("/api/admin/apk-release")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          await requirePermission(request, "access_admin_dashboard");
          if (!hasSupabaseAdminConfig()) {
            return Response.json({ error: "APK release metadata is unavailable in this environment." }, { status: 503 });
          }
          const admin = getSupabaseAdminClient();
          const { data, error } = await admin.storage.from(BUCKET).download(LATEST_METADATA_PATH);
          if (error || !data) {
            return Response.json({ release: null });
          }
          const metadata = await data.text();
          return new Response(metadata, {
            headers: { "Content-Type": "application/json" }
          });
        } catch (error) {
          if (error instanceof Response) return error;
          return Response.json(
            { error: error instanceof Error ? error.message : "Unexpected server error" },
            { status: 500 }
          );
        }
      },
      POST: async ({ request }) => {
        try {
          const access = await requirePermission(request, "access_admin_dashboard");
          const form = await request.formData();
          const file = form.get("file");
          const version = String(form.get("version") || "").trim();
          const notes = String(form.get("notes") || "").trim();
          if (!(file instanceof File)) {
            return Response.json({ error: "APK file is required." }, { status: 400 });
          }
          if (!version) {
            return Response.json({ error: "Version is required." }, { status: 400 });
          }
          if (!file.name.toLowerCase().endsWith(".apk")) {
            return Response.json({ error: "Only .apk files are supported." }, { status: 400 });
          }
          if (file.type && !ALLOWED_TYPES.has(file.type)) {
            return Response.json({ error: "Unsupported APK MIME type." }, { status: 400 });
          }
          if (!hasSupabaseAdminConfig()) {
            return Response.json({ error: "APK upload is not configured for this environment." }, { status: 503 });
          }
          const admin = getSupabaseAdminClient();
          const safeName = sanitizeFilename(file.name);
          const releasePath = `${RELEASES_DIR}/${Date.now()}-${safeName}`;
          const { error: uploadError } = await admin.storage.from(BUCKET).upload(releasePath, file, {
            contentType: file.type || "application/vnd.android.package-archive",
            upsert: false
          });
          if (uploadError) {
            return Response.json({ error: uploadError.message }, { status: 500 });
          }
          const publicUrl = admin.storage.from(BUCKET).getPublicUrl(releasePath).data.publicUrl;
          const release = {
            version,
            notes,
            uploadedAt: (/* @__PURE__ */ new Date()).toISOString(),
            uploadedBy: access.requester.email,
            fileName: file.name,
            fileSizeBytes: file.size,
            url: publicUrl
          };
          const metadataBlob = new Blob([JSON.stringify(release, null, 2)], { type: "application/json" });
          const { error: metadataError } = await admin.storage.from(BUCKET).upload(LATEST_METADATA_PATH, metadataBlob, {
            contentType: "application/json",
            upsert: true
          });
          if (metadataError) {
            return Response.json({ error: metadataError.message }, { status: 500 });
          }
          return Response.json({ release }, { status: 201 });
        } catch (error) {
          if (error instanceof Response) return error;
          return Response.json(
            { error: error instanceof Error ? error.message : "Unexpected server error" },
            { status: 500 }
          );
        }
      }
    }
  }
});
function getAdminOrPublicClient$1() {
  return hasSupabaseAdminConfig() ? getSupabaseAdminClient() : getSupabaseServerPublicClient();
}
const planBaseSchema = z.object({
  slug: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(120),
  displayPrice: z.string().trim().min(1).max(40),
  priceCents: z.number().int().min(0),
  description: z.string().trim().min(1).max(600),
  features: z.array(z.string().trim().min(1).max(200)).max(20),
  sortOrder: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true)
});
const createPlanSchema = planBaseSchema;
const updatePlanSchema = planBaseSchema.extend({
  id: z.string().uuid()
});
const deletePlanSchema = z.object({
  id: z.string().uuid()
});
const Route$2 = createFileRoute("/api/admin/shop/plans")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const access = await requirePermission(request, "access_admin_dashboard");
          const admin = getAdminOrPublicClient$1();
          const { data, error } = await admin.from("org_shop_membership_plans").select("id, slug, name, display_price, price_cents, description, features, sort_order, is_active, created_at, updated_at").order("sort_order", { ascending: true }).order("created_at", { ascending: true });
          if (error) return Response.json({ error: error.message }, { status: 500 });
          return Response.json({
            requester: {
              ...access.requester,
              role: access.role
            },
            plans: data || []
          });
        } catch (error) {
          if (error instanceof Response) return error;
          return Response.json(
            { error: error instanceof Error ? error.message : "Unexpected server error" },
            { status: 500 }
          );
        }
      },
      POST: async ({ request }) => {
        try {
          await requirePermission(request, "access_admin_dashboard");
          const admin = getAdminOrPublicClient$1();
          const body = await request.json();
          const parsed = createPlanSchema.safeParse(body);
          if (!parsed.success) {
            return Response.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
          }
          const { data, error } = await admin.from("org_shop_membership_plans").insert({
            slug: parsed.data.slug.toLowerCase(),
            name: parsed.data.name,
            display_price: parsed.data.displayPrice,
            price_cents: parsed.data.priceCents,
            description: parsed.data.description,
            features: parsed.data.features,
            sort_order: parsed.data.sortOrder,
            is_active: parsed.data.isActive
          }).select("id, slug, name, display_price, price_cents, description, features, sort_order, is_active, created_at, updated_at").single();
          if (error) return Response.json({ error: error.message }, { status: 500 });
          return Response.json({ plan: data });
        } catch (error) {
          if (error instanceof Response) return error;
          return Response.json(
            { error: error instanceof Error ? error.message : "Unexpected server error" },
            { status: 500 }
          );
        }
      },
      PUT: async ({ request }) => {
        try {
          await requirePermission(request, "access_admin_dashboard");
          const admin = getAdminOrPublicClient$1();
          const body = await request.json();
          const parsed = updatePlanSchema.safeParse(body);
          if (!parsed.success) {
            return Response.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
          }
          const { data, error } = await admin.from("org_shop_membership_plans").update({
            slug: parsed.data.slug.toLowerCase(),
            name: parsed.data.name,
            display_price: parsed.data.displayPrice,
            price_cents: parsed.data.priceCents,
            description: parsed.data.description,
            features: parsed.data.features,
            sort_order: parsed.data.sortOrder,
            is_active: parsed.data.isActive,
            updated_at: (/* @__PURE__ */ new Date()).toISOString()
          }).eq("id", parsed.data.id).select("id, slug, name, display_price, price_cents, description, features, sort_order, is_active, created_at, updated_at").single();
          if (error) return Response.json({ error: error.message }, { status: 500 });
          return Response.json({ plan: data });
        } catch (error) {
          if (error instanceof Response) return error;
          return Response.json(
            { error: error instanceof Error ? error.message : "Unexpected server error" },
            { status: 500 }
          );
        }
      },
      DELETE: async ({ request }) => {
        try {
          await requirePermission(request, "access_admin_dashboard");
          const admin = getAdminOrPublicClient$1();
          const body = await request.json();
          const parsed = deletePlanSchema.safeParse(body);
          if (!parsed.success) {
            return Response.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
          }
          const { error } = await admin.from("org_shop_membership_plans").delete().eq("id", parsed.data.id);
          if (error) return Response.json({ error: error.message }, { status: 500 });
          return Response.json({ deleted: true });
        } catch (error) {
          if (error instanceof Response) return error;
          return Response.json(
            { error: error instanceof Error ? error.message : "Unexpected server error" },
            { status: 500 }
          );
        }
      }
    }
  }
});
function getAdminOrPublicClient() {
  return hasSupabaseAdminConfig() ? getSupabaseAdminClient() : getSupabaseServerPublicClient();
}
const createMerchSchema = z.object({
  name: z.string().trim().min(1).max(120),
  price: z.string().trim().min(1).max(40),
  description: z.string().trim().min(1).max(600),
  sortOrder: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true)
});
const updateMerchSchema = createMerchSchema.extend({
  id: z.string().uuid()
});
const deleteMerchSchema = z.object({
  id: z.string().uuid()
});
const Route$1 = createFileRoute("/api/admin/shop/merch")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const access = await requirePermission(request, "access_admin_dashboard");
          const admin = getAdminOrPublicClient();
          const { data, error } = await admin.from("org_shop_merch_items").select("id, name, price, description, sort_order, is_active, created_at, updated_at").order("sort_order", { ascending: true }).order("created_at", { ascending: true });
          if (error) return Response.json({ error: error.message }, { status: 500 });
          return Response.json({
            requester: {
              ...access.requester,
              role: access.role
            },
            items: data || []
          });
        } catch (error) {
          if (error instanceof Response) return error;
          return Response.json(
            { error: error instanceof Error ? error.message : "Unexpected server error" },
            { status: 500 }
          );
        }
      },
      POST: async ({ request }) => {
        try {
          await requirePermission(request, "access_admin_dashboard");
          const admin = getAdminOrPublicClient();
          const body = await request.json();
          const parsed = createMerchSchema.safeParse(body);
          if (!parsed.success) {
            return Response.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
          }
          const { data, error } = await admin.from("org_shop_merch_items").insert({
            name: parsed.data.name,
            price: parsed.data.price,
            description: parsed.data.description,
            sort_order: parsed.data.sortOrder,
            is_active: parsed.data.isActive
          }).select("id, name, price, description, sort_order, is_active, created_at, updated_at").single();
          if (error) return Response.json({ error: error.message }, { status: 500 });
          return Response.json({ item: data });
        } catch (error) {
          if (error instanceof Response) return error;
          return Response.json(
            { error: error instanceof Error ? error.message : "Unexpected server error" },
            { status: 500 }
          );
        }
      },
      PUT: async ({ request }) => {
        try {
          await requirePermission(request, "access_admin_dashboard");
          const admin = getAdminOrPublicClient();
          const body = await request.json();
          const parsed = updateMerchSchema.safeParse(body);
          if (!parsed.success) {
            return Response.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
          }
          const { data, error } = await admin.from("org_shop_merch_items").update({
            name: parsed.data.name,
            price: parsed.data.price,
            description: parsed.data.description,
            sort_order: parsed.data.sortOrder,
            is_active: parsed.data.isActive,
            updated_at: (/* @__PURE__ */ new Date()).toISOString()
          }).eq("id", parsed.data.id).select("id, name, price, description, sort_order, is_active, created_at, updated_at").single();
          if (error) return Response.json({ error: error.message }, { status: 500 });
          return Response.json({ item: data });
        } catch (error) {
          if (error instanceof Response) return error;
          return Response.json(
            { error: error instanceof Error ? error.message : "Unexpected server error" },
            { status: 500 }
          );
        }
      },
      DELETE: async ({ request }) => {
        try {
          await requirePermission(request, "access_admin_dashboard");
          const admin = getAdminOrPublicClient();
          const body = await request.json();
          const parsed = deleteMerchSchema.safeParse(body);
          if (!parsed.success) {
            return Response.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
          }
          const { error } = await admin.from("org_shop_merch_items").delete().eq("id", parsed.data.id);
          if (error) return Response.json({ error: error.message }, { status: 500 });
          return Response.json({ deleted: true });
        } catch (error) {
          if (error instanceof Response) return error;
          return Response.json(
            { error: error instanceof Error ? error.message : "Unexpected server error" },
            { status: 500 }
          );
        }
      }
    }
  }
});
function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function decode(s) {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16))).trim();
}
function stripHtml(s) {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
function extractMeta(html, property) {
  const escaped = escapeRegex(property);
  const re1 = new RegExp(
    `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["']`,
    "i"
  );
  const m1 = html.match(re1);
  if (m1) return decode(m1[1]);
  const re2 = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["']`,
    "i"
  );
  const m2 = html.match(re2);
  return m2 ? decode(m2[1]) : null;
}
function extractTitle(html) {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return m ? decode(m[1]) : null;
}
function extractJsonLd(html) {
  const results = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(m[1]);
      if (Array.isArray(parsed)) results.push(...parsed);
      else results.push(parsed);
    } catch {
    }
  }
  return results;
}
function findProductNode(nodes) {
  for (const node of nodes) {
    if (!node || typeof node !== "object") continue;
    const obj = node;
    if (Array.isArray(obj["@graph"])) {
      const found = findProductNode(obj["@graph"]);
      if (found) return found;
    }
    const type = obj["@type"];
    const types = Array.isArray(type) ? type : [type];
    if (types.some((t) => typeof t === "string" && t.toLowerCase() === "product")) return obj;
  }
  return null;
}
function getStr(obj, key) {
  const v = obj[key];
  if (typeof v === "string") return v.trim() || null;
  if (Array.isArray(v) && typeof v[0] === "string") return v[0].trim() || null;
  return null;
}
function formatPrice(amount, currency) {
  const symbol = currency === "USD" ? "$" : currency === "GBP" ? "£" : currency === "EUR" ? "€" : `${currency} `;
  return `${symbol}${amount.toFixed(2)}`;
}
function parseProductFromJsonLd(product) {
  const out = { signals: [] };
  const name = getStr(product, "name");
  if (name) {
    out.name = name;
    out.signals.push("JSON-LD name");
  }
  const description = getStr(product, "description");
  if (description) {
    out.description = stripHtml(description).slice(0, 600);
    out.signals.push("JSON-LD description");
  }
  const brand = product["brand"];
  if (brand && typeof brand === "object") {
    const bn = getStr(brand, "name");
    if (bn) {
      out.brand = bn;
      out.signals.push("JSON-LD brand");
    }
  } else if (typeof brand === "string" && brand) {
    out.brand = brand;
  }
  const sku = getStr(product, "sku") || getStr(product, "mpn");
  if (sku) {
    out.sku = sku;
    out.signals.push("JSON-LD sku");
  }
  const imageRaw = product["image"];
  const imgs = [];
  if (typeof imageRaw === "string") {
    imgs.push(imageRaw);
  } else if (Array.isArray(imageRaw)) {
    for (const img of imageRaw) {
      if (typeof img === "string") imgs.push(img);
      else if (img && typeof img === "object") {
        const u = getStr(img, "url") || getStr(img, "contentUrl");
        if (u) imgs.push(u);
      }
    }
  } else if (imageRaw && typeof imageRaw === "object") {
    const u = getStr(imageRaw, "url") || getStr(imageRaw, "contentUrl");
    if (u) imgs.push(u);
  }
  if (imgs.length > 0) {
    out.images = imgs;
    out.imageUrl = imgs[0];
    out.signals.push("JSON-LD image");
  }
  const offersRaw = product["offers"];
  const offers = [];
  if (Array.isArray(offersRaw)) {
    for (const o of offersRaw) {
      if (o && typeof o === "object") offers.push(o);
    }
  } else if (offersRaw && typeof offersRaw === "object") {
    offers.push(offersRaw);
  }
  if (offers.length > 0) {
    const offer = offers[0];
    const priceVal = offer["price"] ?? offer["lowPrice"];
    const currency = getStr(offer, "priceCurrency") || "USD";
    const avail = getStr(offer, "availability");
    if (avail) out.availability = avail.replace("https://schema.org/", "").replace("http://schema.org/", "");
    out.currency = currency;
    if (priceVal !== null && priceVal !== void 0) {
      const num = parseFloat(String(priceVal));
      if (!isNaN(num)) {
        out.price = formatPrice(num, currency);
        out.signals.push("JSON-LD price");
      }
    }
  }
  const aggRating = product["aggregateRating"];
  if (aggRating && typeof aggRating === "object") {
    const r = aggRating;
    const rv = r["ratingValue"] ?? r["bestRating"];
    const rc = r["reviewCount"] ?? r["ratingCount"];
    if (rv !== void 0) out.rating = parseFloat(String(rv));
    if (rc !== void 0) out.reviewCount = parseInt(String(rc), 10);
  }
  return out;
}
function parseFromOpenGraph(html) {
  const out = { signals: [] };
  const title = extractMeta(html, "og:title") || extractMeta(html, "twitter:title");
  if (title) {
    out.name = title;
    out.signals.push("OG title");
  }
  const description = extractMeta(html, "og:description") || extractMeta(html, "twitter:description");
  if (description) {
    out.description = description.slice(0, 600);
    out.signals.push("OG description");
  }
  const image = extractMeta(html, "og:image") || extractMeta(html, "twitter:image");
  if (image) {
    out.imageUrl = image;
    out.images = [image];
    out.signals.push("OG image");
  }
  const priceAmount = extractMeta(html, "og:price:amount") || extractMeta(html, "product:price:amount") || extractMeta(html, "twitter:data1");
  const priceCurrency = extractMeta(html, "og:price:currency") || extractMeta(html, "product:price:currency") || "USD";
  if (priceAmount) {
    const num = parseFloat(priceAmount.replace(/[^0-9.]/g, ""));
    if (!isNaN(num)) {
      out.price = formatPrice(num, priceCurrency);
      out.currency = priceCurrency;
      out.signals.push("OG price");
    }
  }
  return out;
}
function parseFallback(html) {
  const out = { signals: [] };
  const title = extractTitle(html);
  if (title) {
    out.name = title;
    out.signals.push("page title");
  }
  const description = extractMeta(html, "description");
  if (description) {
    out.description = description.slice(0, 600);
    out.signals.push("meta description");
  }
  return out;
}
function scrapeProductFromHtml(html, sourceUrl) {
  const jsonLdNodes = extractJsonLd(html);
  const productNode = findProductNode(jsonLdNodes);
  const jsonLd = productNode ? parseProductFromJsonLd(productNode) : { signals: [] };
  const og = parseFromOpenGraph(html);
  const fallback = parseFallback(html);
  const allSignals = [...jsonLd.signals, ...og.signals, ...fallback.signals];
  return {
    name: jsonLd.name || og.name || fallback.name || "",
    price: jsonLd.price || og.price || "",
    description: jsonLd.description || og.description || fallback.description || "",
    imageUrl: jsonLd.imageUrl || og.imageUrl || null,
    images: jsonLd.images || og.images || [],
    sourceUrl,
    brand: jsonLd.brand || null,
    availability: jsonLd.availability || null,
    currency: jsonLd.currency || og.currency || "USD",
    rating: jsonLd.rating ?? null,
    reviewCount: jsonLd.reviewCount ?? null,
    sku: jsonLd.sku || null,
    signals: allSignals,
    confidence: jsonLd.signals.length >= 3 ? "high" : og.signals.length >= 2 || jsonLd.signals.length >= 1 ? "medium" : "low"
  };
}
const PRIVATE_HOST_PATTERNS = [
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1"
];
function isPrivateHost(hostname) {
  const h = hostname.toLowerCase();
  return PRIVATE_HOST_PATTERNS.includes(h) || h.startsWith("192.168.") || h.startsWith("10.") || h.startsWith("172.16.") || h.endsWith(".local") || h.endsWith(".internal");
}
const Route = createFileRoute("/api/admin/shop/import-url")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          await requirePermission(request, "access_admin_dashboard");
          const body = await request.json();
          const rawUrl = String(body.url ?? "").trim();
          if (!rawUrl) {
            return Response.json({ error: "url is required" }, { status: 400 });
          }
          let parsed;
          try {
            parsed = new URL(rawUrl);
          } catch {
            return Response.json({ error: "Invalid URL format." }, { status: 400 });
          }
          if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
            return Response.json({ error: "Only http and https URLs are supported." }, { status: 400 });
          }
          if (isPrivateHost(parsed.hostname) && true) {
            return Response.json({ error: "Private/internal URLs are not allowed." }, { status: 400 });
          }
          let html;
          try {
            const controller = new AbortController();
            const timeout = setTimeout(() => {
              controller.abort();
            }, 15e3);
            const res = await fetch(rawUrl, {
              signal: controller.signal,
              headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9",
                "Cache-Control": "no-cache"
              }
            });
            clearTimeout(timeout);
            if (!res.ok) {
              return Response.json(
                { error: `Page returned HTTP ${res.status}. The site may block automated requests.` },
                { status: 422 }
              );
            }
            const contentType = res.headers.get("content-type") ?? "";
            if (!contentType.includes("html")) {
              return Response.json({ error: "URL does not point to an HTML page." }, { status: 422 });
            }
            const buffer = await res.arrayBuffer();
            html = new TextDecoder("utf-8", { fatal: false }).decode(
              buffer.byteLength > 2e6 ? buffer.slice(0, 2e6) : buffer
            );
          } catch (err) {
            if (err.name === "AbortError") {
              return Response.json(
                { error: "Request timed out after 15s. The site took too long to respond." },
                { status: 422 }
              );
            }
            return Response.json(
              { error: `Could not fetch page: ${err.message}` },
              { status: 422 }
            );
          }
          const product = scrapeProductFromHtml(html, rawUrl);
          if (!product.name) {
            return Response.json(
              { error: "Could not extract product information from this page. Try a direct product listing URL." },
              { status: 422 }
            );
          }
          return Response.json({ product });
        } catch (err) {
          if (err instanceof Response) return err;
          return Response.json(
            { error: err instanceof Error ? err.message : "Unexpected server error" },
            { status: 500 }
          );
        }
      }
    }
  }
});
const TermsRoute = Route$S.update({
  id: "/terms",
  path: "/terms",
  getParentRoute: () => Route$T
});
const SignupRoute = Route$R.update({
  id: "/signup",
  path: "/signup",
  getParentRoute: () => Route$T
});
const SettingsRoute = Route$Q.update({
  id: "/settings",
  path: "/settings",
  getParentRoute: () => Route$T
});
const PrivacyRoute = Route$P.update({
  id: "/privacy",
  path: "/privacy",
  getParentRoute: () => Route$T
});
const OnboardingRoute = Route$O.update({
  id: "/onboarding",
  path: "/onboarding",
  getParentRoute: () => Route$T
});
const NewsRoute = Route$N.update({
  id: "/news",
  path: "/news",
  getParentRoute: () => Route$T
});
const MerchStudioRoute = Route$M.update({
  id: "/merch-studio",
  path: "/merch-studio",
  getParentRoute: () => Route$T
});
const MerchRoute = Route$L.update({
  id: "/merch",
  path: "/merch",
  getParentRoute: () => Route$T
});
const LoginRoute = Route$K.update({
  id: "/login",
  path: "/login",
  getParentRoute: () => Route$T
});
const LiveRoute = Route$J.update({
  id: "/live",
  path: "/live",
  getParentRoute: () => Route$T
});
const FaqRoute = Route$I.update({
  id: "/faq",
  path: "/faq",
  getParentRoute: () => Route$T
});
const DownloadRoute = Route$H.update({
  id: "/download",
  path: "/download",
  getParentRoute: () => Route$T
});
const DirectoryRoute = Route$G.update({
  id: "/directory",
  path: "/directory",
  getParentRoute: () => Route$T
});
const DashboardRoute = Route$F.update({
  id: "/dashboard",
  path: "/dashboard",
  getParentRoute: () => Route$T
});
const AppealsRoute = Route$E.update({
  id: "/appeals",
  path: "/appeals",
  getParentRoute: () => Route$T
});
const AdminRoute = Route$D.update({
  id: "/admin",
  path: "/admin",
  getParentRoute: () => Route$T
});
const UsernameRoute = Route$C.update({
  id: "/$username",
  path: "/$username",
  getParentRoute: () => Route$T
});
const IndexRoute = Route$B.update({
  id: "/",
  path: "/",
  getParentRoute: () => Route$T
});
const AuthCallbackRoute = Route$A.update({
  id: "/auth/callback",
  path: "/auth/callback",
  getParentRoute: () => Route$T
});
const ApiStripeWebhookRoute = Route$z.update({
  id: "/api/stripe-webhook",
  path: "/api/stripe-webhook",
  getParentRoute: () => Route$T
});
const ApiShopRoute = Route$y.update({
  id: "/api/shop",
  path: "/api/shop",
  getParentRoute: () => Route$T
});
const ApiPublicProfileRoute = Route$x.update({
  id: "/api/public-profile",
  path: "/api/public-profile",
  getParentRoute: () => Route$T
});
const ApiPublicDirectoryRoute = Route$w.update({
  id: "/api/public-directory",
  path: "/api/public-directory",
  getParentRoute: () => Route$T
});
const ApiPublicApkRoute = Route$v.update({
  id: "/api/public-apk",
  path: "/api/public-apk",
  getParentRoute: () => Route$T
});
const ApiProfilePhotoUploadRoute = Route$u.update({
  id: "/api/profile-photo-upload",
  path: "/api/profile-photo-upload",
  getParentRoute: () => Route$T
});
const ApiProfileRoute = Route$t.update({
  id: "/api/profile",
  path: "/api/profile",
  getParentRoute: () => Route$T
});
const ApiNewsUploadRoute = Route$s.update({
  id: "/api/news-upload",
  path: "/api/news-upload",
  getParentRoute: () => Route$T
});
const ApiNewsRoute = Route$r.update({
  id: "/api/news",
  path: "/api/news",
  getParentRoute: () => Route$T
});
const ApiMarketingProofRoute = Route$q.update({
  id: "/api/marketing-proof",
  path: "/api/marketing-proof",
  getParentRoute: () => Route$T
});
const ApiKnowledgeVaultRoute = Route$p.update({
  id: "/api/knowledge-vault",
  path: "/api/knowledge-vault",
  getParentRoute: () => Route$T
});
const ApiKickLoginRoute = Route$o.update({
  id: "/api/kick-login",
  path: "/api/kick-login",
  getParentRoute: () => Route$T
});
const ApiKickCallbackRoute = Route$n.update({
  id: "/api/kick-callback",
  path: "/api/kick-callback",
  getParentRoute: () => Route$T
});
const ApiCreatePaymentIntentRoute = Route$m.update({
  id: "/api/create-payment-intent",
  path: "/api/create-payment-intent",
  getParentRoute: () => Route$T
});
const ApiCollabRoute = Route$l.update({
  id: "/api/collab",
  path: "/api/collab",
  getParentRoute: () => Route$T
});
const ApiCheckUsernameRoute = Route$k.update({
  id: "/api/check-username",
  path: "/api/check-username",
  getParentRoute: () => Route$T
});
const AdminUsersRoute = Route$j.update({
  id: "/users",
  path: "/users",
  getParentRoute: () => AdminRoute
});
const AdminShopRoute = Route$i.update({
  id: "/shop",
  path: "/shop",
  getParentRoute: () => AdminRoute
});
const AdminApkRoute = Route$h.update({
  id: "/apk",
  path: "/apk",
  getParentRoute: () => AdminRoute
});
const DashboardToolsToolRoute = Route$g.update({
  id: "/tools/$tool",
  path: "/tools/$tool",
  getParentRoute: () => DashboardRoute
});
const ApiToolsToolRoute = Route$f.update({
  id: "/api/tools/$tool",
  path: "/api/tools/$tool",
  getParentRoute: () => Route$T
});
const ApiMerchStudioUploadRoute = Route$e.update({
  id: "/api/merch-studio/upload",
  path: "/api/merch-studio/upload",
  getParentRoute: () => Route$T
});
const ApiMerchStudioSubmissionsRoute = Route$d.update({
  id: "/api/merch-studio/submissions",
  path: "/api/merch-studio/submissions",
  getParentRoute: () => Route$T
});
const ApiMerchStudioEarningsRoute = Route$c.update({
  id: "/api/merch-studio/earnings",
  path: "/api/merch-studio/earnings",
  getParentRoute: () => Route$T
});
const ApiMeProfileRoute = Route$b.update({
  id: "/api/me/profile",
  path: "/api/me/profile",
  getParentRoute: () => Route$T
});
const ApiMeAccessRoute = Route$a.update({
  id: "/api/me/access",
  path: "/api/me/access",
  getParentRoute: () => Route$T
});
const ApiLiveStreamsRoute = Route$9.update({
  id: "/api/live/streams",
  path: "/api/live/streams",
  getParentRoute: () => Route$T
});
const ApiLiveClipsRoute = Route$8.update({
  id: "/api/live/clips",
  path: "/api/live/clips",
  getParentRoute: () => Route$T
});
const ApiCollabApplyRoute = Route$7.update({
  id: "/apply",
  path: "/apply",
  getParentRoute: () => ApiCollabRoute
});
const ApiCollabApplicantsRoute = Route$6.update({
  id: "/applicants",
  path: "/applicants",
  getParentRoute: () => ApiCollabRoute
});
const ApiAdminRolesRoute = Route$5.update({
  id: "/api/admin/roles",
  path: "/api/admin/roles",
  getParentRoute: () => Route$T
});
const ApiAdminPermissionsRoute = Route$4.update({
  id: "/api/admin/permissions",
  path: "/api/admin/permissions",
  getParentRoute: () => Route$T
});
const ApiAdminApkReleaseRoute = Route$3.update({
  id: "/api/admin/apk-release",
  path: "/api/admin/apk-release",
  getParentRoute: () => Route$T
});
const ApiAdminShopPlansRoute = Route$2.update({
  id: "/api/admin/shop/plans",
  path: "/api/admin/shop/plans",
  getParentRoute: () => Route$T
});
const ApiAdminShopMerchRoute = Route$1.update({
  id: "/api/admin/shop/merch",
  path: "/api/admin/shop/merch",
  getParentRoute: () => Route$T
});
const ApiAdminShopImportUrlRoute = Route.update({
  id: "/api/admin/shop/import-url",
  path: "/api/admin/shop/import-url",
  getParentRoute: () => Route$T
});
const AdminRouteChildren = {
  AdminApkRoute,
  AdminShopRoute,
  AdminUsersRoute
};
const AdminRouteWithChildren = AdminRoute._addFileChildren(AdminRouteChildren);
const DashboardRouteChildren = {
  DashboardToolsToolRoute
};
const DashboardRouteWithChildren = DashboardRoute._addFileChildren(
  DashboardRouteChildren
);
const ApiCollabRouteChildren = {
  ApiCollabApplicantsRoute,
  ApiCollabApplyRoute
};
const ApiCollabRouteWithChildren = ApiCollabRoute._addFileChildren(
  ApiCollabRouteChildren
);
const rootRouteChildren = {
  IndexRoute,
  UsernameRoute,
  AdminRoute: AdminRouteWithChildren,
  AppealsRoute,
  DashboardRoute: DashboardRouteWithChildren,
  DirectoryRoute,
  DownloadRoute,
  FaqRoute,
  LiveRoute,
  LoginRoute,
  MerchRoute,
  MerchStudioRoute,
  NewsRoute,
  OnboardingRoute,
  PrivacyRoute,
  SettingsRoute,
  SignupRoute,
  TermsRoute,
  ApiCheckUsernameRoute,
  ApiCollabRoute: ApiCollabRouteWithChildren,
  ApiCreatePaymentIntentRoute,
  ApiKickCallbackRoute,
  ApiKickLoginRoute,
  ApiKnowledgeVaultRoute,
  ApiMarketingProofRoute,
  ApiNewsRoute,
  ApiNewsUploadRoute,
  ApiProfileRoute,
  ApiProfilePhotoUploadRoute,
  ApiPublicApkRoute,
  ApiPublicDirectoryRoute,
  ApiPublicProfileRoute,
  ApiShopRoute,
  ApiStripeWebhookRoute,
  AuthCallbackRoute,
  ApiAdminApkReleaseRoute,
  ApiAdminPermissionsRoute,
  ApiAdminRolesRoute,
  ApiLiveClipsRoute,
  ApiLiveStreamsRoute,
  ApiMeAccessRoute,
  ApiMeProfileRoute,
  ApiMerchStudioEarningsRoute,
  ApiMerchStudioSubmissionsRoute,
  ApiMerchStudioUploadRoute,
  ApiToolsToolRoute,
  ApiAdminShopImportUrlRoute,
  ApiAdminShopMerchRoute,
  ApiAdminShopPlansRoute
};
const routeTree = Route$T._addFileChildren(rootRouteChildren)._addFileTypes();
const getRouter = () => {
  const router2 = createRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreloadStaleTime: 0
  });
  return router2;
};
const router = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  getRouter
}, Symbol.toStringTag, { value: "Module" }));
export {
  KICK_OAUTH_QUERY_PARAMS as K,
  LEGAL_POLICY_LAST_UPDATED as L,
  MerchStudioPage as M,
  ORG_ROLES as O,
  Route$C as R,
  LEGAL_POLICY_VERSION as a,
  LEGAL_POLICY_CHANGELOG as b,
  authedFetch as c,
  getClientAuthRedirectUrl as d,
  getIdentityLinkUrl as e,
  KICK_OAUTH_SCOPES as f,
  getSupabaseBrowserClient as g,
  formatRoleLabel as h,
  canManageRole as i,
  ORG_ROLE_LABELS as j,
  Route$g as k,
  router as l,
  readPolicyAcceptance as r,
  setStoredViewAsRole as s,
  toolSchema$1 as t,
  writePolicyAcceptance as w
};
