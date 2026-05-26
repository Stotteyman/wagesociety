import { jsx, jsxs } from "react/jsx-runtime";
import { useNavigate, Link } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import { g as getSupabaseBrowserClient } from "./router-CSiXPOJe.js";
import "@supabase/supabase-js";
import "lucide-react";
import "stripe";
import "node:fs/promises";
import "node:path";
import "zod";
import "node:crypto";
function getPostAuthPath(metadata) {
  return metadata?.onboarding_completed === true ? "/dashboard" : "/onboarding";
}
function AuthCallbackPage() {
  const navigate = useNavigate();
  const [state, setState] = useState({
    status: "processing",
    message: "Completing secure sign-in..."
  });
  const callbackParams = useMemo(() => {
    if (typeof window === "undefined") return {
      code: null,
      hash: ""
    };
    const params = new URLSearchParams(window.location.search);
    return {
      code: params.get("code"),
      hash: window.location.hash.slice(1)
    };
  }, []);
  useEffect(() => {
    if (typeof window === "undefined") return;
    let active = true;
    void (async () => {
      try {
        const supabase = getSupabaseBrowserClient();
        const hashParams = new URLSearchParams(callbackParams.hash);
        const accessToken = hashParams.get("access_token");
        const refreshToken = hashParams.get("refresh_token");
        if (accessToken && refreshToken) {
          const {
            error
          } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken
          });
          if (error) throw error;
        } else if (callbackParams.code) {
          const {
            error
          } = await supabase.auth.exchangeCodeForSession(callbackParams.code);
          if (error) throw error;
        }
        const {
          data,
          error: userError
        } = await supabase.auth.getUser();
        if (userError) throw userError;
        if (!data.user) {
          throw new Error("Sign-in did not complete. Please try again.");
        }
        const target = getPostAuthPath(data.user.user_metadata);
        if (!active) return;
        void navigate({
          to: target,
          replace: true
        });
      } catch (error) {
        if (!active) return;
        setState({
          status: "error",
          message: error instanceof Error ? error.message : "Could not complete Google sign-in."
        });
      }
    })();
    return () => {
      active = false;
    };
  }, [callbackParams.code, callbackParams.hash, navigate]);
  return /* @__PURE__ */ jsx("main", { className: "min-h-screen px-4 py-24 text-zinc-100", children: /* @__PURE__ */ jsxs("section", { className: "mx-auto max-w-xl rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-8 text-center", children: [
    /* @__PURE__ */ jsx("p", { className: "text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400", children: "Authentication" }),
    /* @__PURE__ */ jsx("h1", { className: "mt-4 text-2xl font-bold text-zinc-50", children: state.status === "processing" ? "Signing you in..." : "Sign-in issue" }),
    /* @__PURE__ */ jsx("p", { className: "mt-3 text-sm text-zinc-300", children: state.message }),
    state.status === "error" ? /* @__PURE__ */ jsx("div", { className: "mt-6 flex items-center justify-center gap-3", children: /* @__PURE__ */ jsx(Link, { to: "/login", className: "rounded-lg border border-zinc-300/35 px-4 py-2 text-sm font-semibold text-zinc-100 transition hover:border-zinc-100", children: "Return to login" }) }) : null
  ] }) });
}
export {
  AuthCallbackPage as component
};
