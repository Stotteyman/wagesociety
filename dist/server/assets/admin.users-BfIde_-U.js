import { jsx, jsxs, Fragment } from "react/jsx-runtime";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, UserCog, ChevronDown, Check, Users, Ban, ShieldCheck } from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import { h as formatRoleLabel, O as ORG_ROLES, j as ORG_ROLE_LABELS, c as authedFetch } from "./router-CSiXPOJe.js";
import "@supabase/supabase-js";
import "stripe";
import "node:fs/promises";
import "node:path";
import "zod";
import "node:crypto";
const roleBadgeClass = {
  superadmin: "border-orange-300/60 bg-orange-400/10 text-orange-200",
  admin: "border-cyan-400/40 bg-cyan-400/10 text-cyan-200",
  manager: "border-emerald-400/40 bg-emerald-400/10 text-emerald-200",
  staff: "border-sky-400/40 bg-sky-400/10 text-sky-200",
  moderator: "border-fuchsia-400/40 bg-fuchsia-400/10 text-fuchsia-200",
  helper: "border-violet-400/40 bg-violet-400/10 text-violet-200",
  user: "border-zinc-500/40 bg-zinc-800/40 text-zinc-300",
  banned: "border-rose-400/50 bg-rose-500/10 text-rose-200"
};
const PERMISSION_ROLES = ORG_ROLES.filter((r) => r !== "banned");
function AdminUsersPage() {
  const [roles, setRoles] = useState([]);
  const [permissionMatrix, setPermissionMatrix] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [requesterEmail, setRequesterEmail] = useState("");
  const [requesterRole, setRequesterRole] = useState("user");
  const [requesterPermissions, setRequesterPermissions] = useState([]);
  const [formEmail, setFormEmail] = useState("");
  const [memberSearchOpen, setMemberSearchOpen] = useState(false);
  const [formRole, setFormRole] = useState("manager");
  const [banReason, setBanReason] = useState("");
  const [bannedUntil, setBannedUntil] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [availablePlans, setAvailablePlans] = useState(["free"]);
  const [planDraftByEmail, setPlanDraftByEmail] = useState({});
  const [planSavingEmail, setPlanSavingEmail] = useState("");
  const [usernameDraftByEmail, setUsernameDraftByEmail] = useState({});
  const [usernameSavingEmail, setUsernameSavingEmail] = useState("");
  const [activePermRole, setActivePermRole] = useState("admin");
  const [permSavingKey, setPermSavingKey] = useState("");
  const canManagePerms = requesterRole === "superadmin" || requesterPermissions.includes("manage_permissions");
  const canManageUsers = requesterRole === "superadmin" || requesterPermissions.includes("manage_users");
  const memberSuggestions = useMemo(() => {
    const query = formEmail.trim().toLowerCase();
    const rows = roles.map((row) => {
      const local = row.email.split("@")[0] || "";
      const fallbackName = local.split(/[._-]+/).filter(Boolean).map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1).toLowerCase()}`).join(" ");
      const name = row.display_name?.trim() || fallbackName;
      return {
        email: row.email,
        name,
        search: `${row.email} ${name}`.toLowerCase()
      };
    }).sort((a, b) => a.email.localeCompare(b.email));
    if (!query) return rows.slice(0, 8);
    return rows.filter((row) => row.search.includes(query)).slice(0, 8);
  }, [roles, formEmail]);
  const loadRoles = async () => {
    const res = await authedFetch("/api/admin/roles");
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "Failed to load members");
      return;
    }
    const nextRoles = json.roles || [];
    setRoles(nextRoles);
    setPlanDraftByEmail((prev) => {
      const next = {
        ...prev
      };
      for (const row of nextRoles) {
        if (!row.email) continue;
        const currentPlan = String(row.membership_plan || "free").trim().toLowerCase();
        next[row.email] = currentPlan || "free";
      }
      return next;
    });
    setUsernameDraftByEmail((prev) => {
      const next = {
        ...prev
      };
      for (const row of nextRoles) {
        if (!row.email) continue;
        const fallback = row.email.split("@")[0] || "";
        next[row.email] = String(row.display_name || fallback).trim();
      }
      return next;
    });
    setRequesterEmail(json.requester?.email || "");
    setRequesterRole(json.requester?.role || "user");
    setRequesterPermissions(json.requester?.permissions || []);
  };
  const loadPlans = async () => {
    const res = await authedFetch("/api/admin/shop/plans");
    const json = await res.json();
    if (!res.ok) return;
    const planSlugs = Array.isArray(json.plans) ? json.plans.filter((plan) => plan.is_active !== false).map((plan) => String(plan.slug || "").trim().toLowerCase()).filter((slug) => Boolean(slug)) : [];
    const unique = Array.from(/* @__PURE__ */ new Set(["free", ...planSlugs]));
    setAvailablePlans(unique);
  };
  const loadPermissions = async () => {
    const res = await authedFetch("/api/admin/permissions");
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "Failed to load permissions");
      return;
    }
    setPermissionMatrix(json.matrix || []);
  };
  useEffect(() => {
    void (async () => {
      setLoading(true);
      setError("");
      try {
        await Promise.all([loadRoles(), loadPermissions(), loadPlans()]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load admin user data");
      } finally {
        setLoading(false);
      }
    })();
  }, []);
  const submitRole = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setSubmitSuccess(false);
    const res = await authedFetch("/api/admin/roles", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        targetEmail: formEmail,
        role: formRole,
        banReason: formRole === "banned" ? banReason.trim() || null : null,
        bannedUntil: formRole === "banned" && bannedUntil ? new Date(bannedUntil).toISOString() : null
      })
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "Failed to update role");
      setSubmitting(false);
      return;
    }
    setFormEmail("");
    setFormRole("manager");
    setBanReason("");
    setBannedUntil("");
    setSubmitSuccess(true);
    setTimeout(() => setSubmitSuccess(false), 3e3);
    await loadRoles();
    setSubmitting(false);
  };
  const togglePermission = async (role, permissionKey, enabled) => {
    if (!canManagePerms) return;
    setPermSavingKey(`${role}:${permissionKey}`);
    setError("");
    const res = await authedFetch("/api/admin/permissions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        role,
        permissionKey,
        enabled
      })
    });
    const json = await res.json();
    if (!res.ok) setError(json.error || "Failed to update permission");
    else await loadPermissions();
    setPermSavingKey("");
  };
  const updateSubscription = async (email) => {
    if (!canManageUsers) return;
    const requestedPlan = String(planDraftByEmail[email] || "free").trim().toLowerCase();
    if (!requestedPlan) {
      setError("Please select a valid subscription plan.");
      return;
    }
    setPlanSavingEmail(email);
    setError("");
    const res = await authedFetch("/api/admin/roles", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        targetEmail: email,
        membershipPlan: requestedPlan
      })
    });
    const json = await res.json();
    if (!res.ok) {
      const detailText = Array.isArray(json.details) ? json.details.filter((item) => typeof item === "string").join(" ") : "";
      setError([json.error || "Failed to update subscription plan", detailText].filter(Boolean).join(" "));
      setPlanSavingEmail("");
      return;
    }
    await loadRoles();
    setPlanSavingEmail("");
  };
  const updateUsername = async (email) => {
    if (!canManageUsers) return;
    const requestedUsername = String(usernameDraftByEmail[email] || "").trim();
    if (!requestedUsername) {
      setError("Please enter a username before saving.");
      return;
    }
    setUsernameSavingEmail(email);
    setError("");
    const res = await authedFetch("/api/admin/roles", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        targetEmail: email,
        username: requestedUsername
      })
    });
    const json = await res.json();
    if (!res.ok) {
      const detailText = Array.isArray(json.details) ? json.details.filter((item) => typeof item === "string").join(" ") : "";
      setError([json.error || "Failed to update username", detailText].filter(Boolean).join(" "));
      setUsernameSavingEmail("");
      return;
    }
    await loadRoles();
    setUsernameSavingEmail("");
  };
  const activeRoleField = `${activePermRole}_enabled`;
  return /* @__PURE__ */ jsx("div", { className: "min-h-screen px-4 py-12 text-zinc-100", children: /* @__PURE__ */ jsxs("div", { className: "mx-auto max-w-5xl space-y-6", children: [
    /* @__PURE__ */ jsxs("header", { className: "rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-6", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap items-center justify-between gap-4", children: [
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("p", { className: "text-xs font-semibold uppercase tracking-widest text-zinc-500", children: "Admin / Users" }),
          /* @__PURE__ */ jsx("h1", { className: "mt-1.5 text-3xl font-black text-zinc-50", children: "Users & Permissions" })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "flex gap-2", children: [
          /* @__PURE__ */ jsxs(Link, { to: "/admin", className: "inline-flex items-center gap-2 rounded-lg border border-zinc-300/30 px-4 py-2 text-sm font-semibold text-zinc-100 transition hover:border-zinc-100", children: [
            /* @__PURE__ */ jsx(ArrowLeft, { size: 14 }),
            " Admin"
          ] }),
          /* @__PURE__ */ jsx(Link, { to: "/dashboard", className: "rounded-lg border border-zinc-300/30 px-4 py-2 text-sm font-semibold text-zinc-100 transition hover:border-zinc-100", children: "Dashboard" })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "mt-3 flex flex-wrap items-center gap-2 text-xs", children: [
        /* @__PURE__ */ jsx("span", { className: "rounded-full border border-zinc-700 px-2.5 py-1 text-zinc-400", children: requesterEmail || "Loading…" }),
        /* @__PURE__ */ jsx("span", { className: "rounded-full border border-zinc-700 px-2.5 py-1 text-zinc-400", children: formatRoleLabel(requesterRole) })
      ] })
    ] }),
    error ? /* @__PURE__ */ jsx("p", { className: "rounded-xl border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200", children: error }) : null,
    /* @__PURE__ */ jsxs("div", { className: "grid gap-5 lg:grid-cols-[320px_1fr]", children: [
      /* @__PURE__ */ jsxs("section", { className: "rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-5", children: [
        /* @__PURE__ */ jsxs("div", { className: "mb-4 flex items-center gap-2", children: [
          /* @__PURE__ */ jsx(UserCog, { size: 16, className: "text-orange-300" }),
          /* @__PURE__ */ jsx("h2", { className: "font-bold text-zinc-100", children: "Assign Role" })
        ] }),
        /* @__PURE__ */ jsxs("form", { onSubmit: submitRole, className: "space-y-3", children: [
          /* @__PURE__ */ jsxs("label", { className: "block", children: [
            /* @__PURE__ */ jsx("span", { className: "mb-1.5 block text-xs font-medium text-zinc-400", children: "Member (search by name or email)" }),
            /* @__PURE__ */ jsxs("div", { className: "relative", children: [
              /* @__PURE__ */ jsx("input", { type: "text", required: true, value: formEmail, onChange: (e) => {
                setFormEmail(e.target.value);
                setMemberSearchOpen(true);
              }, onFocus: () => setMemberSearchOpen(true), onBlur: () => {
                setTimeout(() => setMemberSearchOpen(false), 120);
              }, className: "w-full rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-orange-300/60", placeholder: "Type a name or email", autoComplete: "off" }),
              memberSearchOpen && memberSuggestions.length > 0 ? /* @__PURE__ */ jsx("ul", { className: "absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-950/95 p-1 shadow-xl backdrop-blur", children: memberSuggestions.map((member) => /* @__PURE__ */ jsx("li", { children: /* @__PURE__ */ jsxs("button", { type: "button", onMouseDown: (event) => {
                event.preventDefault();
                setFormEmail(member.email);
                setMemberSearchOpen(false);
              }, className: "w-full rounded-md px-2.5 py-2 text-left transition hover:bg-zinc-800", children: [
                /* @__PURE__ */ jsx("p", { className: "truncate text-sm font-medium text-zinc-100", children: member.name || member.email }),
                /* @__PURE__ */ jsx("p", { className: "truncate text-xs text-zinc-500", children: member.email })
              ] }) }, member.email)) }) : null
            ] })
          ] }),
          /* @__PURE__ */ jsxs("label", { className: "block", children: [
            /* @__PURE__ */ jsx("span", { className: "mb-1.5 block text-xs font-medium text-zinc-400", children: "Role" }),
            /* @__PURE__ */ jsxs("div", { className: "relative", children: [
              /* @__PURE__ */ jsx("select", { value: formRole, onChange: (e) => setFormRole(e.target.value), className: "w-full appearance-none rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 pr-8 text-sm text-zinc-100 outline-none transition focus:border-orange-300/60", children: ORG_ROLES.map((r) => /* @__PURE__ */ jsx("option", { value: r, children: ORG_ROLE_LABELS[r] }, r)) }),
              /* @__PURE__ */ jsx(ChevronDown, { size: 14, className: "pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500" })
            ] })
          ] }),
          formRole === "banned" ? /* @__PURE__ */ jsxs(Fragment, { children: [
            /* @__PURE__ */ jsxs("label", { className: "block", children: [
              /* @__PURE__ */ jsx("span", { className: "mb-1.5 block text-xs font-medium text-zinc-400", children: "Ban Reason" }),
              /* @__PURE__ */ jsx("textarea", { required: true, value: banReason, onChange: (e) => setBanReason(e.target.value), rows: 3, className: "w-full rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-orange-300/60", placeholder: "Reason for the ban" })
            ] }),
            /* @__PURE__ */ jsxs("label", { className: "block", children: [
              /* @__PURE__ */ jsx("span", { className: "mb-1.5 block text-xs font-medium text-zinc-400", children: "Ban Until (optional)" }),
              /* @__PURE__ */ jsx("input", { type: "datetime-local", value: bannedUntil, onChange: (e) => setBannedUntil(e.target.value), className: "w-full rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-orange-300/60" })
            ] })
          ] }) : null,
          /* @__PURE__ */ jsx("button", { type: "submit", disabled: submitting || !canManageUsers, className: "flex w-full items-center justify-center gap-2 rounded-lg bg-orange-300 px-4 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-orange-200 disabled:cursor-not-allowed disabled:opacity-60", children: submitting ? "Saving…" : submitSuccess ? /* @__PURE__ */ jsxs(Fragment, { children: [
            /* @__PURE__ */ jsx(Check, { size: 14 }),
            " Saved"
          ] }) : "Save Role" })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("section", { className: "rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-5", children: [
        /* @__PURE__ */ jsxs("div", { className: "mb-4 flex items-center justify-between", children: [
          /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
            /* @__PURE__ */ jsx(Users, { size: 16, className: "text-orange-300" }),
            /* @__PURE__ */ jsx("h2", { className: "font-bold text-zinc-100", children: "Members" })
          ] }),
          /* @__PURE__ */ jsxs("span", { className: "rounded-full border border-zinc-700 px-2.5 py-0.5 text-xs text-zinc-500", children: [
            roles.length,
            " total"
          ] })
        ] }),
        loading ? /* @__PURE__ */ jsx("p", { className: "text-sm text-zinc-400", children: "Loading members…" }) : roles.length === 0 ? /* @__PURE__ */ jsx("p", { className: "text-sm text-zinc-500", children: "No members yet." }) : /* @__PURE__ */ jsx("ul", { className: "space-y-1.5 max-h-[480px] overflow-y-auto pr-1", children: roles.map((row) => /* @__PURE__ */ jsxs("li", { className: "flex flex-wrap items-start justify-between gap-3 rounded-xl border border-zinc-200/10 bg-zinc-950/40 px-4 py-3", children: [
          /* @__PURE__ */ jsxs("div", { className: "min-w-0", children: [
            /* @__PURE__ */ jsx("p", { className: "truncate text-sm font-medium text-zinc-100", children: row.display_name || row.email }),
            row.display_name ? /* @__PURE__ */ jsx("p", { className: "mt-0.5 truncate text-xs text-zinc-500", children: row.email }) : null,
            row.role === "banned" && row.ban_reason ? /* @__PURE__ */ jsxs("p", { className: "mt-0.5 text-xs text-rose-300/80", children: [
              "Banned: ",
              row.ban_reason
            ] }) : /* @__PURE__ */ jsxs("p", { className: "mt-0.5 text-xs text-zinc-600", children: [
              "Granted by ",
              row.granted_by || "system",
              " · ",
              new Date(row.updated_at).toLocaleDateString()
            ] }),
            /* @__PURE__ */ jsxs("p", { className: "mt-1 text-xs text-zinc-500", children: [
              "Plan: ",
              (row.membership_plan || "free").toUpperCase(),
              " · Permissions: ",
              row.effective_permissions?.length || 0,
              row.stripe_subscription_id ? " · Stripe active" : ""
            ] })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
            /* @__PURE__ */ jsx("span", { className: `rounded-full border px-2.5 py-0.5 text-xs font-medium ${roleBadgeClass[row.role]}`, children: row.role === "banned" ? /* @__PURE__ */ jsxs("span", { className: "flex items-center gap-1", children: [
              /* @__PURE__ */ jsx(Ban, { size: 10 }),
              ORG_ROLE_LABELS[row.role]
            ] }) : ORG_ROLE_LABELS[row.role] }),
            /* @__PURE__ */ jsxs("div", { className: "flex flex-col items-end gap-1.5", children: [
              /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-1.5", children: [
                /* @__PURE__ */ jsx("input", { type: "text", value: usernameDraftByEmail[row.email] || "", onChange: (event) => {
                  const value = event.target.value;
                  setUsernameDraftByEmail((prev) => ({
                    ...prev,
                    [row.email]: value
                  }));
                }, disabled: !canManageUsers || usernameSavingEmail === row.email, className: "w-32 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-100 outline-none", placeholder: "username" }),
                /* @__PURE__ */ jsx("button", { type: "button", onClick: () => {
                  void updateUsername(row.email);
                }, disabled: !canManageUsers || usernameSavingEmail === row.email, className: "rounded-md border border-zinc-500/60 px-2 py-1 text-xs font-semibold text-zinc-100 transition hover:border-orange-300/70 hover:text-orange-100 disabled:cursor-not-allowed disabled:opacity-50", children: usernameSavingEmail === row.email ? "Saving..." : "Save @" })
              ] }),
              /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-1.5", children: [
                /* @__PURE__ */ jsx("select", { value: planDraftByEmail[row.email] || "free", onChange: (event) => {
                  const value = event.target.value;
                  setPlanDraftByEmail((prev) => ({
                    ...prev,
                    [row.email]: value
                  }));
                }, disabled: !canManageUsers || planSavingEmail === row.email, className: "rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-100 outline-none", children: availablePlans.map((plan) => /* @__PURE__ */ jsx("option", { value: plan, children: plan.toUpperCase() }, plan)) }),
                /* @__PURE__ */ jsx("button", { type: "button", onClick: () => {
                  void updateSubscription(row.email);
                }, disabled: !canManageUsers || planSavingEmail === row.email, className: "rounded-md border border-zinc-500/60 px-2 py-1 text-xs font-semibold text-zinc-100 transition hover:border-orange-300/70 hover:text-orange-100 disabled:cursor-not-allowed disabled:opacity-50", children: planSavingEmail === row.email ? "Saving..." : "Save Plan" })
              ] })
            ] })
          ] })
        ] }, row.email)) })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("section", { className: "rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-5", children: [
      /* @__PURE__ */ jsxs("div", { className: "mb-5 flex flex-wrap items-center justify-between gap-3", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
          /* @__PURE__ */ jsx(ShieldCheck, { size: 16, className: "text-orange-300" }),
          /* @__PURE__ */ jsx("h2", { className: "font-bold text-zinc-100", children: "Permission Management" })
        ] }),
        !canManagePerms ? /* @__PURE__ */ jsx("span", { className: "rounded-full border border-zinc-700 px-2.5 py-0.5 text-xs text-zinc-500", children: "Read-only" }) : null
      ] }),
      /* @__PURE__ */ jsx("div", { className: "mb-5 flex flex-wrap gap-1.5", children: PERMISSION_ROLES.map((role) => /* @__PURE__ */ jsx("button", { type: "button", onClick: () => setActivePermRole(role), className: `rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${activePermRole === role ? `${roleBadgeClass[role]} ring-1 ring-current/30` : "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"}`, children: ORG_ROLE_LABELS[role] }, role)) }),
      loading ? /* @__PURE__ */ jsx("p", { className: "text-sm text-zinc-400", children: "Loading permissions…" }) : /* @__PURE__ */ jsx("ul", { className: "divide-y divide-zinc-200/8", children: permissionMatrix.map((perm) => {
        const isEnabled = Boolean(perm[activeRoleField]);
        const isSaving = permSavingKey === `${activePermRole}:${perm.permission_key}`;
        const isLocked = !canManagePerms || activePermRole === "banned";
        return /* @__PURE__ */ jsxs("li", { className: "flex items-center justify-between gap-4 py-3", children: [
          /* @__PURE__ */ jsxs("div", { className: "min-w-0", children: [
            /* @__PURE__ */ jsx("p", { className: "text-sm font-medium text-zinc-100", children: perm.label }),
            /* @__PURE__ */ jsx("p", { className: "text-xs text-zinc-500", children: perm.description })
          ] }),
          /* @__PURE__ */ jsx("button", { type: "button", disabled: isLocked || isSaving, onClick: () => {
            void togglePermission(activePermRole, perm.permission_key, !isEnabled);
          }, className: `relative shrink-0 h-6 w-11 rounded-full border transition-colors duration-200 ${isEnabled ? "border-orange-400/60 bg-orange-400/20" : "border-zinc-600 bg-zinc-800"} disabled:cursor-not-allowed disabled:opacity-50`, "aria-label": `${isEnabled ? "Disable" : "Enable"} ${perm.label} for ${ORG_ROLE_LABELS[activePermRole]}`, children: /* @__PURE__ */ jsx("span", { className: `absolute top-0.5 h-4 w-4 rounded-full transition-all duration-200 ${isEnabled ? "left-[calc(100%-18px)] bg-orange-300" : "left-0.5 bg-zinc-500"}` }) })
        ] }, perm.permission_key);
      }) })
    ] })
  ] }) });
}
export {
  AdminUsersPage as component
};
