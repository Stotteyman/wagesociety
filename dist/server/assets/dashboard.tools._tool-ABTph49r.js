import { jsxs, jsx, Fragment } from "react/jsx-runtime";
import { c as authedFetch, k as Route, t as toolSchema, M as MerchStudioPage } from "./router-CSiXPOJe.js";
import { Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, Plus, X, Briefcase, Search, Clock, Users, ExternalLink, ChevronUp, ChevronDown, Check, Send, Radio, Globe, DollarSign, Share2, Settings, Save, Trash2, Eye, BookOpen, TrendingUp, Megaphone, Copy, Calendar, FileText, Tag, LayoutTemplate, GraduationCap } from "lucide-react";
import { useState, useEffect, useMemo, useRef } from "react";
import "@supabase/supabase-js";
import "stripe";
import "node:fs/promises";
import "node:path";
import "zod";
import "node:crypto";
function statusBadge(status) {
  const styles = {
    open: "border-emerald-300/40 text-emerald-300",
    closed: "border-zinc-500/40 text-zinc-400",
    completed: "border-violet-300/40 text-violet-300",
    pending: "border-orange-300/40 text-orange-300",
    accepted: "border-emerald-300/40 text-emerald-300",
    rejected: "border-rose-300/40 text-rose-300"
  };
  return `rounded-full border px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${styles[status] || "border-zinc-300/40 text-zinc-300"}`;
}
function Avatar({ url, name, size = 10 }) {
  const initials = name.split("@")[0].slice(0, 2).toUpperCase();
  const sizeClass = `h-${size} w-${size}`;
  if (url) {
    return /* @__PURE__ */ jsx(
      "img",
      {
        src: url,
        alt: name,
        className: `${sizeClass} rounded-full object-cover border border-zinc-200/20 flex-shrink-0`
      }
    );
  }
  return /* @__PURE__ */ jsx(
    "div",
    {
      className: `${sizeClass} flex flex-shrink-0 items-center justify-center rounded-full bg-orange-300/20 border border-orange-300/30 text-xs font-bold text-orange-200`,
      children: initials
    }
  );
}
function SkillChip({ label }) {
  return /* @__PURE__ */ jsx("span", { className: "rounded-full border border-zinc-200/20 bg-zinc-800/60 px-2.5 py-0.5 text-xs text-zinc-300", children: label });
}
function ApplicantsDrawer({
  requestId,
  requestTitle,
  onClose
}) {
  const [applicants, setApplicants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const load = async () => {
    const response = await authedFetch(`/api/collab/applicants?requestId=${requestId}`);
    if (response.ok) {
      const data = await response.json();
      setApplicants(data.applicants || []);
    }
    setLoading(false);
  };
  useEffect(() => {
    void load();
  }, [requestId]);
  const updateStatus = async (applicationId, status) => {
    setBusyId(applicationId);
    const response = await authedFetch("/api/collab/applicants", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ applicationId, status })
    });
    if (response.ok) {
      setApplicants(
        (prev) => prev.map((a) => a.id === applicationId ? { ...a, status } : a)
      );
    }
    setBusyId(null);
  };
  const pending = applicants.filter((a) => a.status === "pending");
  const decided = applicants.filter((a) => a.status !== "pending");
  return /* @__PURE__ */ jsx(
    "div",
    {
      className: "fixed inset-0 z-50 flex items-start justify-end bg-zinc-950/70 backdrop-blur-sm",
      onClick: onClose,
      children: /* @__PURE__ */ jsxs(
        "aside",
        {
          className: "relative flex h-full w-full max-w-lg flex-col overflow-y-auto bg-zinc-900 p-6 shadow-2xl",
          onClick: (e) => e.stopPropagation(),
          children: [
            /* @__PURE__ */ jsx(
              "button",
              {
                type: "button",
                onClick: onClose,
                className: "absolute right-4 top-4 rounded-lg border border-zinc-200/20 p-1.5 text-zinc-400 transition hover:text-zinc-50",
                children: /* @__PURE__ */ jsx(X, { size: 18 })
              }
            ),
            /* @__PURE__ */ jsx("p", { className: "text-xs font-semibold uppercase tracking-[0.15em] text-zinc-400", children: "Applicants" }),
            /* @__PURE__ */ jsx("h2", { className: "mt-1 text-xl font-bold text-zinc-50 pr-8", children: requestTitle }),
            loading ? /* @__PURE__ */ jsx("p", { className: "mt-6 text-sm text-zinc-400", children: "Loading applicants..." }) : applicants.length === 0 ? /* @__PURE__ */ jsxs("div", { className: "mt-8 rounded-xl border border-zinc-200/15 bg-zinc-800/60 p-6 text-center", children: [
              /* @__PURE__ */ jsx(Users, { size: 24, className: "mx-auto mb-2 text-zinc-500" }),
              /* @__PURE__ */ jsx("p", { className: "text-sm text-zinc-400", children: "No one has applied yet." })
            ] }) : /* @__PURE__ */ jsxs("div", { className: "mt-6 space-y-6", children: [
              pending.length > 0 && /* @__PURE__ */ jsxs("section", { children: [
                /* @__PURE__ */ jsxs("h3", { className: "mb-3 text-sm font-semibold text-orange-200", children: [
                  "Pending (",
                  pending.length,
                  ")"
                ] }),
                /* @__PURE__ */ jsx("div", { className: "space-y-3", children: pending.map((applicant) => /* @__PURE__ */ jsx(
                  ApplicantCard,
                  {
                    applicant,
                    busy: busyId === applicant.id,
                    onAccept: () => {
                      void updateStatus(applicant.id, "accepted");
                    },
                    onReject: () => {
                      void updateStatus(applicant.id, "rejected");
                    }
                  },
                  applicant.id
                )) })
              ] }),
              decided.length > 0 && /* @__PURE__ */ jsxs("section", { children: [
                /* @__PURE__ */ jsxs("h3", { className: "mb-3 text-sm font-semibold text-zinc-400", children: [
                  "Decided (",
                  decided.length,
                  ")"
                ] }),
                /* @__PURE__ */ jsx("div", { className: "space-y-3", children: decided.map((applicant) => /* @__PURE__ */ jsx(
                  ApplicantCard,
                  {
                    applicant,
                    busy: busyId === applicant.id,
                    onAccept: () => {
                      void updateStatus(applicant.id, "accepted");
                    },
                    onReject: () => {
                      void updateStatus(applicant.id, "rejected");
                    }
                  },
                  applicant.id
                )) })
              ] })
            ] })
          ]
        }
      )
    }
  );
}
function ApplicantCard({
  applicant,
  busy,
  onAccept,
  onReject
}) {
  const name = applicant.profile?.display_name || applicant.applicant_email.split("@")[0];
  return /* @__PURE__ */ jsxs("article", { className: "rounded-xl border border-zinc-200/15 bg-zinc-800/60 p-4", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-start gap-3", children: [
      /* @__PURE__ */ jsx(Avatar, { url: applicant.profile?.avatar_url || null, name, size: 10 }),
      /* @__PURE__ */ jsxs("div", { className: "flex-1 min-w-0", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 flex-wrap", children: [
          /* @__PURE__ */ jsx("span", { className: "font-semibold text-zinc-100 truncate", children: name }),
          /* @__PURE__ */ jsx("span", { className: statusBadge(applicant.status), children: applicant.status })
        ] }),
        /* @__PURE__ */ jsx("p", { className: "text-xs text-zinc-500 mt-0.5", children: applicant.applicant_email }),
        applicant.profile?.bio ? /* @__PURE__ */ jsx("p", { className: "mt-1.5 text-sm text-zinc-400 line-clamp-2", children: applicant.profile.bio }) : null,
        applicant.profile?.skills?.length ? /* @__PURE__ */ jsx("div", { className: "mt-2 flex flex-wrap gap-1", children: applicant.profile.skills.slice(0, 5).map((s) => /* @__PURE__ */ jsx(SkillChip, { label: s }, s)) }) : null,
        applicant.message ? /* @__PURE__ */ jsxs("blockquote", { className: "mt-2 rounded-lg border border-zinc-200/10 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-300 italic", children: [
          '"',
          applicant.message,
          '"'
        ] }) : null,
        /* @__PURE__ */ jsxs("p", { className: "mt-2 text-xs text-zinc-500", children: [
          "Applied ",
          new Date(applicant.applied_at).toLocaleDateString()
        ] })
      ] })
    ] }),
    applicant.status === "pending" ? /* @__PURE__ */ jsxs("div", { className: "mt-3 flex gap-2", children: [
      /* @__PURE__ */ jsx(
        "button",
        {
          type: "button",
          onClick: onAccept,
          disabled: busy,
          className: "flex-1 rounded-lg bg-emerald-600 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-60",
          children: busy ? "..." : "✓ Accept"
        }
      ),
      /* @__PURE__ */ jsx(
        "button",
        {
          type: "button",
          onClick: onReject,
          disabled: busy,
          className: "flex-1 rounded-lg border border-rose-300/30 py-2 text-sm font-semibold text-rose-300 transition hover:border-rose-200 disabled:opacity-60",
          children: busy ? "..." : "✕ Decline"
        }
      )
    ] }) : null
  ] });
}
function ApplyModal({
  request,
  onClose,
  onSuccess
}) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async () => {
    setBusy(true);
    setError("");
    const response = await authedFetch("/api/collab/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId: request.id, message })
    });
    if (response.ok) {
      onSuccess();
      onClose();
    } else {
      const data = await response.json();
      setError(data.error || "Could not submit application.");
    }
    setBusy(false);
  };
  return /* @__PURE__ */ jsx(
    "div",
    {
      className: "fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/70 backdrop-blur-sm p-4",
      onClick: onClose,
      children: /* @__PURE__ */ jsxs(
        "div",
        {
          className: "w-full max-w-md rounded-2xl border border-zinc-200/15 bg-zinc-900 p-6 shadow-2xl",
          onClick: (e) => e.stopPropagation(),
          children: [
            /* @__PURE__ */ jsxs("div", { className: "flex items-start justify-between gap-2", children: [
              /* @__PURE__ */ jsxs("div", { children: [
                /* @__PURE__ */ jsx("p", { className: "text-xs font-semibold uppercase tracking-[0.15em] text-zinc-400", children: "Apply to Collaborate" }),
                /* @__PURE__ */ jsx("h3", { className: "mt-1 text-lg font-bold text-zinc-50", children: request.title })
              ] }),
              /* @__PURE__ */ jsx("button", { type: "button", onClick: onClose, className: "rounded-lg border border-zinc-200/20 p-1.5 text-zinc-400 hover:text-zinc-50", children: /* @__PURE__ */ jsx(X, { size: 16 }) })
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "mt-4", children: [
              /* @__PURE__ */ jsx("label", { className: "mb-1.5 block text-sm font-medium text-zinc-300", children: "Why are you a great fit? (optional)" }),
              /* @__PURE__ */ jsx(
                "textarea",
                {
                  value: message,
                  onChange: (e) => setMessage(e.target.value),
                  rows: 4,
                  maxLength: 500,
                  placeholder: "Tell the owner a bit about yourself and what you bring to this collaboration...",
                  className: "w-full rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-orange-200/70 resize-none"
                }
              ),
              /* @__PURE__ */ jsxs("p", { className: "mt-1 text-right text-xs text-zinc-500", children: [
                message.length,
                "/500"
              ] })
            ] }),
            error ? /* @__PURE__ */ jsx("p", { className: "mt-3 rounded-lg border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200", children: error }) : null,
            /* @__PURE__ */ jsxs(
              "button",
              {
                type: "button",
                onClick: () => {
                  void submit();
                },
                disabled: busy,
                className: "mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-orange-300 py-2.5 font-semibold text-zinc-950 transition hover:bg-orange-200 disabled:opacity-70",
                children: [
                  /* @__PURE__ */ jsx(Send, { size: 16 }),
                  " ",
                  busy ? "Sending..." : "Submit Application"
                ]
              }
            )
          ]
        }
      )
    }
  );
}
function RequestCard({
  req,
  onApply,
  onViewApplicants,
  onClose,
  onDelete
}) {
  const [expanded, setExpanded] = useState(false);
  return /* @__PURE__ */ jsxs("article", { className: "rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-5 transition hover:border-zinc-200/25", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-start gap-3", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex-1 min-w-0", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [
          /* @__PURE__ */ jsx("span", { className: statusBadge(req.status), children: req.status }),
          /* @__PURE__ */ jsxs("span", { className: "flex items-center gap-1 text-xs text-zinc-500", children: [
            /* @__PURE__ */ jsx(Users, { size: 11 }),
            " ",
            req.spots_available,
            " spot",
            req.spots_available !== 1 ? "s" : ""
          ] }),
          req.isOwner && req.applicantCount > 0 ? /* @__PURE__ */ jsxs("span", { className: "rounded-full border border-orange-300/40 bg-orange-300/10 px-2 py-0.5 text-xs font-semibold text-orange-200", children: [
            req.applicantCount,
            " applicant",
            req.applicantCount !== 1 ? "s" : ""
          ] }) : null
        ] }),
        /* @__PURE__ */ jsx("h3", { className: "mt-2 text-base font-bold text-zinc-50", children: req.title }),
        /* @__PURE__ */ jsxs("p", { className: "mt-0.5 text-xs text-zinc-500", children: [
          "by ",
          req.owner_email.split("@")[0]
        ] }),
        req.description ? /* @__PURE__ */ jsx("p", { className: `mt-2 text-sm text-zinc-400 ${expanded ? "" : "line-clamp-2"}`, children: req.description }) : null,
        req.skills_needed.length > 0 ? /* @__PURE__ */ jsx("div", { className: "mt-3 flex flex-wrap gap-1.5", children: req.skills_needed.map((s) => /* @__PURE__ */ jsx(SkillChip, { label: s }, s)) }) : null,
        req.project_url ? /* @__PURE__ */ jsxs(
          "a",
          {
            href: req.project_url,
            target: "_blank",
            rel: "noopener noreferrer",
            className: "mt-2 inline-flex items-center gap-1 text-xs text-orange-200 transition hover:text-orange-100",
            children: [
              /* @__PURE__ */ jsx(ExternalLink, { size: 11 }),
              " View Project"
            ]
          }
        ) : null
      ] }),
      /* @__PURE__ */ jsx(
        "button",
        {
          type: "button",
          onClick: () => setExpanded((v) => !v),
          className: "rounded-lg border border-zinc-200/15 p-1.5 text-zinc-500 transition hover:text-zinc-300",
          children: expanded ? /* @__PURE__ */ jsx(ChevronUp, { size: 14 }) : /* @__PURE__ */ jsx(ChevronDown, { size: 14 })
        }
      )
    ] }),
    expanded ? /* @__PURE__ */ jsxs("div", { className: "mt-4 flex items-center gap-2 border-t border-zinc-200/10 pt-4 flex-wrap", children: [
      /* @__PURE__ */ jsxs("p", { className: "text-xs text-zinc-500 flex-1", children: [
        "Posted ",
        new Date(req.created_at).toLocaleDateString()
      ] }),
      req.isOwner ? /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsxs(
          "button",
          {
            type: "button",
            onClick: () => onViewApplicants(req),
            className: "inline-flex items-center gap-1.5 rounded-lg border border-zinc-200/20 px-3 py-1.5 text-xs font-semibold text-zinc-100 transition hover:border-orange-200/40",
            children: [
              /* @__PURE__ */ jsx(Users, { size: 12 }),
              " Applicants ",
              req.applicantCount > 0 ? `(${req.applicantCount})` : ""
            ]
          }
        ),
        req.status === "open" ? /* @__PURE__ */ jsx(
          "button",
          {
            type: "button",
            onClick: () => onClose(req),
            className: "rounded-lg border border-zinc-200/20 px-3 py-1.5 text-xs font-semibold text-zinc-400 transition hover:border-zinc-200/40 hover:text-zinc-200",
            children: "Close Request"
          }
        ) : null,
        /* @__PURE__ */ jsx(
          "button",
          {
            type: "button",
            onClick: () => onDelete(req.id),
            className: "rounded-lg border border-rose-300/20 px-3 py-1.5 text-xs font-semibold text-rose-300 transition hover:border-rose-200/50",
            children: "Delete"
          }
        )
      ] }) : /* @__PURE__ */ jsx(Fragment, { children: req.hasApplied ? /* @__PURE__ */ jsxs("span", { className: "inline-flex items-center gap-1.5 rounded-lg border border-emerald-300/40 bg-emerald-300/5 px-3 py-1.5 text-xs font-semibold text-emerald-300", children: [
        /* @__PURE__ */ jsx(Check, { size: 12 }),
        " Applied"
      ] }) : req.status === "open" ? /* @__PURE__ */ jsxs(
        "button",
        {
          type: "button",
          onClick: () => onApply(req),
          className: "inline-flex items-center gap-1.5 rounded-lg bg-orange-300 px-3 py-1.5 text-xs font-semibold text-zinc-950 transition hover:bg-orange-200",
          children: [
            /* @__PURE__ */ jsx(Send, { size: 12 }),
            " Apply"
          ]
        }
      ) : null })
    ] }) : null
  ] });
}
function CollaborationHub() {
  const [tab, setTab] = useState("browse");
  const [browseRequests, setBrowseRequests] = useState([]);
  const [myRequests, setMyRequests] = useState([]);
  const [myApplications, setMyApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [applyTarget, setApplyTarget] = useState(null);
  const [applicantsTarget, setApplicantsTarget] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createSkills, setCreateSkills] = useState("");
  const [createSpots, setCreateSpots] = useState("1");
  const [createUrl, setCreateUrl] = useState("");
  const [createBusy, setCreateBusy] = useState(false);
  const loadBrowse = async () => {
    const response = await authedFetch("/api/collab");
    if (response.ok) {
      const data = await response.json();
      setBrowseRequests(data.requests || []);
    }
  };
  const loadMine = async () => {
    const response = await authedFetch("/api/collab?mine=1");
    if (response.ok) {
      const data = await response.json();
      setMyRequests(data.requests || []);
    }
  };
  const loadApplications = async () => {
    const response = await authedFetch("/api/collab/apply");
    if (response.ok) {
      const data = await response.json();
      setMyApplications(data.applications || []);
    }
  };
  useEffect(() => {
    void (async () => {
      try {
        setLoading(true);
        await Promise.all([loadBrowse(), loadMine(), loadApplications()]);
      } catch {
        setError("Failed to load collaboration hub.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);
  const handleCreate = async () => {
    if (!createTitle.trim()) {
      setError("Title is required.");
      return;
    }
    setCreateBusy(true);
    setError("");
    const response = await authedFetch("/api/collab", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: createTitle.trim(),
        description: createDescription.trim(),
        skillsNeeded: createSkills.split(",").map((s) => s.trim()).filter(Boolean),
        spotsAvailable: Math.max(1, parseInt(createSpots) || 1),
        projectUrl: createUrl.trim() || void 0
      })
    });
    if (response.ok) {
      setCreateTitle("");
      setCreateDescription("");
      setCreateSkills("");
      setCreateSpots("1");
      setCreateUrl("");
      setShowCreate(false);
      await Promise.all([loadBrowse(), loadMine()]);
      setTab("my-projects");
    } else {
      const data = await response.json();
      setError(data.error || "Could not create request.");
    }
    setCreateBusy(false);
  };
  const handleClose = async (req) => {
    await authedFetch("/api/collab", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: req.id, status: "closed" })
    });
    await Promise.all([loadBrowse(), loadMine()]);
  };
  const handleDelete = async (id) => {
    if (!confirm("Delete this collab request? This cannot be undone.")) return;
    await authedFetch("/api/collab", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id })
    });
    await Promise.all([loadBrowse(), loadMine()]);
  };
  const displayed = useMemo(() => {
    const list = tab === "browse" ? browseRequests : tab === "my-projects" ? myRequests : [];
    if (!search) return list;
    const q = search.toLowerCase();
    return list.filter(
      (r) => r.title.toLowerCase().includes(q) || r.description.toLowerCase().includes(q) || r.skills_needed.some((s) => s.toLowerCase().includes(q))
    );
  }, [tab, browseRequests, myRequests, search]);
  return /* @__PURE__ */ jsxs("div", { className: "min-h-screen px-4 py-10 text-zinc-100", children: [
    /* @__PURE__ */ jsxs("div", { className: "mx-auto max-w-5xl space-y-6", children: [
      /* @__PURE__ */ jsx("header", { className: "rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-6", children: /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap items-center justify-between gap-4", children: [
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("p", { className: "text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400", children: "Dashboard Tool" }),
          /* @__PURE__ */ jsx("h1", { className: "mt-2 text-3xl font-black text-zinc-50", children: "Collaboration Hub" }),
          /* @__PURE__ */ jsx("p", { className: "mt-1 text-sm text-zinc-400", children: "Post collab requests, find partners, and build projects together." })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "flex gap-3", children: [
          /* @__PURE__ */ jsxs(
            Link,
            {
              to: "/dashboard",
              className: "inline-flex items-center gap-2 rounded-lg border border-zinc-100/25 px-4 py-2 text-sm font-semibold text-zinc-100 transition hover:border-orange-200/70 hover:text-orange-100",
              children: [
                /* @__PURE__ */ jsx(ArrowLeft, { size: 16 }),
                " Dashboard"
              ]
            }
          ),
          /* @__PURE__ */ jsxs(
            "button",
            {
              type: "button",
              onClick: () => setShowCreate((v) => !v),
              className: "inline-flex items-center gap-2 rounded-lg bg-orange-300 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-orange-200",
              children: [
                /* @__PURE__ */ jsx(Plus, { size: 16 }),
                " Post Request"
              ]
            }
          )
        ] })
      ] }) }),
      showCreate ? /* @__PURE__ */ jsxs("section", { className: "rounded-2xl border border-orange-200/30 bg-zinc-900/60 p-6", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between", children: [
          /* @__PURE__ */ jsx("h2", { className: "text-lg font-bold text-zinc-50", children: "Post a Collaboration Request" }),
          /* @__PURE__ */ jsx("button", { type: "button", onClick: () => setShowCreate(false), className: "rounded-lg border border-zinc-200/20 p-1.5 text-zinc-400 hover:text-zinc-50", children: /* @__PURE__ */ jsx(X, { size: 16 }) })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "mt-4 grid gap-3 sm:grid-cols-2", children: [
          /* @__PURE__ */ jsx(
            "input",
            {
              type: "text",
              value: createTitle,
              onChange: (e) => setCreateTitle(e.target.value),
              placeholder: "Project / collab title",
              className: "sm:col-span-2 rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-zinc-100 outline-none focus:border-orange-200/70"
            }
          ),
          /* @__PURE__ */ jsx(
            "textarea",
            {
              value: createDescription,
              onChange: (e) => setCreateDescription(e.target.value),
              rows: 4,
              placeholder: "Describe the project, goals, and what kind of collaborators you're looking for...",
              className: "sm:col-span-2 rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-orange-200/70 resize-none"
            }
          ),
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("label", { className: "mb-1 block text-xs font-medium text-zinc-400", children: "Skills Needed (comma-separated)" }),
            /* @__PURE__ */ jsx(
              "input",
              {
                type: "text",
                value: createSkills,
                onChange: (e) => setCreateSkills(e.target.value),
                placeholder: "Video editing, Copywriting, Design...",
                className: "w-full rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-zinc-100 outline-none focus:border-orange-200/70"
              }
            )
          ] }),
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("label", { className: "mb-1 block text-xs font-medium text-zinc-400", children: "Spots Available" }),
            /* @__PURE__ */ jsx(
              "input",
              {
                type: "number",
                min: "1",
                max: "20",
                value: createSpots,
                onChange: (e) => setCreateSpots(e.target.value),
                className: "w-full rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-zinc-100 outline-none focus:border-orange-200/70"
              }
            )
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "sm:col-span-2", children: [
            /* @__PURE__ */ jsx("label", { className: "mb-1 block text-xs font-medium text-zinc-400", children: "Project URL (optional)" }),
            /* @__PURE__ */ jsx(
              "input",
              {
                type: "url",
                value: createUrl,
                onChange: (e) => setCreateUrl(e.target.value),
                placeholder: "https://...",
                className: "w-full rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-zinc-100 outline-none focus:border-orange-200/70"
              }
            )
          ] })
        ] }),
        error ? /* @__PURE__ */ jsx("p", { className: "mt-3 rounded-lg border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200", children: error }) : null,
        /* @__PURE__ */ jsxs(
          "button",
          {
            type: "button",
            onClick: () => {
              void handleCreate();
            },
            disabled: createBusy,
            className: "mt-4 inline-flex items-center gap-2 rounded-lg bg-orange-300 px-4 py-2 font-semibold text-zinc-950 transition hover:bg-orange-200 disabled:opacity-70",
            children: [
              /* @__PURE__ */ jsx(Briefcase, { size: 16 }),
              " ",
              createBusy ? "Posting..." : "Post Request"
            ]
          }
        )
      ] }) : null,
      error && !showCreate ? /* @__PURE__ */ jsx("p", { className: "rounded-lg border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200", children: error }) : null,
      /* @__PURE__ */ jsx("div", { className: "flex flex-wrap gap-1 rounded-xl border border-zinc-200/15 bg-zinc-900/60 p-1", children: [
        { key: "browse", label: "Browse", count: browseRequests.length },
        { key: "my-projects", label: "My Projects", count: myRequests.length },
        { key: "my-applications", label: "My Applications", count: myApplications.length }
      ].map(({ key, label, count }) => /* @__PURE__ */ jsxs(
        "button",
        {
          type: "button",
          onClick: () => setTab(key),
          className: `flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition ${tab === key ? "bg-orange-300 text-zinc-950" : "text-zinc-300 hover:text-zinc-50"}`,
          children: [
            label,
            count > 0 ? /* @__PURE__ */ jsx("span", { className: `rounded-full px-1.5 py-0.5 text-xs ${tab === key ? "bg-zinc-950/20" : "bg-zinc-700"}`, children: count }) : null
          ]
        },
        key
      )) }),
      tab !== "my-applications" ? /* @__PURE__ */ jsxs("div", { className: "relative", children: [
        /* @__PURE__ */ jsx(Search, { size: 15, className: "absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" }),
        /* @__PURE__ */ jsx(
          "input",
          {
            type: "text",
            value: search,
            onChange: (e) => setSearch(e.target.value),
            placeholder: "Search by title, description, or skill...",
            className: "w-full rounded-lg border border-zinc-200/20 bg-zinc-900/60 py-2 pl-9 pr-3 text-sm text-zinc-100 outline-none transition focus:border-orange-200/70"
          }
        )
      ] }) : null,
      loading ? /* @__PURE__ */ jsx("p", { className: "text-zinc-400", children: "Loading..." }) : null,
      !loading && tab !== "my-applications" ? /* @__PURE__ */ jsx("div", { className: "space-y-4", children: displayed.length === 0 ? /* @__PURE__ */ jsxs("div", { className: "rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-8 text-center", children: [
        /* @__PURE__ */ jsx(Briefcase, { size: 28, className: "mx-auto mb-3 text-zinc-500" }),
        /* @__PURE__ */ jsx("p", { className: "font-semibold text-zinc-300", children: tab === "browse" ? "No open collab requests right now." : "You haven't posted any requests yet." }),
        tab === "my-projects" ? /* @__PURE__ */ jsxs(
          "button",
          {
            type: "button",
            onClick: () => setShowCreate(true),
            className: "mt-4 inline-flex items-center gap-2 rounded-lg bg-orange-300 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-orange-200",
            children: [
              /* @__PURE__ */ jsx(Plus, { size: 14 }),
              " Post Your First Request"
            ]
          }
        ) : null
      ] }) : displayed.map((req) => /* @__PURE__ */ jsx(
        RequestCard,
        {
          req,
          onApply: setApplyTarget,
          onViewApplicants: setApplicantsTarget,
          onClose: handleClose,
          onDelete: handleDelete
        },
        req.id
      )) }) : null,
      !loading && tab === "my-applications" ? /* @__PURE__ */ jsx("div", { className: "space-y-3", children: myApplications.length === 0 ? /* @__PURE__ */ jsxs("div", { className: "rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-8 text-center", children: [
        /* @__PURE__ */ jsx(Clock, { size: 28, className: "mx-auto mb-3 text-zinc-500" }),
        /* @__PURE__ */ jsx("p", { className: "font-semibold text-zinc-300", children: "No applications yet." }),
        /* @__PURE__ */ jsx("p", { className: "mt-1 text-sm text-zinc-500", children: "Browse open requests and apply to collaborate." })
      ] }) : myApplications.map((app) => /* @__PURE__ */ jsxs("article", { className: "rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-4", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex items-start justify-between gap-3 flex-wrap", children: [
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("h3", { className: "font-semibold text-zinc-50", children: app.requestTitle || "Unknown Project" }),
            /* @__PURE__ */ jsxs("p", { className: "text-xs text-zinc-500", children: [
              "by ",
              app.requestOwner?.split("@")[0] || "—"
            ] }),
            app.message ? /* @__PURE__ */ jsxs("p", { className: "mt-1.5 text-sm text-zinc-400 italic", children: [
              '"',
              app.message,
              '"'
            ] }) : null
          ] }),
          /* @__PURE__ */ jsx("span", { className: statusBadge(app.status), children: app.status })
        ] }),
        /* @__PURE__ */ jsxs("p", { className: "mt-2 text-xs text-zinc-500", children: [
          "Applied ",
          new Date(app.applied_at).toLocaleDateString()
        ] })
      ] }, app.id)) }) : null
    ] }),
    applyTarget ? /* @__PURE__ */ jsx(
      ApplyModal,
      {
        request: applyTarget,
        onClose: () => setApplyTarget(null),
        onSuccess: () => {
          void Promise.all([loadBrowse(), loadMine(), loadApplications()]);
        }
      }
    ) : null,
    applicantsTarget ? /* @__PURE__ */ jsx(
      ApplicantsDrawer,
      {
        requestId: applicantsTarget.id,
        requestTitle: applicantsTarget.title,
        onClose: () => setApplicantsTarget(null)
      }
    ) : null
  ] });
}
const MODULES = [
  {
    id: "broadcast-infrastructure",
    title: "Broadcast Infrastructure",
    subtitle: "Content Production Layer",
    Icon: Radio,
    accentClass: "text-sky-400",
    bgClass: "bg-sky-400/10",
    borderClass: "border-sky-400/30",
    progressHex: "#38bdf8",
    items: [
      { id: "software-installed", label: "Broadcasting software installed and configured" },
      { id: "stable-internet", label: "Stable internet connection verified" },
      { id: "bitrate-optimized", label: "Bitrate matches upload speed" },
      { id: "scenes-created", label: "Scenes and overlays created" },
      { id: "test-stream", label: "Test stream completed successfully" }
    ]
  },
  {
    id: "digital-hub",
    title: "Centralized Digital Hub",
    subtitle: "Brand Infrastructure",
    Icon: Globe,
    accentClass: "text-violet-400",
    bgClass: "bg-violet-400/10",
    borderClass: "border-violet-400/30",
    progressHex: "#a78bfa",
    items: [
      { id: "website-created", label: "Website created and published" },
      { id: "socials-linked", label: "All social platforms linked" },
      { id: "stream-embedded", label: "Livestream embedded or linked" },
      { id: "monetization-links", label: "Monetization links active" }
    ]
  },
  {
    id: "monetization-engine",
    title: "Monetization Engine",
    subtitle: "Revenue Layer",
    Icon: DollarSign,
    accentClass: "text-emerald-400",
    bgClass: "bg-emerald-400/10",
    borderClass: "border-emerald-400/30",
    progressHex: "#34d399",
    items: [
      { id: "merch-store-created", label: "Merch store created" },
      { id: "products-published", label: "Products published (minimum viable catalog)" },
      { id: "payment-connected", label: "Payment processing connected" },
      { id: "store-linked", label: "Store linked to main hub" }
    ],
    insight: "Most small creators fail because they wait too long to monetize. Even a tiny audience can convert if the system exists early."
  },
  {
    id: "content-distribution",
    title: "Content Distribution System",
    subtitle: "Growth Layer",
    Icon: Share2,
    accentClass: "text-orange-400",
    bgClass: "bg-orange-400/10",
    borderClass: "border-orange-400/30",
    progressHex: "#fb923c",
    items: [
      { id: "content-schedule", label: "Weekly content schedule created" },
      { id: "posting-frequency", label: "Minimum posting frequency defined" },
      { id: "clips-extracted", label: "Clips extracted from streams" },
      { id: "cross-platform", label: "Content distributed across platforms" }
    ]
  },
  {
    id: "operational-system",
    title: "Operational System",
    subtitle: "Management Layer",
    Icon: Settings,
    accentClass: "text-rose-400",
    bgClass: "bg-rose-400/10",
    borderClass: "border-rose-400/30",
    progressHex: "#fb7185",
    items: [
      { id: "tasks-organized", label: "Tasks organized into system" },
      { id: "roles-defined", label: "Roles defined (even if solo)" },
      { id: "weekly-review", label: "Weekly review process established" },
      { id: "metrics-tracked", label: "Performance metrics tracked" }
    ]
  }
];
MODULES.reduce((sum, m) => sum + m.items.length, 0);
const TOOL_CONFIGS = {
  "bulletin-board": {
    key: "bulletin-board",
    title: "Bulletin Board",
    description: "Post important announcements, launches, and opportunities for your team.",
    helper: "Use short headlines and clear action items so everyone can execute quickly.",
    showDate: false,
    showAmount: false
  },
  "content-calendar": {
    key: "content-calendar",
    title: "Content Calendar",
    description: "Plan and track content outputs across platforms and campaigns.",
    helper: "Set a date for each item and move status from planned to done as you ship.",
    showDate: true,
    showAmount: false
  },
  "revenue-tracker": {
    key: "revenue-tracker",
    title: "Revenue Tracker",
    description: "Track revenue-related entries and outcomes over time.",
    helper: "Enter amount values in dollars to keep a clear running record of outcomes.",
    showDate: true,
    showAmount: true
  },
  "creator-task-board": {
    key: "creator-task-board",
    title: "Creator Task Board",
    description: "Manage weekly execution tasks and unblock momentum.",
    helper: "Keep tasks specific and outcome-focused; update status as work progresses.",
    showDate: true,
    showAmount: false
  },
  "collaboration-hub": {
    key: "collaboration-hub",
    title: "Collaboration Hub",
    description: "Track partner initiatives, co-marketing plans, and shared deliverables.",
    helper: "Document ownership and next actions for each collaboration.",
    showDate: true,
    showAmount: false
  },
  "knowledge-vault": {
    key: "knowledge-vault",
    title: "Knowledge Vault",
    description: "Store reusable frameworks, scripts, templates, and strategic notes.",
    helper: "Capture proven patterns so you can reuse what works.",
    showDate: false,
    showAmount: false
  },
  "promotion-hub": {
    key: "promotion-hub",
    title: "Promotion Hub",
    description: "Compose and schedule promotional posts across your linked social platforms.",
    helper: "Write once and distribute to Kick, Twitch, X, Instagram, and Threads.",
    showDate: true,
    showAmount: false
  },
  "merch-studio": {
    key: "merch-studio",
    title: "Merch Studio",
    description: "Submit mockups for review, track split percentages, and monitor your earnings.",
    helper: "Upload your designs, wait for admin approval, and track your payout history.",
    showDate: false,
    showAmount: false
  },
  "creator-growth-system": {
    key: "creator-growth-system",
    title: "Creator Growth System",
    description: "Track your creator operating system across 5 core modules.",
    helper: "Complete each module checklist to build a fully operational creator brand.",
    showDate: false,
    showAmount: false
  }
};
const statusOptions = ["idea", "planned", "active", "blocked", "done"];
function DashboardToolPage() {
  const params = Route.useParams();
  const parsedTool = toolSchema.safeParse(params.tool);
  if (!parsedTool.success) {
    throw notFound();
  }
  const toolKey = parsedTool.data;
  if (toolKey === "knowledge-vault") {
    return /* @__PURE__ */ jsx(KnowledgeVaultPage, {});
  }
  if (toolKey === "revenue-tracker") {
    return /* @__PURE__ */ jsx(RevenueTrackerPage, {});
  }
  if (toolKey === "collaboration-hub") {
    return /* @__PURE__ */ jsx(CollaborationHub, {});
  }
  if (toolKey === "promotion-hub") {
    return /* @__PURE__ */ jsx(PromotionHubPage, {});
  }
  if (toolKey === "merch-studio") {
    return /* @__PURE__ */ jsx(MerchStudioPage, {});
  }
  const config = TOOL_CONFIGS[toolKey];
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [status, setStatus] = useState("planned");
  const [eventDate, setEventDate] = useState("");
  const [amount, setAmount] = useState("");
  const createPayload = useMemo(() => ({
    title: title.trim(),
    details: details.trim(),
    status,
    eventDate: eventDate ? new Date(eventDate).toISOString() : null,
    amountCents: config.showAmount && amount ? Math.max(0, Math.round(Number(amount) * 100)) : null
  }), [title, details, status, eventDate, amount, config.showAmount]);
  const loadEntries = async () => {
    setError("");
    const response = await authedFetch(`/api/tools/${toolKey}`);
    const data = await response.json();
    if (!response.ok) {
      setError(data.error || "Failed to load tool entries.");
      return;
    }
    setEntries(data.entries || []);
  };
  useEffect(() => {
    void (async () => {
      try {
        setLoading(true);
        await loadEntries();
      } catch {
        setError("Failed to load tool entries.");
      } finally {
        setLoading(false);
      }
    })();
  }, [toolKey]);
  const createEntry = async () => {
    if (!createPayload.title) {
      setError("Title is required.");
      return;
    }
    try {
      setError("");
      setBusyId("new");
      const response = await authedFetch(`/api/tools/${toolKey}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(createPayload)
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || "Could not create entry.");
        return;
      }
      setTitle("");
      setDetails("");
      setStatus("planned");
      setEventDate("");
      setAmount("");
      await loadEntries();
    } catch {
      setError("Could not create entry.");
    } finally {
      setBusyId(null);
    }
  };
  const updateEntry = async (entry) => {
    try {
      setError("");
      setBusyId(entry.id);
      const response = await authedFetch(`/api/tools/${toolKey}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          id: entry.id,
          title: entry.title,
          details: entry.details,
          status: entry.status,
          eventDate: entry.event_date,
          amountCents: entry.amount_cents,
          metadata: entry.metadata
        })
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || "Could not update entry.");
        return;
      }
      await loadEntries();
    } catch {
      setError("Could not update entry.");
    } finally {
      setBusyId(null);
    }
  };
  const deleteEntry = async (id) => {
    try {
      setError("");
      setBusyId(id);
      const response = await authedFetch(`/api/tools/${toolKey}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          id
        })
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || "Could not delete entry.");
        return;
      }
      await loadEntries();
    } catch {
      setError("Could not delete entry.");
    } finally {
      setBusyId(null);
    }
  };
  return /* @__PURE__ */ jsx("div", { className: "min-h-screen px-4 py-10 text-zinc-100", children: /* @__PURE__ */ jsxs("div", { className: "mx-auto max-w-6xl space-y-6", children: [
    /* @__PURE__ */ jsx("header", { className: "rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-6", children: /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap items-center justify-between gap-4", children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("p", { className: "text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400", children: "Dashboard Tool" }),
        /* @__PURE__ */ jsx("h1", { className: "mt-2 text-3xl font-black text-zinc-50", children: config.title }),
        /* @__PURE__ */ jsx("p", { className: "mt-2 max-w-3xl text-sm text-zinc-300", children: config.description }),
        /* @__PURE__ */ jsx("p", { className: "mt-2 text-xs text-zinc-400", children: config.helper })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "flex gap-3", children: /* @__PURE__ */ jsxs(Link, { to: "/dashboard", className: "inline-flex items-center gap-2 rounded-lg border border-zinc-100/25 px-4 py-2 text-sm font-semibold text-zinc-100 transition hover:border-orange-200/70 hover:text-orange-100", children: [
        /* @__PURE__ */ jsx(ArrowLeft, { size: 16 }),
        " Dashboard"
      ] }) })
    ] }) }),
    /* @__PURE__ */ jsxs("section", { className: "rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-6", children: [
      /* @__PURE__ */ jsx("h2", { className: "text-xl font-semibold text-zinc-50", children: "Add Entry" }),
      /* @__PURE__ */ jsxs("div", { className: "mt-4 grid gap-3 md:grid-cols-2", children: [
        /* @__PURE__ */ jsx("input", { type: "text", value: title, onChange: (event) => setTitle(event.target.value), placeholder: "Entry title", className: "rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-zinc-100 outline-none transition focus:border-orange-200/70" }),
        /* @__PURE__ */ jsx("select", { value: status, onChange: (event) => setStatus(event.target.value), className: "rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-zinc-100 outline-none transition focus:border-orange-200/70", children: statusOptions.map((option) => /* @__PURE__ */ jsx("option", { value: option, children: option }, option)) }),
        config.showDate ? /* @__PURE__ */ jsx("input", { type: "datetime-local", value: eventDate, onChange: (event) => setEventDate(event.target.value), className: "rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-zinc-100 outline-none transition focus:border-orange-200/70" }) : null,
        config.showAmount ? /* @__PURE__ */ jsx("input", { type: "number", min: "0", step: "0.01", value: amount, onChange: (event) => setAmount(event.target.value), placeholder: "Amount (USD)", className: "rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-zinc-100 outline-none transition focus:border-orange-200/70" }) : null,
        /* @__PURE__ */ jsx("textarea", { value: details, onChange: (event) => setDetails(event.target.value), placeholder: "Details", rows: 4, className: "md:col-span-2 rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-zinc-100 outline-none transition focus:border-orange-200/70" })
      ] }),
      /* @__PURE__ */ jsxs("button", { type: "button", onClick: () => {
        void createEntry();
      }, disabled: busyId === "new", className: "mt-4 inline-flex items-center gap-2 rounded-lg bg-orange-300 px-4 py-2 font-semibold text-zinc-950 transition hover:bg-orange-200 disabled:cursor-not-allowed disabled:opacity-70", children: [
        /* @__PURE__ */ jsx(Plus, { size: 16 }),
        " ",
        busyId === "new" ? "Adding..." : "Add Entry"
      ] })
    ] }),
    error ? /* @__PURE__ */ jsx("p", { className: "rounded-lg border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200", children: error }) : null,
    /* @__PURE__ */ jsxs("section", { className: "space-y-3", children: [
      loading ? /* @__PURE__ */ jsx("p", { className: "text-zinc-300", children: "Loading entries..." }) : null,
      !loading && entries.length === 0 ? /* @__PURE__ */ jsx("article", { className: "rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-5 text-zinc-300", children: "No entries yet for this tool." }) : null,
      entries.map((entry) => /* @__PURE__ */ jsxs("article", { className: "rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-5", children: [
        /* @__PURE__ */ jsxs("div", { className: "grid gap-3 md:grid-cols-2", children: [
          /* @__PURE__ */ jsx("input", { type: "text", value: entry.title, onChange: (event) => {
            setEntries((current) => current.map((item) => item.id === entry.id ? {
              ...item,
              title: event.target.value
            } : item));
          }, className: "rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-zinc-100 outline-none transition focus:border-orange-200/70" }),
          /* @__PURE__ */ jsx("select", { value: entry.status, onChange: (event) => {
            setEntries((current) => current.map((item) => item.id === entry.id ? {
              ...item,
              status: event.target.value
            } : item));
          }, className: "rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-zinc-100 outline-none transition focus:border-orange-200/70", children: statusOptions.map((option) => /* @__PURE__ */ jsx("option", { value: option, children: option }, option)) }),
          config.showDate ? /* @__PURE__ */ jsx("input", { type: "datetime-local", value: entry.event_date ? new Date(entry.event_date).toISOString().slice(0, 16) : "", onChange: (event) => {
            setEntries((current) => current.map((item) => item.id === entry.id ? {
              ...item,
              event_date: event.target.value ? new Date(event.target.value).toISOString() : null
            } : item));
          }, className: "rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-zinc-100 outline-none transition focus:border-orange-200/70" }) : null,
          config.showAmount ? /* @__PURE__ */ jsx("input", { type: "number", min: "0", step: "0.01", value: entry.amount_cents === null ? "" : (entry.amount_cents / 100).toString(), onChange: (event) => {
            setEntries((current) => current.map((item) => item.id === entry.id ? {
              ...item,
              amount_cents: event.target.value ? Math.max(0, Math.round(Number(event.target.value) * 100)) : null
            } : item));
          }, className: "rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-zinc-100 outline-none transition focus:border-orange-200/70" }) : null,
          /* @__PURE__ */ jsx("textarea", { rows: 3, value: entry.details, onChange: (event) => {
            setEntries((current) => current.map((item) => item.id === entry.id ? {
              ...item,
              details: event.target.value
            } : item));
          }, className: "md:col-span-2 rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-zinc-100 outline-none transition focus:border-orange-200/70" })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "mt-3 flex items-center justify-between gap-3", children: [
          /* @__PURE__ */ jsxs("p", { className: "text-xs text-zinc-400", children: [
            "Updated ",
            new Date(entry.updated_at).toLocaleString()
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "flex gap-2", children: [
            /* @__PURE__ */ jsxs("button", { type: "button", onClick: () => {
              void updateEntry(entry);
            }, disabled: busyId === entry.id, className: "inline-flex items-center gap-2 rounded-lg border border-zinc-100/25 px-3 py-2 text-sm font-semibold text-zinc-100 transition hover:border-orange-200/70 hover:text-orange-100 disabled:cursor-not-allowed disabled:opacity-70", children: [
              /* @__PURE__ */ jsx(Save, { size: 14 }),
              " Save"
            ] }),
            /* @__PURE__ */ jsxs("button", { type: "button", onClick: () => {
              void deleteEntry(entry.id);
            }, disabled: busyId === entry.id, className: "inline-flex items-center gap-2 rounded-lg border border-rose-300/30 px-3 py-2 text-sm font-semibold text-rose-200 transition hover:border-rose-200 disabled:cursor-not-allowed disabled:opacity-70", children: [
              /* @__PURE__ */ jsx(Trash2, { size: 14 }),
              " Delete"
            ] })
          ] })
        ] })
      ] }, entry.id))
    ] })
  ] }) });
}
const VENUE_LABELS = {
  youtube: "YouTube / Video",
  tiktok: "TikTok / Reels",
  newsletter: "Newsletter / Email",
  course: "Digital Products",
  coaching: "Coaching / Consulting",
  merch: "Merch / Physical",
  affiliate: "Affiliate / Referral",
  membership: "Memberships",
  freelance: "Freelance / Services",
  events: "Events / Live",
  other: "Other"
};
const VENUE_COLORS = {
  youtube: "#ef4444",
  tiktok: "#ec4899",
  newsletter: "#f97316",
  course: "#8b5cf6",
  coaching: "#06b6d4",
  merch: "#10b981",
  affiliate: "#f59e0b",
  membership: "#6366f1",
  freelance: "#84cc16",
  events: "#14b8a6",
  other: "#9ca3af"
};
function parseRevenueEntry(entry) {
  return {
    id: entry.id,
    title: entry.title,
    details: entry.details,
    amount_cents: entry.amount_cents,
    event_date: entry.event_date,
    status: entry.status,
    venue: entry.metadata?.venue || "other",
    created_at: entry.created_at,
    updated_at: entry.updated_at
  };
}
function formatCents(cents) {
  if (cents === null || cents === 0) return "$0";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(cents / 100);
}
function AnimatedNumber({
  value,
  prefix = ""
}) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    if (value === 0) {
      setDisplay(0);
      return;
    }
    const start = Date.now();
    const duration = 900;
    const from = 0;
    const raf = (id) => id;
    let handle = raf(0);
    const step = () => {
      const elapsed = Date.now() - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(from + (value - from) * eased));
      if (progress < 1) {
        handle = requestAnimationFrame(step);
      }
    };
    handle = requestAnimationFrame(step);
    return () => cancelAnimationFrame(handle);
  }, [value]);
  return /* @__PURE__ */ jsxs("span", { children: [
    prefix,
    display.toLocaleString()
  ] });
}
function VenueBar({
  label,
  cents,
  maxCents,
  color
}) {
  const pct = maxCents > 0 ? cents / maxCents * 100 : 0;
  return /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3", children: [
    /* @__PURE__ */ jsx("span", { className: "w-32 shrink-0 truncate text-xs text-zinc-400", children: label }),
    /* @__PURE__ */ jsx("div", { className: "relative h-3 flex-1 overflow-hidden rounded-full bg-zinc-800", children: /* @__PURE__ */ jsx("div", { className: "absolute left-0 top-0 h-full rounded-full transition-all duration-700 ease-out", style: {
      width: `${pct}%`,
      backgroundColor: color
    } }) }),
    /* @__PURE__ */ jsx("span", { className: "w-20 shrink-0 text-right text-xs font-semibold text-zinc-200", children: formatCents(cents) })
  ] });
}
function RevenueTrackerPage() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [filterVenue, setFilterVenue] = useState("all");
  const [addTitle, setAddTitle] = useState("");
  const [addDetails, setAddDetails] = useState("");
  const [addAmount, setAddAmount] = useState("");
  const [addVenue, setAddVenue] = useState("other");
  const [addDate, setAddDate] = useState("");
  const [addStatus, setAddStatus] = useState("active");
  const loadEntries = async () => {
    const response = await authedFetch("/api/tools/revenue-tracker");
    if (!response.ok) {
      setError("Failed to load revenue entries.");
      return;
    }
    const data = await response.json();
    setEntries((data.entries || []).map(parseRevenueEntry));
  };
  useEffect(() => {
    void (async () => {
      try {
        setLoading(true);
        await loadEntries();
      } catch {
        setError("Failed to load revenue entries.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);
  const handleAdd = async () => {
    if (!addTitle.trim()) {
      setError("Title is required.");
      return;
    }
    try {
      setError("");
      setBusyId("new");
      const response = await authedFetch("/api/tools/revenue-tracker", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          title: addTitle.trim(),
          details: addDetails.trim(),
          status: addStatus,
          eventDate: addDate ? new Date(addDate).toISOString() : null,
          amountCents: addAmount ? Math.max(0, Math.round(Number(addAmount) * 100)) : null,
          metadata: {
            venue: addVenue
          }
        })
      });
      if (!response.ok) {
        const data = await response.json();
        setError(data.error || "Could not add entry.");
        return;
      }
      setAddTitle("");
      setAddDetails("");
      setAddAmount("");
      setAddDate("");
      setAddVenue("other");
      setAddStatus("active");
      setShowAddForm(false);
      await loadEntries();
    } catch {
      setError("Could not add entry.");
    } finally {
      setBusyId(null);
    }
  };
  const handleDelete = async (id) => {
    if (!confirm("Delete this revenue entry?")) return;
    try {
      setBusyId(id);
      const response = await authedFetch("/api/tools/revenue-tracker", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          id
        })
      });
      if (!response.ok) {
        setError("Could not delete entry.");
        return;
      }
      await loadEntries();
    } catch {
      setError("Could not delete entry.");
    } finally {
      setBusyId(null);
    }
  };
  const handleUpdate = async (entry, changes) => {
    try {
      setBusyId(entry.id);
      const updated = {
        ...entry,
        ...changes
      };
      const response = await authedFetch("/api/tools/revenue-tracker", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          id: updated.id,
          title: updated.title,
          details: updated.details,
          status: updated.status,
          eventDate: updated.event_date,
          amountCents: updated.amount_cents,
          metadata: {
            venue: updated.venue
          }
        })
      });
      if (!response.ok) {
        setError("Could not update entry.");
        return;
      }
      await loadEntries();
    } catch {
      setError("Could not update entry.");
    } finally {
      setBusyId(null);
    }
  };
  const totals = useMemo(() => {
    const now = /* @__PURE__ */ new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const yearStart = new Date(now.getFullYear(), 0, 1);
    let allTime = 0;
    let thisMonth = 0;
    let thisYear = 0;
    const byVenue = {};
    for (const e of entries) {
      const cents = e.amount_cents || 0;
      allTime += cents;
      const d = e.event_date ? new Date(e.event_date) : new Date(e.created_at);
      if (d >= monthStart) thisMonth += cents;
      if (d >= yearStart) thisYear += cents;
      byVenue[e.venue] = (byVenue[e.venue] || 0) + cents;
    }
    const maxVenueCents = Math.max(0, ...Object.values(byVenue).filter(Boolean));
    const sortedVenues = Object.entries(byVenue).sort((a, b) => b[1] - a[1]);
    return {
      allTime,
      thisMonth,
      thisYear,
      byVenue,
      maxVenueCents,
      sortedVenues
    };
  }, [entries]);
  const filtered = useMemo(() => filterVenue === "all" ? entries : entries.filter((e) => e.venue === filterVenue), [entries, filterVenue]);
  const venuesUsed = useMemo(() => Array.from(new Set(entries.map((e) => e.venue))), [entries]);
  return /* @__PURE__ */ jsx("div", { className: "min-h-screen px-4 py-10 text-zinc-100", children: /* @__PURE__ */ jsxs("div", { className: "mx-auto max-w-6xl space-y-6", children: [
    /* @__PURE__ */ jsx("header", { className: "rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-6", children: /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap items-center justify-between gap-4", children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("p", { className: "text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400", children: "My Revenue Tracker" }),
        /* @__PURE__ */ jsx("h1", { className: "mt-2 text-3xl font-black text-zinc-50", children: "Revenue Dashboard" }),
        /* @__PURE__ */ jsx("p", { className: "mt-1 text-sm text-zinc-400", children: "Track income from every venue in the organization. Your data is private to you." })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "flex gap-3", children: [
        /* @__PURE__ */ jsxs(Link, { to: "/dashboard", className: "inline-flex items-center gap-2 rounded-lg border border-zinc-100/25 px-4 py-2 text-sm font-semibold text-zinc-100 transition hover:border-orange-200/70 hover:text-orange-100", children: [
          /* @__PURE__ */ jsx(ArrowLeft, { size: 16 }),
          " Dashboard"
        ] }),
        /* @__PURE__ */ jsxs("button", { type: "button", onClick: () => setShowAddForm((v) => !v), className: "inline-flex items-center gap-2 rounded-lg bg-orange-300 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-orange-200", children: [
          /* @__PURE__ */ jsx(Plus, { size: 16 }),
          " Log Revenue"
        ] })
      ] })
    ] }) }),
    /* @__PURE__ */ jsx("div", { className: "grid gap-4 sm:grid-cols-3", children: [{
      label: "This Month",
      cents: totals.thisMonth,
      accent: "border-orange-300/40 bg-orange-300/5"
    }, {
      label: "This Year",
      cents: totals.thisYear,
      accent: "border-violet-300/40 bg-violet-300/5"
    }, {
      label: "All Time",
      cents: totals.allTime,
      accent: "border-emerald-300/40 bg-emerald-300/5"
    }].map(({
      label,
      cents,
      accent
    }) => /* @__PURE__ */ jsxs("article", { className: `rounded-2xl border p-5 ${accent}`, children: [
      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 text-zinc-400", children: [
        /* @__PURE__ */ jsx(TrendingUp, { size: 14 }),
        /* @__PURE__ */ jsx("span", { className: "text-xs font-semibold uppercase tracking-[0.15em]", children: label })
      ] }),
      /* @__PURE__ */ jsx("p", { className: "mt-3 text-3xl font-black tabular-nums text-zinc-50", children: loading ? "—" : /* @__PURE__ */ jsx(AnimatedNumber, { value: Math.round(cents / 100), prefix: "$" }) }),
      /* @__PURE__ */ jsxs("p", { className: "mt-1 text-xs text-zinc-500", children: [
        entries.filter((e) => {
          if (label === "All Time") return true;
          const now = /* @__PURE__ */ new Date();
          const d = e.event_date ? new Date(e.event_date) : new Date(e.created_at);
          if (label === "This Month") return d >= new Date(now.getFullYear(), now.getMonth(), 1);
          return d >= new Date(now.getFullYear(), 0, 1);
        }).length,
        " entries"
      ] })
    ] }, label)) }),
    totals.sortedVenues.length > 0 ? /* @__PURE__ */ jsxs("section", { className: "rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-6", children: [
      /* @__PURE__ */ jsx("h2", { className: "text-base font-bold text-zinc-50", children: "Revenue by Venue" }),
      /* @__PURE__ */ jsx("div", { className: "mt-5 space-y-3", children: totals.sortedVenues.map(([venue, cents]) => /* @__PURE__ */ jsx(VenueBar, { label: VENUE_LABELS[venue], cents, maxCents: totals.maxVenueCents, color: VENUE_COLORS[venue] }, venue)) })
    ] }) : null,
    showAddForm ? /* @__PURE__ */ jsxs("section", { className: "rounded-2xl border border-orange-200/30 bg-zinc-900/60 p-6 animate-in fade-in slide-in-from-top-2 duration-200", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between", children: [
        /* @__PURE__ */ jsx("h2", { className: "text-lg font-semibold text-zinc-50", children: "Log Revenue Entry" }),
        /* @__PURE__ */ jsx("button", { type: "button", onClick: () => setShowAddForm(false), className: "rounded-lg border border-zinc-200/20 p-1.5 text-zinc-400 transition hover:text-zinc-50", children: /* @__PURE__ */ jsx(X, { size: 16 }) })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "mt-4 grid gap-3 sm:grid-cols-2", children: [
        /* @__PURE__ */ jsx("input", { type: "text", value: addTitle, onChange: (e) => setAddTitle(e.target.value), placeholder: "Revenue source name (e.g. Course Sale)", className: "sm:col-span-2 rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-zinc-100 outline-none transition focus:border-orange-200/70" }),
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("label", { className: "mb-1 block text-xs font-medium text-zinc-400", children: "Venue" }),
          /* @__PURE__ */ jsx("select", { value: addVenue, onChange: (e) => setAddVenue(e.target.value), className: "w-full rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-zinc-100 outline-none transition focus:border-orange-200/70", children: Object.keys(VENUE_LABELS).map((v) => /* @__PURE__ */ jsx("option", { value: v, children: VENUE_LABELS[v] }, v)) })
        ] }),
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("label", { className: "mb-1 block text-xs font-medium text-zinc-400", children: "Amount (USD)" }),
          /* @__PURE__ */ jsx("input", { type: "number", min: "0", step: "0.01", value: addAmount, onChange: (e) => setAddAmount(e.target.value), placeholder: "0.00", className: "w-full rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-zinc-100 outline-none transition focus:border-orange-200/70" })
        ] }),
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("label", { className: "mb-1 block text-xs font-medium text-zinc-400", children: "Date Received" }),
          /* @__PURE__ */ jsx("input", { type: "date", value: addDate, onChange: (e) => setAddDate(e.target.value), className: "w-full rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-zinc-100 outline-none transition focus:border-orange-200/70" })
        ] }),
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("label", { className: "mb-1 block text-xs font-medium text-zinc-400", children: "Status" }),
          /* @__PURE__ */ jsx("select", { value: addStatus, onChange: (e) => setAddStatus(e.target.value), className: "w-full rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-zinc-100 outline-none transition focus:border-orange-200/70", children: statusOptions.map((s) => /* @__PURE__ */ jsx("option", { value: s, children: s }, s)) })
        ] }),
        /* @__PURE__ */ jsx("textarea", { value: addDetails, onChange: (e) => setAddDetails(e.target.value), placeholder: "Notes (optional)", rows: 3, className: "sm:col-span-2 rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-zinc-100 outline-none transition focus:border-orange-200/70" })
      ] }),
      error ? /* @__PURE__ */ jsx("p", { className: "mt-3 rounded-lg border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200", children: error }) : null,
      /* @__PURE__ */ jsxs("button", { type: "button", onClick: () => {
        void handleAdd();
      }, disabled: busyId === "new", className: "mt-4 inline-flex items-center gap-2 rounded-lg bg-orange-300 px-4 py-2 font-semibold text-zinc-950 transition hover:bg-orange-200 disabled:opacity-70", children: [
        /* @__PURE__ */ jsx(Plus, { size: 16 }),
        " ",
        busyId === "new" ? "Saving..." : "Log Revenue"
      ] })
    ] }) : null,
    error && !showAddForm ? /* @__PURE__ */ jsx("p", { className: "rounded-lg border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200", children: error }) : null,
    venuesUsed.length > 1 ? /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap gap-2", children: [
      /* @__PURE__ */ jsx("button", { type: "button", onClick: () => setFilterVenue("all"), className: `rounded-lg border px-3 py-1.5 text-sm font-medium transition ${filterVenue === "all" ? "border-orange-200/70 bg-orange-200/10 text-orange-100" : "border-zinc-200/20 text-zinc-300 hover:border-zinc-200/40"}`, children: "All Venues" }),
      venuesUsed.map((v) => /* @__PURE__ */ jsx("button", { type: "button", onClick: () => setFilterVenue(v), className: `rounded-lg border px-3 py-1.5 text-sm font-medium transition ${filterVenue === v ? "border-orange-200/70 bg-orange-200/10 text-orange-100" : "border-zinc-200/20 text-zinc-300 hover:border-zinc-200/40"}`, style: filterVenue === v ? {
        borderColor: VENUE_COLORS[v] + "80",
        color: VENUE_COLORS[v]
      } : {}, children: VENUE_LABELS[v] }, v))
    ] }) : null,
    loading ? /* @__PURE__ */ jsx("p", { className: "text-zinc-300", children: "Loading your revenue data..." }) : null,
    !loading && filtered.length === 0 ? /* @__PURE__ */ jsxs("article", { className: "rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-8 text-center", children: [
      /* @__PURE__ */ jsx("div", { className: "mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-zinc-200/20 bg-zinc-800", children: /* @__PURE__ */ jsx(TrendingUp, { size: 22, className: "text-zinc-400" }) }),
      /* @__PURE__ */ jsx("p", { className: "font-semibold text-zinc-200", children: "No revenue logged yet" }),
      /* @__PURE__ */ jsx("p", { className: "mt-1 text-sm text-zinc-500", children: 'Click "Log Revenue" to start tracking your income streams.' })
    ] }) : null,
    /* @__PURE__ */ jsx("div", { className: "space-y-3", children: filtered.map((entry) => /* @__PURE__ */ jsx(RevenueEntryCard, { entry, busy: busyId === entry.id, onUpdate: (changes) => {
      void handleUpdate(entry, changes);
    }, onDelete: () => {
      void handleDelete(entry.id);
    } }, entry.id)) })
  ] }) });
}
function RevenueEntryCard({
  entry,
  busy,
  onUpdate,
  onDelete
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(entry.title);
  const [details, setDetails] = useState(entry.details);
  const [amount, setAmount] = useState(entry.amount_cents !== null ? (entry.amount_cents / 100).toString() : "");
  const [venue, setVenue] = useState(entry.venue);
  const [date, setDate] = useState(entry.event_date ? new Date(entry.event_date).toISOString().split("T")[0] : "");
  const [status, setStatus] = useState(entry.status);
  const color = VENUE_COLORS[entry.venue] || "#9ca3af";
  if (!editing) {
    return /* @__PURE__ */ jsxs("article", { className: "group flex items-center gap-4 rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-4 transition hover:border-zinc-200/30", children: [
      /* @__PURE__ */ jsx("div", { className: "h-10 w-1 shrink-0 rounded-full", style: {
        backgroundColor: color
      } }),
      /* @__PURE__ */ jsxs("div", { className: "flex-1 min-w-0", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [
          /* @__PURE__ */ jsx("h3", { className: "font-semibold text-zinc-50 truncate", children: entry.title }),
          /* @__PURE__ */ jsx("span", { className: "rounded-full border px-2 py-0.5 text-xs font-medium", style: {
            borderColor: color + "60",
            color
          }, children: VENUE_LABELS[entry.venue] }),
          /* @__PURE__ */ jsx("span", { className: "rounded-full border border-zinc-200/20 px-2 py-0.5 text-xs text-zinc-400", children: entry.status })
        ] }),
        entry.details ? /* @__PURE__ */ jsx("p", { className: "mt-0.5 text-sm text-zinc-400 truncate", children: entry.details }) : null,
        entry.event_date ? /* @__PURE__ */ jsx("p", { className: "mt-0.5 text-xs text-zinc-500", children: new Date(entry.event_date).toLocaleDateString() }) : null
      ] }),
      /* @__PURE__ */ jsx("div", { className: "shrink-0 text-right", children: /* @__PURE__ */ jsx("p", { className: "text-xl font-black tabular-nums", style: {
        color
      }, children: formatCents(entry.amount_cents) }) }),
      /* @__PURE__ */ jsxs("div", { className: "flex shrink-0 gap-2 opacity-0 transition group-hover:opacity-100", children: [
        /* @__PURE__ */ jsx("button", { type: "button", onClick: () => setEditing(true), className: "rounded-lg border border-zinc-200/20 px-3 py-1.5 text-xs font-semibold text-zinc-100 transition hover:border-orange-200/60", children: "Edit" }),
        /* @__PURE__ */ jsx("button", { type: "button", onClick: onDelete, disabled: busy, className: "rounded-lg border border-rose-300/30 p-1.5 text-rose-300 transition hover:border-rose-200 disabled:opacity-50", children: /* @__PURE__ */ jsx(Trash2, { size: 14 }) })
      ] })
    ] });
  }
  return /* @__PURE__ */ jsxs("article", { className: "rounded-2xl border border-orange-200/30 bg-zinc-900/60 p-5", children: [
    /* @__PURE__ */ jsxs("div", { className: "grid gap-3 sm:grid-cols-2", children: [
      /* @__PURE__ */ jsx("input", { type: "text", value: title, onChange: (e) => setTitle(e.target.value), className: "sm:col-span-2 rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-zinc-100 outline-none transition focus:border-orange-200/70" }),
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("label", { className: "mb-1 block text-xs font-medium text-zinc-400", children: "Venue" }),
        /* @__PURE__ */ jsx("select", { value: venue, onChange: (e) => setVenue(e.target.value), className: "w-full rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-zinc-100 outline-none transition focus:border-orange-200/70", children: Object.keys(VENUE_LABELS).map((v) => /* @__PURE__ */ jsx("option", { value: v, children: VENUE_LABELS[v] }, v)) })
      ] }),
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("label", { className: "mb-1 block text-xs font-medium text-zinc-400", children: "Amount (USD)" }),
        /* @__PURE__ */ jsx("input", { type: "number", min: "0", step: "0.01", value: amount, onChange: (e) => setAmount(e.target.value), className: "w-full rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-zinc-100 outline-none transition focus:border-orange-200/70" })
      ] }),
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("label", { className: "mb-1 block text-xs font-medium text-zinc-400", children: "Date" }),
        /* @__PURE__ */ jsx("input", { type: "date", value: date, onChange: (e) => setDate(e.target.value), className: "w-full rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-zinc-100 outline-none transition focus:border-orange-200/70" })
      ] }),
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("label", { className: "mb-1 block text-xs font-medium text-zinc-400", children: "Status" }),
        /* @__PURE__ */ jsx("select", { value: status, onChange: (e) => setStatus(e.target.value), className: "w-full rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-zinc-100 outline-none transition focus:border-orange-200/70", children: statusOptions.map((s) => /* @__PURE__ */ jsx("option", { value: s, children: s }, s)) })
      ] }),
      /* @__PURE__ */ jsx("textarea", { value: details, onChange: (e) => setDetails(e.target.value), rows: 3, placeholder: "Notes", className: "sm:col-span-2 rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-zinc-100 outline-none transition focus:border-orange-200/70" })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "mt-3 flex gap-2", children: [
      /* @__PURE__ */ jsxs("button", { type: "button", onClick: () => {
        onUpdate({
          title,
          details,
          venue,
          status,
          event_date: date ? new Date(date).toISOString() : null,
          amount_cents: amount ? Math.max(0, Math.round(Number(amount) * 100)) : null
        });
        setEditing(false);
      }, disabled: busy, className: "inline-flex items-center gap-2 rounded-lg bg-orange-300 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-orange-200 disabled:opacity-70", children: [
        /* @__PURE__ */ jsx(Save, { size: 14 }),
        " ",
        busy ? "Saving..." : "Save"
      ] }),
      /* @__PURE__ */ jsx("button", { type: "button", onClick: () => setEditing(false), className: "rounded-lg border border-zinc-200/20 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:border-zinc-200/40", children: "Cancel" })
    ] })
  ] });
}
const CATEGORY_LABELS = {
  all: "All",
  tutorial: "Tutorial",
  document: "Document",
  template: "Template",
  guide: "Guide",
  script: "Script"
};
const DIFFICULTY_COLORS = {
  beginner: "text-emerald-300 border-emerald-300/40",
  intermediate: "text-orange-200 border-orange-200/40",
  advanced: "text-rose-300 border-rose-300/40"
};
function categoryIcon(category) {
  const size = 14;
  switch (category) {
    case "tutorial":
      return /* @__PURE__ */ jsx(GraduationCap, { size });
    case "document":
      return /* @__PURE__ */ jsx(FileText, { size });
    case "template":
      return /* @__PURE__ */ jsx(LayoutTemplate, { size });
    case "guide":
      return /* @__PURE__ */ jsx(BookOpen, { size });
    case "script":
      return /* @__PURE__ */ jsx(Tag, { size });
    default:
      return /* @__PURE__ */ jsx(FileText, { size });
  }
}
function parseDocMeta(entry) {
  const meta = entry.metadata || {};
  return {
    id: entry.id,
    title: entry.title,
    details: entry.details,
    category: meta.category || "document",
    difficulty: meta.difficulty || "beginner",
    tags: Array.isArray(meta.tags) ? meta.tags : [],
    file_url: typeof meta.file_url === "string" ? meta.file_url : null,
    view_count: typeof meta.view_count === "number" ? meta.view_count : 0,
    created_by: entry.created_by,
    updated_at: entry.updated_at
  };
}
function KnowledgeVaultPage() {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addTitle, setAddTitle] = useState("");
  const [addDetails, setAddDetails] = useState("");
  const [addCategory, setAddCategory] = useState("document");
  const [addDifficulty, setAddDifficulty] = useState("beginner");
  const [addTags, setAddTags] = useState("");
  const [addUrl, setAddUrl] = useState("");
  const [addBusy, setAddBusy] = useState(false);
  const loadDocs = async () => {
    const response = await authedFetch("/api/tools/knowledge-vault");
    if (!response.ok) {
      setError("Failed to load library.");
      return;
    }
    const data = await response.json();
    setDocs((data.entries || []).map(parseDocMeta));
  };
  useEffect(() => {
    void (async () => {
      try {
        setLoading(true);
        await loadDocs();
      } catch {
        setError("Failed to load library.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);
  const trackView = async (doc) => {
    setSelectedDoc(doc);
    void authedFetch("/api/knowledge-vault", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        documentId: doc.id
      })
    });
  };
  const handleAdd = async () => {
    if (!addTitle.trim()) {
      setError("Title is required.");
      return;
    }
    try {
      setError("");
      setAddBusy(true);
      const response = await authedFetch("/api/tools/knowledge-vault", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          title: addTitle.trim(),
          details: addDetails.trim(),
          status: "active",
          metadata: {
            category: addCategory,
            difficulty: addDifficulty,
            tags: addTags.split(",").map((t) => t.trim()).filter(Boolean),
            file_url: addUrl.trim() || null,
            view_count: 0
          }
        })
      });
      if (!response.ok) {
        const data = await response.json();
        setError(data.error || "Could not add document.");
        return;
      }
      setAddTitle("");
      setAddDetails("");
      setAddCategory("document");
      setAddDifficulty("beginner");
      setAddTags("");
      setAddUrl("");
      setShowAddForm(false);
      await loadDocs();
    } catch {
      setError("Could not add document.");
    } finally {
      setAddBusy(false);
    }
  };
  const handleDelete = async (id) => {
    if (!confirm("Delete this document from the library?")) return;
    try {
      const response = await authedFetch("/api/tools/knowledge-vault", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          id
        })
      });
      if (!response.ok) {
        setError("Could not delete document.");
        return;
      }
      if (selectedDoc?.id === id) setSelectedDoc(null);
      await loadDocs();
    } catch {
      setError("Could not delete document.");
    }
  };
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return docs.filter((doc) => {
      const matchesCategory = activeCategory === "all" || doc.category === activeCategory;
      const matchesSearch = !q || doc.title.toLowerCase().includes(q) || doc.details.toLowerCase().includes(q) || doc.tags.some((tag) => tag.toLowerCase().includes(q));
      return matchesCategory && matchesSearch;
    });
  }, [docs, activeCategory, search]);
  return /* @__PURE__ */ jsxs("div", { className: "min-h-screen px-4 py-10 text-zinc-100", children: [
    /* @__PURE__ */ jsxs("div", { className: "mx-auto max-w-7xl space-y-6", children: [
      /* @__PURE__ */ jsx("header", { className: "rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-6", children: /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap items-center justify-between gap-4", children: [
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("p", { className: "text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400", children: "Dashboard Tool" }),
          /* @__PURE__ */ jsx("h1", { className: "mt-2 text-3xl font-black text-zinc-50", children: "Knowledge Vault" }),
          /* @__PURE__ */ jsx("p", { className: "mt-2 max-w-3xl text-sm text-zinc-300", children: "Your organization's library of tutorials, guides, templates, and reusable frameworks." })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "flex gap-3", children: [
          /* @__PURE__ */ jsxs(Link, { to: "/dashboard", className: "inline-flex items-center gap-2 rounded-lg border border-zinc-100/25 px-4 py-2 text-sm font-semibold text-zinc-100 transition hover:border-orange-200/70 hover:text-orange-100", children: [
            /* @__PURE__ */ jsx(ArrowLeft, { size: 16 }),
            " Dashboard"
          ] }),
          /* @__PURE__ */ jsxs("button", { type: "button", onClick: () => setShowAddForm((v) => !v), className: "inline-flex items-center gap-2 rounded-lg bg-orange-300 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-orange-200", children: [
            /* @__PURE__ */ jsx(Plus, { size: 16 }),
            " Add Document"
          ] })
        ] })
      ] }) }),
      showAddForm ? /* @__PURE__ */ jsxs("section", { className: "rounded-2xl border border-orange-200/30 bg-zinc-900/60 p-6", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between", children: [
          /* @__PURE__ */ jsx("h2", { className: "text-lg font-semibold text-zinc-50", children: "Add to Library" }),
          /* @__PURE__ */ jsx("button", { type: "button", onClick: () => setShowAddForm(false), className: "rounded-lg border border-zinc-200/20 p-1.5 text-zinc-400 transition hover:text-zinc-50", children: /* @__PURE__ */ jsx(X, { size: 16 }) })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "mt-4 grid gap-3 md:grid-cols-2", children: [
          /* @__PURE__ */ jsx("input", { type: "text", value: addTitle, onChange: (e) => setAddTitle(e.target.value), placeholder: "Document title", className: "md:col-span-2 rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-zinc-100 outline-none transition focus:border-orange-200/70" }),
          /* @__PURE__ */ jsx("select", { value: addCategory, onChange: (e) => setAddCategory(e.target.value), className: "rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-zinc-100 outline-none transition focus:border-orange-200/70", children: ["document", "tutorial", "guide", "template", "script"].map((c) => /* @__PURE__ */ jsx("option", { value: c, children: CATEGORY_LABELS[c] }, c)) }),
          /* @__PURE__ */ jsxs("select", { value: addDifficulty, onChange: (e) => setAddDifficulty(e.target.value), className: "rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-zinc-100 outline-none transition focus:border-orange-200/70", children: [
            /* @__PURE__ */ jsx("option", { value: "beginner", children: "Beginner" }),
            /* @__PURE__ */ jsx("option", { value: "intermediate", children: "Intermediate" }),
            /* @__PURE__ */ jsx("option", { value: "advanced", children: "Advanced" })
          ] }),
          /* @__PURE__ */ jsx("input", { type: "text", value: addTags, onChange: (e) => setAddTags(e.target.value), placeholder: "Tags (comma-separated)", className: "rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-zinc-100 outline-none transition focus:border-orange-200/70" }),
          /* @__PURE__ */ jsx("input", { type: "url", value: addUrl, onChange: (e) => setAddUrl(e.target.value), placeholder: "External URL (optional)", className: "rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-zinc-100 outline-none transition focus:border-orange-200/70" }),
          /* @__PURE__ */ jsx("textarea", { value: addDetails, onChange: (e) => setAddDetails(e.target.value), placeholder: "Description or full content", rows: 5, className: "md:col-span-2 rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-zinc-100 outline-none transition focus:border-orange-200/70" })
        ] }),
        error ? /* @__PURE__ */ jsx("p", { className: "mt-3 rounded-lg border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200", children: error }) : null,
        /* @__PURE__ */ jsxs("button", { type: "button", onClick: () => {
          void handleAdd();
        }, disabled: addBusy, className: "mt-4 inline-flex items-center gap-2 rounded-lg bg-orange-300 px-4 py-2 font-semibold text-zinc-950 transition hover:bg-orange-200 disabled:opacity-70", children: [
          /* @__PURE__ */ jsx(Plus, { size: 16 }),
          " ",
          addBusy ? "Adding..." : "Add to Library"
        ] })
      ] }) : null,
      /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap gap-3", children: [
        /* @__PURE__ */ jsxs("div", { className: "relative flex-1 min-w-48", children: [
          /* @__PURE__ */ jsx(Search, { size: 15, className: "absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" }),
          /* @__PURE__ */ jsx("input", { type: "text", value: search, onChange: (e) => setSearch(e.target.value), placeholder: "Search library...", className: "w-full rounded-lg border border-zinc-200/20 bg-zinc-900/60 py-2 pl-9 pr-3 text-sm text-zinc-100 outline-none transition focus:border-orange-200/70" })
        ] }),
        /* @__PURE__ */ jsx("div", { className: "flex flex-wrap gap-2", children: Object.keys(CATEGORY_LABELS).map((cat) => /* @__PURE__ */ jsx("button", { type: "button", onClick: () => setActiveCategory(cat), className: `rounded-lg border px-3 py-1.5 text-sm font-medium transition ${activeCategory === cat ? "border-orange-200/70 bg-orange-200/10 text-orange-100" : "border-zinc-200/20 text-zinc-300 hover:border-zinc-200/40 hover:text-zinc-50"}`, children: CATEGORY_LABELS[cat] }, cat)) })
      ] }),
      loading ? /* @__PURE__ */ jsx("p", { className: "text-zinc-300", children: "Loading library..." }) : null,
      !loading && filtered.length === 0 ? /* @__PURE__ */ jsx("article", { className: "rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-8 text-center text-zinc-400", children: search || activeCategory !== "all" ? "No documents match your filter." : "No documents in the library yet. Add the first one." }) : null,
      /* @__PURE__ */ jsx("div", { className: "grid gap-4 md:grid-cols-2 lg:grid-cols-3", children: filtered.map((doc) => /* @__PURE__ */ jsxs("article", { className: "group flex flex-col rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-5 transition hover:border-orange-300/40", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex items-start justify-between gap-2", children: [
          /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 text-zinc-400", children: [
            categoryIcon(doc.category),
            /* @__PURE__ */ jsx("span", { className: "text-xs font-semibold uppercase tracking-[0.15em]", children: CATEGORY_LABELS[doc.category] })
          ] }),
          /* @__PURE__ */ jsx("span", { className: `rounded-full border px-2 py-0.5 text-xs font-medium ${DIFFICULTY_COLORS[doc.difficulty]}`, children: doc.difficulty })
        ] }),
        /* @__PURE__ */ jsx("h3", { className: "mt-3 text-base font-bold text-zinc-50 group-hover:text-orange-100", children: doc.title }),
        doc.details ? /* @__PURE__ */ jsx("p", { className: "mt-1.5 line-clamp-3 text-sm leading-relaxed text-zinc-400", children: doc.details }) : null,
        doc.tags.length > 0 ? /* @__PURE__ */ jsx("div", { className: "mt-3 flex flex-wrap gap-1.5", children: doc.tags.map((tag) => /* @__PURE__ */ jsx("span", { className: "rounded-full bg-zinc-800/80 px-2 py-0.5 text-xs text-zinc-400", children: tag }, tag)) }) : null,
        /* @__PURE__ */ jsxs("div", { className: "mt-auto pt-4 flex items-center justify-between gap-2", children: [
          /* @__PURE__ */ jsxs("span", { className: "flex items-center gap-1 text-xs text-zinc-500", children: [
            /* @__PURE__ */ jsx(Eye, { size: 12 }),
            " ",
            doc.view_count,
            " views"
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
            doc.file_url ? /* @__PURE__ */ jsxs("a", { href: doc.file_url, target: "_blank", rel: "noopener noreferrer", onClick: () => {
              void trackView(doc);
            }, className: "inline-flex items-center gap-1.5 rounded-lg border border-zinc-200/20 px-3 py-1.5 text-xs font-semibold text-zinc-100 transition hover:border-orange-200/60 hover:text-orange-100", children: [
              /* @__PURE__ */ jsx(ExternalLink, { size: 12 }),
              " Open"
            ] }) : null,
            /* @__PURE__ */ jsxs("button", { type: "button", onClick: () => {
              void trackView(doc);
            }, className: "inline-flex items-center gap-1.5 rounded-lg bg-orange-300/90 px-3 py-1.5 text-xs font-semibold text-zinc-950 transition hover:bg-orange-200", children: [
              /* @__PURE__ */ jsx(BookOpen, { size: 12 }),
              " Read"
            ] }),
            /* @__PURE__ */ jsx("button", { type: "button", onClick: () => {
              void handleDelete(doc.id);
            }, className: "rounded-lg p-1.5 text-zinc-500 transition hover:text-rose-300", "aria-label": "Delete document", children: /* @__PURE__ */ jsx(Trash2, { size: 14 }) })
          ] })
        ] })
      ] }, doc.id)) })
    ] }),
    selectedDoc ? /* @__PURE__ */ jsx("div", { className: "fixed inset-0 z-50 flex items-start justify-end bg-zinc-950/70 backdrop-blur-sm", onClick: () => setSelectedDoc(null), children: /* @__PURE__ */ jsxs("aside", { className: "relative flex h-full w-full max-w-xl flex-col overflow-y-auto bg-zinc-900 p-8 shadow-2xl", onClick: (e) => e.stopPropagation(), children: [
      /* @__PURE__ */ jsx("button", { type: "button", onClick: () => setSelectedDoc(null), className: "absolute right-5 top-5 rounded-lg border border-zinc-200/20 p-1.5 text-zinc-400 transition hover:text-zinc-50", children: /* @__PURE__ */ jsx(X, { size: 18 }) }),
      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 text-zinc-400", children: [
        categoryIcon(selectedDoc.category),
        /* @__PURE__ */ jsx("span", { className: "text-xs font-semibold uppercase tracking-[0.15em]", children: CATEGORY_LABELS[selectedDoc.category] }),
        /* @__PURE__ */ jsx("span", { className: `ml-auto rounded-full border px-2 py-0.5 text-xs font-medium ${DIFFICULTY_COLORS[selectedDoc.difficulty]}`, children: selectedDoc.difficulty })
      ] }),
      /* @__PURE__ */ jsx("h2", { className: "mt-4 text-2xl font-black text-zinc-50", children: selectedDoc.title }),
      selectedDoc.tags.length > 0 ? /* @__PURE__ */ jsx("div", { className: "mt-3 flex flex-wrap gap-2", children: selectedDoc.tags.map((tag) => /* @__PURE__ */ jsx("span", { className: "rounded-full bg-zinc-800/80 px-2.5 py-0.5 text-xs text-zinc-400", children: tag }, tag)) }) : null,
      /* @__PURE__ */ jsx("div", { className: "mt-6 flex-1 whitespace-pre-wrap text-sm leading-relaxed text-zinc-300", children: selectedDoc.details || "No content provided for this document." }),
      selectedDoc.file_url ? /* @__PURE__ */ jsxs("a", { href: selectedDoc.file_url, target: "_blank", rel: "noopener noreferrer", className: "mt-6 inline-flex items-center justify-center gap-2 rounded-lg bg-orange-300 px-4 py-2.5 font-semibold text-zinc-950 transition hover:bg-orange-200", children: [
        /* @__PURE__ */ jsx(ExternalLink, { size: 16 }),
        " Open Resource"
      ] }) : null,
      /* @__PURE__ */ jsxs("p", { className: "mt-4 text-xs text-zinc-500", children: [
        "Added by ",
        selectedDoc.created_by || "admin",
        " · Updated ",
        new Date(selectedDoc.updated_at).toLocaleDateString()
      ] })
    ] }) }) : null
  ] });
}
const PLATFORMS = [{
  key: "x",
  label: "X / Twitter",
  charLimit: 280,
  color: "text-zinc-100",
  intent: (text) => `https://x.com/intent/tweet?text=${encodeURIComponent(text)}`,
  prefix: "x.com",
  icon: /* @__PURE__ */ jsx("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "currentColor", "aria-hidden": "true", children: /* @__PURE__ */ jsx("path", { d: "M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.259 5.632zm-1.161 17.52h1.833L7.084 4.126H5.117z" }) })
}, {
  key: "threads",
  label: "Threads",
  charLimit: 500,
  color: "text-zinc-100",
  intent: null,
  prefix: "threads.net",
  icon: /* @__PURE__ */ jsx("svg", { width: "14", height: "14", viewBox: "0 0 192 192", fill: "currentColor", "aria-hidden": "true", children: /* @__PURE__ */ jsx("path", { d: "M141.537 88.988a66.667 66.667 0 0 0-2.518-1.143c-1.482-27.307-16.403-42.94-41.457-43.1h-.462c-14.967 0-27.406 6.396-35.116 18.05l13.678 9.384c5.751-8.734 14.793-10.608 21.459-10.608h.306c8.29.053 14.556 2.464 18.637 7.165 2.95 3.414 4.93 8.138 5.89 14.073-7.348-1.25-15.295-1.636-23.803-1.15-23.956 1.386-39.348 15.403-38.367 34.887.492 9.828 5.42 18.272 13.868 23.76 7.143 4.694 16.364 6.966 25.955 6.45 12.665-.689 22.616-5.529 29.575-14.391 5.29-6.904 8.637-15.831 10.093-27.116 6.05 3.658 10.529 8.493 13.019 14.41 4.276 10.164 4.521 26.867-8.793 40.18-11.813 11.81-26.04 16.923-47.454 17.078-23.786-.177-41.763-7.804-53.433-22.676C33.17 138.003 27.99 120.39 27.81 98c.18-22.39 5.36-40.003 15.385-52.346C54.865 30.83 72.842 23.203 96.628 23.026c23.947.178 42.227 7.84 54.348 22.775 5.958 7.376 10.441 16.365 13.378 26.713l15.919-4.229c-3.579-13.21-9.282-24.617-17.027-34.007C147.533 16.24 124.737 6.145 96.77 5.933h-.32C68.685 6.145 46.23 16.275 30.876 36.025 17.087 53.625 10.02 78.34 9.809 98c.211 19.66 7.278 44.373 21.067 61.974C46.23 179.724 68.684 189.854 96.45 190.067h.32c24.75-.195 42.183-6.693 56.506-21.012 18.798-18.794 18.207-42.306 12.023-56.8-4.386-10.43-12.8-18.931-23.762-23.267z" }) })
}, {
  key: "instagram",
  label: "Instagram",
  charLimit: 2200,
  color: "text-pink-300",
  intent: null,
  prefix: "instagram.com",
  icon: /* @__PURE__ */ jsx("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "currentColor", "aria-hidden": "true", children: /* @__PURE__ */ jsx("path", { d: "M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z" }) })
}, {
  key: "kick",
  label: "Kick",
  charLimit: 500,
  color: "text-[#53FC18]",
  intent: null,
  prefix: "kick.com",
  icon: /* @__PURE__ */ jsx("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "#53FC18", "aria-hidden": "true", children: /* @__PURE__ */ jsx("path", { d: "M2 2h5v8.5l5-8.5h6l-6 10 6 10h-6l-5-8.5V22H2z" }) })
}, {
  key: "twitch",
  label: "Twitch",
  charLimit: 500,
  color: "text-purple-300",
  intent: null,
  prefix: "twitch.tv",
  icon: /* @__PURE__ */ jsx("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "#9146FF", "aria-hidden": "true", children: /* @__PURE__ */ jsx("path", { d: "M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z" }) })
}];
function platformText(base, platform) {
  const limit = platform.charLimit;
  if (base.length <= limit) return base;
  return base.slice(0, limit - 1) + "…";
}
function PromotionHubPage() {
  const [message, setMessage] = useState("");
  const [selectedPlatforms, setSelectedPlatforms] = useState(/* @__PURE__ */ new Set(["x"]));
  const [scheduleDate, setScheduleDate] = useState("");
  const [copiedKey, setCopiedKey] = useState(null);
  const [scheduledPosts, setScheduledPosts] = useState([]);
  const [postsLoading, setPostsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [deletingId, setDeletingId] = useState(null);
  const copiedTimerRef = useRef(null);
  const loadPosts = async () => {
    try {
      const response = await authedFetch("/api/tools/promotion-hub");
      if (!response.ok) return;
      const data = await response.json();
      const parsed = (data.entries || []).map((e) => ({
        id: e.id,
        message: e.title,
        platforms: Array.isArray(e.metadata?.platforms) ? e.metadata.platforms : [],
        scheduled_at: e.event_date || e.created_at,
        status: e.status === "done" ? "sent" : e.status === "active" ? "queued" : e.status,
        created_at: e.created_at
      }));
      setScheduledPosts(parsed.sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()));
    } catch {
    } finally {
      setPostsLoading(false);
    }
  };
  useEffect(() => {
    void loadPosts();
  }, []);
  const togglePlatform = (key) => {
    setSelectedPlatforms((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };
  const copyForPlatform = (platform) => {
    const text = platformText(message, platform);
    void navigator.clipboard.writeText(text);
    if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    setCopiedKey(platform.key);
    copiedTimerRef.current = setTimeout(() => setCopiedKey(null), 2e3);
  };
  const openXIntent = () => {
    const platform = PLATFORMS.find((p) => p.key === "x");
    const text = platformText(message, platform);
    window.open(platform.intent(text), "_blank", "noopener,noreferrer");
  };
  const schedulePost = async () => {
    if (!message.trim()) {
      setSaveError("Please write a message first.");
      return;
    }
    if (selectedPlatforms.size === 0) {
      setSaveError("Select at least one platform.");
      return;
    }
    setSaving(true);
    setSaveError("");
    try {
      const response = await authedFetch("/api/tools/promotion-hub", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          title: message.trim().slice(0, 160),
          details: message.trim(),
          status: "planned",
          eventDate: scheduleDate ? new Date(scheduleDate).toISOString() : (/* @__PURE__ */ new Date()).toISOString(),
          metadata: {
            platforms: Array.from(selectedPlatforms)
          }
        })
      });
      if (!response.ok) {
        const err = await response.json();
        setSaveError(err.error || "Failed to schedule post.");
        return;
      }
      setMessage("");
      setScheduleDate("");
      await loadPosts();
    } catch {
      setSaveError("Unexpected error. Please try again.");
    } finally {
      setSaving(false);
    }
  };
  const deletePost = async (id) => {
    setDeletingId(id);
    try {
      await authedFetch("/api/tools/promotion-hub", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          id
        })
      });
      setScheduledPosts((prev) => prev.filter((p) => p.id !== id));
    } catch {
    } finally {
      setDeletingId(null);
    }
  };
  return /* @__PURE__ */ jsx("div", { className: "min-h-screen px-4 py-12 text-zinc-100", children: /* @__PURE__ */ jsxs("div", { className: "mx-auto max-w-5xl", children: [
    /* @__PURE__ */ jsx("div", { className: "mb-8 flex items-center justify-between gap-4", children: /* @__PURE__ */ jsxs("div", { children: [
      /* @__PURE__ */ jsxs(Link, { to: "/dashboard", className: "mb-3 inline-flex items-center gap-1.5 text-xs text-zinc-400 transition hover:text-zinc-100", children: [
        /* @__PURE__ */ jsx(ArrowLeft, { size: 13 }),
        " Back to Dashboard"
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3", children: [
        /* @__PURE__ */ jsx("div", { className: "rounded-md border border-zinc-200/20 bg-zinc-900/60 p-2 text-orange-200", children: /* @__PURE__ */ jsx(Megaphone, { size: 18 }) }),
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("h1", { className: "text-2xl font-black text-zinc-50", children: "Promotion Hub" }),
          /* @__PURE__ */ jsx("p", { className: "text-sm text-zinc-400", children: "Compose, preview, and schedule posts across your linked social platforms" })
        ] })
      ] })
    ] }) }),
    /* @__PURE__ */ jsxs("div", { className: "grid gap-6 lg:grid-cols-[1fr_380px]", children: [
      /* @__PURE__ */ jsxs("div", { className: "space-y-5", children: [
        /* @__PURE__ */ jsxs("section", { className: "rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-5", children: [
          /* @__PURE__ */ jsx("p", { className: "mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400", children: "Target Platforms" }),
          /* @__PURE__ */ jsx("div", { className: "flex flex-wrap gap-2", children: PLATFORMS.map((platform) => {
            const selected = selectedPlatforms.has(platform.key);
            return /* @__PURE__ */ jsxs("button", { type: "button", onClick: () => togglePlatform(platform.key), className: `flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-semibold transition ${selected ? "border-orange-200/60 bg-orange-200/10 text-orange-100" : "border-zinc-200/15 bg-zinc-800/40 text-zinc-400 hover:border-zinc-200/40 hover:text-zinc-100"}`, children: [
              /* @__PURE__ */ jsx("span", { className: platform.color, children: platform.icon }),
              platform.label,
              selected ? /* @__PURE__ */ jsx(Check, { size: 12, className: "text-orange-200" }) : null
            ] }, platform.key);
          }) })
        ] }),
        /* @__PURE__ */ jsxs("section", { className: "rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-5", children: [
          /* @__PURE__ */ jsx("p", { className: "mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400", children: "Message" }),
          /* @__PURE__ */ jsx("textarea", { value: message, onChange: (e) => setMessage(e.target.value), rows: 6, placeholder: "Write your promotional message here. It will be adapted to each platform's character limit automatically.", className: "w-full resize-none rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-4 py-3 text-sm text-zinc-100 outline-none transition focus:border-orange-200/70 placeholder:text-zinc-600" }),
          /* @__PURE__ */ jsx("div", { className: "mt-2 flex flex-wrap gap-3", children: PLATFORMS.filter((p) => selectedPlatforms.has(p.key)).map((p) => {
            platformText(message, p);
            const over = message.length > p.charLimit;
            return /* @__PURE__ */ jsxs("span", { className: `text-xs ${over ? "text-rose-300" : "text-zinc-500"}`, children: [
              p.label,
              ": ",
              Math.min(message.length, p.charLimit),
              "/",
              p.charLimit,
              over ? " (will trim)" : ""
            ] }, p.key);
          }) })
        ] }),
        message.trim() && selectedPlatforms.size > 0 ? /* @__PURE__ */ jsxs("section", { className: "rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-5", children: [
          /* @__PURE__ */ jsx("p", { className: "mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400", children: "Platform Previews" }),
          /* @__PURE__ */ jsx("div", { className: "space-y-4", children: PLATFORMS.filter((p) => selectedPlatforms.has(p.key)).map((platform) => {
            const text = platformText(message, platform);
            const isCopied = copiedKey === platform.key;
            return /* @__PURE__ */ jsxs("div", { className: "rounded-xl border border-zinc-200/10 bg-zinc-950/60 p-4", children: [
              /* @__PURE__ */ jsxs("div", { className: "mb-2 flex items-center justify-between gap-2", children: [
                /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
                  /* @__PURE__ */ jsx("span", { className: platform.color, children: platform.icon }),
                  /* @__PURE__ */ jsx("span", { className: "text-xs font-semibold text-zinc-300", children: platform.label }),
                  /* @__PURE__ */ jsxs("span", { className: "text-xs text-zinc-600", children: [
                    text.length,
                    "/",
                    platform.charLimit
                  ] })
                ] }),
                /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
                  platform.intent ? /* @__PURE__ */ jsxs("button", { type: "button", onClick: openXIntent, className: "flex items-center gap-1.5 rounded-lg border border-zinc-200/20 px-2.5 py-1 text-xs font-semibold text-zinc-200 transition hover:border-orange-200/50 hover:text-orange-100", children: [
                    /* @__PURE__ */ jsx(Send, { size: 11 }),
                    " Post Now"
                  ] }) : null,
                  /* @__PURE__ */ jsxs("button", { type: "button", onClick: () => copyForPlatform(platform), className: "flex items-center gap-1.5 rounded-lg border border-zinc-200/20 px-2.5 py-1 text-xs font-semibold text-zinc-200 transition hover:border-orange-200/50 hover:text-orange-100", children: [
                    isCopied ? /* @__PURE__ */ jsx(Check, { size: 11, className: "text-emerald-300" }) : /* @__PURE__ */ jsx(Copy, { size: 11 }),
                    isCopied ? "Copied!" : "Copy"
                  ] })
                ] })
              ] }),
              /* @__PURE__ */ jsx("p", { className: "whitespace-pre-wrap text-sm text-zinc-300", children: text }),
              !platform.intent ? /* @__PURE__ */ jsxs("p", { className: "mt-2 text-xs text-zinc-600", children: [
                "Copy this text and paste it into ",
                platform.prefix,
                " to post."
              ] }) : null
            ] }, platform.key);
          }) })
        ] }) : null,
        /* @__PURE__ */ jsxs("section", { className: "rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-5", children: [
          /* @__PURE__ */ jsx("p", { className: "mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400", children: "Schedule" }),
          /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap items-end gap-3", children: [
            /* @__PURE__ */ jsxs("div", { className: "flex-1 min-w-[200px]", children: [
              /* @__PURE__ */ jsx("label", { className: "mb-1.5 block text-xs font-medium text-zinc-400", children: /* @__PURE__ */ jsxs("span", { className: "flex items-center gap-1.5", children: [
                /* @__PURE__ */ jsx(Calendar, { size: 12 }),
                " Post date & time (optional)"
              ] }) }),
              /* @__PURE__ */ jsx("input", { type: "datetime-local", value: scheduleDate, onChange: (e) => setScheduleDate(e.target.value), className: "w-full rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-orange-200/70" })
            ] }),
            /* @__PURE__ */ jsxs("button", { type: "button", onClick: () => void schedulePost(), disabled: saving || !message.trim(), className: "flex items-center gap-2 rounded-lg bg-orange-300 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-orange-200 disabled:cursor-not-allowed disabled:opacity-60", children: [
              /* @__PURE__ */ jsx(Clock, { size: 14 }),
              saving ? "Saving..." : scheduleDate ? "Schedule Post" : "Add to Queue"
            ] })
          ] }),
          saveError ? /* @__PURE__ */ jsx("p", { className: "mt-2 text-xs text-rose-300", children: saveError }) : null,
          /* @__PURE__ */ jsx("p", { className: "mt-2 text-xs text-zinc-600", children: 'Posts are saved to your queue. X supports one-click posting via the "Post Now" button. For other platforms, use the Copy button and paste into the app.' })
        ] })
      ] }),
      /* @__PURE__ */ jsx("div", { children: /* @__PURE__ */ jsxs("section", { className: "rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-5", children: [
        /* @__PURE__ */ jsx("p", { className: "mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400", children: "Post Queue" }),
        postsLoading ? /* @__PURE__ */ jsx("p", { className: "text-sm text-zinc-400", children: "Loading queue..." }) : scheduledPosts.length === 0 ? /* @__PURE__ */ jsxs("div", { className: "rounded-xl border border-zinc-200/10 bg-zinc-950/40 p-4 text-center", children: [
          /* @__PURE__ */ jsx("p", { className: "text-sm text-zinc-500", children: "No posts queued yet." }),
          /* @__PURE__ */ jsx("p", { className: "mt-1 text-xs text-zinc-600", children: 'Compose a message and click "Add to Queue".' })
        ] }) : /* @__PURE__ */ jsx("div", { className: "space-y-3", children: scheduledPosts.map((post) => {
          const postPlatforms = PLATFORMS.filter((p) => post.platforms.includes(p.key));
          const scheduled = new Date(post.scheduled_at);
          const isPast = scheduled < /* @__PURE__ */ new Date();
          return /* @__PURE__ */ jsxs("div", { className: "rounded-xl border border-zinc-200/10 bg-zinc-950/40 p-3", children: [
            /* @__PURE__ */ jsxs("div", { className: "mb-2 flex items-start justify-between gap-2", children: [
              /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap gap-1", children: [
                postPlatforms.map((p) => /* @__PURE__ */ jsx("span", { className: `${p.color} flex items-center gap-1 text-xs`, children: p.icon }, p.key)),
                /* @__PURE__ */ jsx("span", { className: `rounded-full px-2 py-0.5 text-xs font-semibold ${post.status === "sent" ? "bg-emerald-300/10 text-emerald-300" : post.status === "failed" ? "bg-rose-300/10 text-rose-300" : isPast ? "bg-amber-300/10 text-amber-300" : "bg-zinc-200/10 text-zinc-400"}`, children: post.status === "sent" ? "Sent" : post.status === "failed" ? "Failed" : isPast ? "Past due" : "Queued" })
              ] }),
              /* @__PURE__ */ jsx("button", { type: "button", onClick: () => void deletePost(post.id), disabled: deletingId === post.id, className: "flex-shrink-0 rounded p-1 text-zinc-600 transition hover:text-rose-300 disabled:opacity-40", "aria-label": "Delete post", children: /* @__PURE__ */ jsx(Trash2, { size: 13 }) })
            ] }),
            /* @__PURE__ */ jsx("p", { className: "line-clamp-3 text-xs text-zinc-300", children: post.message }),
            /* @__PURE__ */ jsx("p", { className: "mt-1.5 text-xs text-zinc-600", children: scheduleDate ? scheduled.toLocaleString() : scheduled.toLocaleDateString() })
          ] }, post.id);
        }) })
      ] }) })
    ] })
  ] }) });
}
export {
  DashboardToolPage as component
};
