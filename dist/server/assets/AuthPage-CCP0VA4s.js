import { jsx, jsxs, Fragment } from "react/jsx-runtime";
import { useNavigate, Link } from "@tanstack/react-router";
import { ArrowLeft, BadgeCheck } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { g as getSupabaseBrowserClient, K as KICK_OAUTH_QUERY_PARAMS, f as KICK_OAUTH_SCOPES, d as getClientAuthRedirectUrl } from "./router-CSiXPOJe.js";
function isNativeApp() {
  try {
    return typeof window !== "undefined" && typeof window.Capacitor !== "undefined" && window.Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}
const NATIVE_OAUTH_REDIRECT = "com.wagesociety.android://login-callback";
function getPostAuthPath(metadata) {
  return metadata?.onboarding_completed === true ? "/dashboard" : "/onboarding";
}
function AuthPage({ view }) {
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [notice, setNotice] = useState("");
  const [usernameStatus, setUsernameStatus] = useState("idle");
  const [usernameMessage, setUsernameMessage] = useState("");
  const usernameDebounceRef = useRef(null);
  const [busyAction, setBusyAction] = useState(null);
  const isSignup = view === "signup";
  useEffect(() => {
    void (async () => {
      try {
        const supabase = getSupabaseBrowserClient();
        const { data } = await supabase.auth.getSession();
        if (data.session?.user) {
          const userMeta = data.session.user.user_metadata || void 0;
          void navigate({ to: getPostAuthPath(userMeta) });
        }
      } catch {
      }
    })();
  }, [navigate, view]);
  const startOAuthSignIn = async (provider) => {
    const supabase = getSupabaseBrowserClient();
    const isKickProvider = provider === "kick" || provider === "custom:kick";
    const kickOAuthOptions = isKickProvider ? {
      scopes: KICK_OAUTH_SCOPES,
      queryParams: KICK_OAUTH_QUERY_PARAMS
    } : {};
    if (isNativeApp()) {
      const { data: data2, error: authError2 } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: NATIVE_OAUTH_REDIRECT,
          skipBrowserRedirect: true,
          ...kickOAuthOptions
        }
      });
      if (authError2) throw authError2;
      if (data2?.url) {
        const { Browser } = await import("@capacitor/browser");
        await Browser.open({ url: data2.url });
      }
      return;
    }
    const { data, error: authError } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: getClientAuthRedirectUrl("/auth/callback"),
        skipBrowserRedirect: true,
        ...kickOAuthOptions
      }
    });
    if (authError) throw authError;
    if (!data?.url) {
      throw new Error(`Could not start OAuth flow for ${provider}.`);
    }
    window.location.assign(data.url);
  };
  const handleOAuth = async (provider) => {
    try {
      setError("");
      const supabase = getSupabaseBrowserClient();
      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData.session?.user) {
        const userMeta = sessionData.session.user.user_metadata || void 0;
        void navigate({ to: getPostAuthPath(userMeta) });
        return;
      }
      setBusyAction("login");
      if (provider === "kick") {
        try {
          await startOAuthSignIn("custom:kick");
        } catch {
          await startOAuthSignIn("kick");
        }
      } else {
        await startOAuthSignIn(provider);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : `Could not sign in with ${provider}.`);
      setBusyAction(null);
    }
  };
  const checkUsername = (value) => {
    if (usernameDebounceRef.current) clearTimeout(usernameDebounceRef.current);
    const trimmed = value.trim();
    if (!trimmed) {
      setUsernameStatus("idle");
      setUsernameMessage("");
      return;
    }
    const valid = /^[a-zA-Z0-9_-]{3,20}$/.test(trimmed);
    if (!valid) {
      setUsernameStatus("invalid");
      setUsernameMessage("3–20 characters. Letters, numbers, underscores, hyphens only.");
      return;
    }
    setUsernameStatus("checking");
    setUsernameMessage("");
    usernameDebounceRef.current = setTimeout(() => {
      void (async () => {
        try {
          const response = await fetch(`/api/check-username?username=${encodeURIComponent(trimmed)}`);
          if (!response.ok) {
            setUsernameStatus("idle");
            setUsernameMessage("Could not verify availability right now.");
            return;
          }
          const data = await response.json();
          if (data.available === true) {
            setUsernameStatus("available");
            setUsernameMessage("Username is available!");
          } else {
            setUsernameStatus("taken");
            setUsernameMessage(data.reason || "Username is already taken.");
          }
        } catch {
          setUsernameStatus("idle");
          setUsernameMessage("");
        }
      })();
    }, 500);
  };
  const handleSignup = async () => {
    try {
      setError("");
      setNotice("");
      if (!name.trim()) {
        setError("Please enter a username.");
        return;
      }
      if (usernameStatus === "invalid") {
        setError("Username format is invalid. Use 3–20 letters, numbers, underscores, or hyphens.");
        return;
      }
      if (usernameStatus === "taken") {
        setError("That username is already taken. Please choose another.");
        return;
      }
      if (usernameStatus !== "available") {
        const checkResponse = await fetch(`/api/check-username?username=${encodeURIComponent(name.trim())}`);
        if (!checkResponse.ok) {
          setUsernameStatus("idle");
        } else {
          const checkData = await checkResponse.json();
          if (!checkData.available) {
            setError(checkData.reason || "That username is already taken. Please choose another.");
            return;
          }
        }
      }
      setBusyAction("signup");
      const supabase = getSupabaseBrowserClient();
      const { data, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            username: name.trim(),
            preferred_username: name.trim(),
            membership_plan: "free",
            onboarding_completed: false
          }
        }
      });
      if (authError) throw authError;
      if (data.session?.user) {
        await navigate({ to: "/onboarding" });
      } else {
        setNotice("Account created. Check your email to confirm, then sign in to continue onboarding.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create account. Please try again.");
    } finally {
      setBusyAction(null);
    }
  };
  return /* @__PURE__ */ jsx("div", { className: "min-h-screen px-4 py-12 text-zinc-100", children: /* @__PURE__ */ jsxs("div", { className: "mx-auto max-w-6xl", children: [
    /* @__PURE__ */ jsxs("div", { className: "mb-8 flex flex-wrap items-center justify-between gap-4", children: [
      /* @__PURE__ */ jsx("h1", { className: "text-3xl font-black text-zinc-50 md:text-4xl", children: isSignup ? "Create Your Membership" : "Member Login" }),
      /* @__PURE__ */ jsxs(
        Link,
        {
          to: "/",
          className: "inline-flex items-center gap-2 rounded-lg border border-zinc-300/35 px-4 py-2 text-sm font-semibold text-zinc-100 transition hover:border-zinc-100",
          children: [
            /* @__PURE__ */ jsx(ArrowLeft, { size: 16 }),
            " Back Home"
          ]
        }
      )
    ] }),
    /* @__PURE__ */ jsxs("div", { className: `grid gap-8 ${isSignup ? "lg:grid-cols-[1.25fr_0.75fr]" : ""}`, children: [
      isSignup ? /* @__PURE__ */ jsxs("section", { className: "rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-6 md:p-8", children: [
        /* @__PURE__ */ jsx("p", { className: "text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400", children: "How Signup Works" }),
        /* @__PURE__ */ jsx("h2", { className: "mt-3 text-3xl font-bold text-zinc-50", children: "Every new account starts on FREE" }),
        /* @__PURE__ */ jsxs("div", { className: "mt-6 space-y-3 rounded-2xl border border-zinc-200/15 bg-zinc-950/40 p-5 text-sm text-zinc-300", children: [
          /* @__PURE__ */ jsxs("p", { className: "flex items-start gap-2", children: [
            /* @__PURE__ */ jsx(BadgeCheck, { size: 14, className: "mt-0.5 text-orange-200" }),
            " Create your account or connect OAuth."
          ] }),
          /* @__PURE__ */ jsxs("p", { className: "flex items-start gap-2", children: [
            /* @__PURE__ */ jsx(BadgeCheck, { size: 14, className: "mt-0.5 text-orange-200" }),
            " Get instant FREE access by default."
          ] }),
          /* @__PURE__ */ jsxs("p", { className: "flex items-start gap-2", children: [
            /* @__PURE__ */ jsx(BadgeCheck, { size: 14, className: "mt-0.5 text-orange-200" }),
            " Complete onboarding: username + profile setup."
          ] }),
          /* @__PURE__ */ jsxs("p", { className: "flex items-start gap-2", children: [
            /* @__PURE__ */ jsx(BadgeCheck, { size: 14, className: "mt-0.5 text-orange-200" }),
            " Choose to upgrade during onboarding if you want paid access."
          ] })
        ] })
      ] }) : null,
      /* @__PURE__ */ jsxs("section", { className: "rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-6 md:p-8", children: [
        isSignup ? /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx("p", { className: "text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400", children: "New Account" }),
          /* @__PURE__ */ jsx("h2", { className: "mt-3 text-2xl font-bold text-zinc-50", children: "Create your organization profile" })
        ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx("p", { className: "text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400", children: "Already a member?" }),
          /* @__PURE__ */ jsx("h2", { className: "mt-3 text-2xl font-bold text-zinc-50", children: "Sign in to your dashboard" })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "mt-6 space-y-4", children: [
          isSignup ? /* @__PURE__ */ jsxs("label", { className: "block", children: [
            /* @__PURE__ */ jsx("span", { className: "mb-2 block text-sm font-medium text-zinc-200", children: "Username" }),
            /* @__PURE__ */ jsx(
              "input",
              {
                type: "text",
                value: name,
                onChange: (event) => {
                  setName(event.target.value);
                  checkUsername(event.target.value);
                },
                className: `w-full rounded-lg border bg-zinc-950/60 px-3 py-2 text-zinc-100 outline-none transition ${usernameStatus === "available" ? "border-emerald-400/60 focus:border-emerald-300" : usernameStatus === "taken" || usernameStatus === "invalid" ? "border-rose-400/60 focus:border-rose-300" : "border-zinc-200/20 focus:border-orange-200/70"}`,
                placeholder: "your_username",
                maxLength: 20,
                autoComplete: "username"
              }
            ),
            usernameMessage ? /* @__PURE__ */ jsx("p", { className: `mt-1 text-xs ${usernameStatus === "available" ? "text-emerald-300" : "text-rose-300"}`, children: usernameStatus === "checking" ? "Checking availability..." : usernameMessage }) : usernameStatus === "checking" ? /* @__PURE__ */ jsx("p", { className: "mt-1 text-xs text-zinc-400", children: "Checking availability..." }) : null
          ] }) : null,
          isSignup ? /* @__PURE__ */ jsxs("label", { className: "block", children: [
            /* @__PURE__ */ jsx("span", { className: "mb-2 block text-sm font-medium text-zinc-200", children: "Email Address" }),
            /* @__PURE__ */ jsx(
              "input",
              {
                type: "text",
                value: email,
                onChange: (event) => setEmail(event.target.value),
                className: "w-full rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-zinc-100 outline-none transition focus:border-orange-200/70",
                placeholder: "you@email.com"
              }
            )
          ] }) : null,
          isSignup ? /* @__PURE__ */ jsxs("label", { className: "block", children: [
            /* @__PURE__ */ jsx("span", { className: "mb-2 block text-sm font-medium text-zinc-200", children: "Password" }),
            /* @__PURE__ */ jsx(
              "input",
              {
                type: "password",
                value: password,
                onChange: (event) => setPassword(event.target.value),
                className: "w-full rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-zinc-100 outline-none transition focus:border-orange-200/70",
                placeholder: "********"
              }
            )
          ] }) : null
        ] }),
        error ? /* @__PURE__ */ jsx("p", { className: "mt-4 rounded-lg border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200", children: error }) : null,
        notice ? /* @__PURE__ */ jsx("p", { className: "mt-4 rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200", children: notice }) : null,
        /* @__PURE__ */ jsx("div", { className: "mt-6 grid gap-3", children: isSignup ? /* @__PURE__ */ jsx(
          "button",
          {
            type: "button",
            onClick: handleSignup,
            disabled: busyAction !== null || usernameStatus === "taken" || usernameStatus === "invalid" || usernameStatus === "checking",
            className: "rounded-lg bg-orange-300 px-4 py-2.5 font-semibold text-zinc-950 transition hover:bg-orange-200 disabled:cursor-not-allowed disabled:opacity-70",
            children: busyAction === "signup" ? "Creating account..." : usernameStatus === "checking" ? "Checking username..." : "Create Account"
          }
        ) : null }),
        /* @__PURE__ */ jsxs("div", { className: "mt-5", children: [
          /* @__PURE__ */ jsxs("div", { className: "relative flex items-center gap-3", children: [
            /* @__PURE__ */ jsx("div", { className: "h-px flex-1 bg-zinc-200/15" }),
            /* @__PURE__ */ jsx("span", { className: "text-xs text-zinc-500", children: "or continue with" }),
            /* @__PURE__ */ jsx("div", { className: "h-px flex-1 bg-zinc-200/15" })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "mt-3 grid grid-cols-2 gap-2", children: [
            /* @__PURE__ */ jsxs(
              "button",
              {
                type: "button",
                onClick: () => handleOAuth("google"),
                disabled: busyAction !== null,
                className: "flex items-center justify-center gap-2 rounded-lg border border-zinc-200/20 bg-zinc-950/40 px-3 py-2.5 text-sm font-medium text-zinc-100 transition hover:border-zinc-100/50 disabled:cursor-not-allowed disabled:opacity-60",
                "aria-label": "Sign in with Google",
                children: [
                  /* @__PURE__ */ jsxs("svg", { width: "16", height: "16", viewBox: "0 0 24 24", "aria-hidden": "true", children: [
                    /* @__PURE__ */ jsx("path", { fill: "#4285F4", d: "M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" }),
                    /* @__PURE__ */ jsx("path", { fill: "#34A853", d: "M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" }),
                    /* @__PURE__ */ jsx("path", { fill: "#FBBC05", d: "M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" }),
                    /* @__PURE__ */ jsx("path", { fill: "#EA4335", d: "M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" })
                  ] }),
                  "Google"
                ]
              }
            ),
            /* @__PURE__ */ jsxs(
              "button",
              {
                type: "button",
                onClick: () => handleOAuth("kick"),
                disabled: busyAction !== null,
                className: "flex items-center justify-center gap-2 rounded-lg border border-zinc-200/20 bg-zinc-950/40 px-3 py-2.5 text-sm font-medium text-zinc-100 transition hover:border-zinc-100/50 disabled:cursor-not-allowed disabled:opacity-60",
                "aria-label": "Sign in with Kick",
                children: [
                  /* @__PURE__ */ jsx("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "#53FC18", "aria-hidden": "true", children: /* @__PURE__ */ jsx("path", { d: "M2 2h5v8.5l5-8.5h6l-6 10 6 10h-6l-5-8.5V22H2z" }) }),
                  "Kick"
                ]
              }
            )
          ] }),
          !isSignup ? /* @__PURE__ */ jsx("div", { className: "mt-3 rounded-lg border border-emerald-300/35 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200", children: "Linked methods enabled: connect providers in Settings once, then sign in with any linked method on the same account." }) : null
        ] }),
        isSignup ? /* @__PURE__ */ jsxs("p", { className: "mt-4 text-xs text-zinc-400", children: [
          "Already have an account?",
          " ",
          /* @__PURE__ */ jsx(
            "button",
            {
              type: "button",
              onClick: () => void navigate({ to: "/login" }),
              className: "font-semibold text-orange-200 underline underline-offset-4 transition hover:text-orange-100",
              children: "Sign in instead"
            }
          )
        ] }) : null
      ] })
    ] })
  ] }) });
}
export {
  AuthPage as A
};
