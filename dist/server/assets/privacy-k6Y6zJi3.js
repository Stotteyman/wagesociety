import { jsx, jsxs } from "react/jsx-runtime";
import { Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { r as readPolicyAcceptance, L as LEGAL_POLICY_LAST_UPDATED, a as LEGAL_POLICY_VERSION, b as LEGAL_POLICY_CHANGELOG, w as writePolicyAcceptance } from "./router-CSiXPOJe.js";
import "@supabase/supabase-js";
import "lucide-react";
import "stripe";
import "node:fs/promises";
import "node:path";
import "zod";
import "node:crypto";
const EFFECTIVE_DATE = "May 5, 2026";
function PrivacyPolicyPage() {
  const [acceptance, setAcceptance] = useState(null);
  useEffect(() => {
    setAcceptance(readPolicyAcceptance());
  }, []);
  const handleAccept = () => {
    writePolicyAcceptance("privacy");
    setAcceptance(readPolicyAcceptance());
  };
  return /* @__PURE__ */ jsx("main", { className: "mt-8 rounded-2xl border border-zinc-200/15 bg-zinc-900/70 p-6 sm:p-8", children: /* @__PURE__ */ jsxs("div", { className: "mx-auto max-w-3xl space-y-8 text-sm leading-relaxed text-zinc-300 sm:text-base", children: [
    /* @__PURE__ */ jsxs("header", { className: "space-y-3", children: [
      /* @__PURE__ */ jsx("h1", { className: "text-3xl font-black text-zinc-50 sm:text-4xl", children: "Privacy Policy" }),
      /* @__PURE__ */ jsxs("p", { children: [
        "Effective date: ",
        /* @__PURE__ */ jsx("span", { className: "font-semibold text-zinc-100", children: EFFECTIVE_DATE })
      ] }),
      /* @__PURE__ */ jsx("p", { children: 'This Privacy Policy describes how W.A.G.E. Society ("W.A.G.E. Society," "we," "our," or "us") collects, uses, stores, and shares personal information when you use wagesociety.com and related features, including member accounts, livestream tools, creator directory, blog/news features, and merchant and membership checkout.' })
    ] }),
    /* @__PURE__ */ jsxs("section", { className: "space-y-3", children: [
      /* @__PURE__ */ jsx("h2", { className: "text-xl font-bold text-zinc-50", children: "1. Information We Collect" }),
      /* @__PURE__ */ jsx("p", { children: "We collect information you provide directly and information generated through your use of the platform." }),
      /* @__PURE__ */ jsxs("ul", { className: "list-disc space-y-2 pl-5", children: [
        /* @__PURE__ */ jsx("li", { children: "Account data, such as email address and login details." }),
        /* @__PURE__ */ jsx("li", { children: "Profile and directory data, such as username, full name, profile image, and public profile content." }),
        /* @__PURE__ */ jsx("li", { children: "Community and content data, such as collaboration requests, blog/news content, comments, and uploads." }),
        /* @__PURE__ */ jsx("li", { children: "Support and admin communications, including moderation and appeals messages." }),
        /* @__PURE__ */ jsx("li", { children: "Transaction-related data for memberships and merch purchases, such as order and payment status." }),
        /* @__PURE__ */ jsx("li", { children: "Technical data, such as IP address, browser/device data, referring pages, and interaction logs." })
      ] }),
      /* @__PURE__ */ jsx("p", { children: "Payment card details are processed by Stripe and are not stored in full on our servers." })
    ] }),
    /* @__PURE__ */ jsxs("section", { className: "space-y-3", children: [
      /* @__PURE__ */ jsx("h2", { className: "text-xl font-bold text-zinc-50", children: "2. Authentication and Sign-In" }),
      /* @__PURE__ */ jsx("p", { children: "We support email/password authentication and social sign-in providers (such as Google and Kick) via Supabase Auth. When you sign in through an external provider, we receive basic account information associated with that provider account, subject to the provider's settings and policies." })
    ] }),
    /* @__PURE__ */ jsxs("section", { className: "space-y-3", children: [
      /* @__PURE__ */ jsx("h2", { className: "text-xl font-bold text-zinc-50", children: "3. How We Use Information" }),
      /* @__PURE__ */ jsxs("ul", { className: "list-disc space-y-2 pl-5", children: [
        /* @__PURE__ */ jsx("li", { children: "Provide, maintain, and secure the platform and member features." }),
        /* @__PURE__ */ jsx("li", { children: "Create and manage user accounts, permissions, and organization roles." }),
        /* @__PURE__ */ jsx("li", { children: "Process purchases, subscriptions, refunds, and related transaction records." }),
        /* @__PURE__ */ jsx("li", { children: "Power creator collaboration, directory visibility, and content publishing workflows." }),
        /* @__PURE__ */ jsx("li", { children: "Detect abuse, fraud, unauthorized access, and policy violations." }),
        /* @__PURE__ */ jsx("li", { children: "Communicate service notices, updates, and support responses." }),
        /* @__PURE__ */ jsx("li", { children: "Improve performance, reliability, and user experience." })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("section", { className: "space-y-3", children: [
      /* @__PURE__ */ jsx("h2", { className: "text-xl font-bold text-zinc-50", children: "4. Legal Bases (Where Applicable)" }),
      /* @__PURE__ */ jsx("p", { children: "Where data protection laws such as GDPR apply, we process personal data based on one or more of the following: performance of a contract, legitimate interests, legal obligations, and your consent where required." })
    ] }),
    /* @__PURE__ */ jsxs("section", { className: "space-y-3", children: [
      /* @__PURE__ */ jsx("h2", { className: "text-xl font-bold text-zinc-50", children: "5. Cookies, Local Storage, and Similar Technologies" }),
      /* @__PURE__ */ jsx("p", { children: "We and our service providers use cookies and browser storage to keep you signed in, store preferences, maintain security state, and improve site performance. You can control many of these settings in your browser, but disabling them may limit functionality." })
    ] }),
    /* @__PURE__ */ jsxs("section", { className: "space-y-3", children: [
      /* @__PURE__ */ jsx("h2", { className: "text-xl font-bold text-zinc-50", children: "6. How We Share Information" }),
      /* @__PURE__ */ jsx("p", { children: "We do not sell personal information. We may share data with:" }),
      /* @__PURE__ */ jsxs("ul", { className: "list-disc space-y-2 pl-5", children: [
        /* @__PURE__ */ jsx("li", { children: "Infrastructure and data platform providers (such as Netlify and Supabase)." }),
        /* @__PURE__ */ jsx("li", { children: "Payment processors (such as Stripe) to process transactions." }),
        /* @__PURE__ */ jsx("li", { children: "Authentication and identity providers (such as Google and Kick) for sign-in flows you initiate." }),
        /* @__PURE__ */ jsx("li", { children: "Professional advisors, legal authorities, or law enforcement when required by law." }),
        /* @__PURE__ */ jsx("li", { children: "Successors in a merger, acquisition, financing, or asset sale involving our business." })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("section", { className: "space-y-3", children: [
      /* @__PURE__ */ jsx("h2", { className: "text-xl font-bold text-zinc-50", children: "7. Data Retention" }),
      /* @__PURE__ */ jsx("p", { children: "We retain personal information for as long as needed to provide services, maintain security and business records, comply with legal obligations, and resolve disputes. Retention periods vary by data type, sensitivity, and legal requirements." })
    ] }),
    /* @__PURE__ */ jsxs("section", { className: "space-y-3", children: [
      /* @__PURE__ */ jsx("h2", { className: "text-xl font-bold text-zinc-50", children: "8. Your Rights and Choices" }),
      /* @__PURE__ */ jsx("p", { children: "Depending on your location, you may have rights to access, correct, delete, or export your personal data." }),
      /* @__PURE__ */ jsx("p", { children: "You may also have rights to object to or restrict certain processing, and to withdraw consent where processing is consent-based. To make a privacy request, contact us using the details below." })
    ] }),
    /* @__PURE__ */ jsxs("section", { className: "space-y-3", children: [
      /* @__PURE__ */ jsx("h2", { className: "text-xl font-bold text-zinc-50", children: "9. Children's Privacy" }),
      /* @__PURE__ */ jsx("p", { children: "Our services are not directed to children under 13 (or a higher age where required by local law), and we do not knowingly collect personal data from children." })
    ] }),
    /* @__PURE__ */ jsxs("section", { className: "space-y-3", children: [
      /* @__PURE__ */ jsx("h2", { className: "text-xl font-bold text-zinc-50", children: "10. International Transfers" }),
      /* @__PURE__ */ jsx("p", { children: "Your information may be processed in countries other than your own. Where required, we use safeguards to protect personal information transferred across borders." })
    ] }),
    /* @__PURE__ */ jsxs("section", { className: "space-y-3", children: [
      /* @__PURE__ */ jsx("h2", { className: "text-xl font-bold text-zinc-50", children: "11. Security" }),
      /* @__PURE__ */ jsx("p", { children: "We use technical and organizational measures designed to protect personal information, including access controls and authentication safeguards. No method of transmission or storage is completely secure." })
    ] }),
    /* @__PURE__ */ jsxs("section", { className: "space-y-3", children: [
      /* @__PURE__ */ jsx("h2", { className: "text-xl font-bold text-zinc-50", children: "12. Changes to This Policy" }),
      /* @__PURE__ */ jsx("p", { children: "We may update this Privacy Policy from time to time. We will post the updated version here and revise the effective date above. Material updates may also be communicated through the platform." })
    ] }),
    /* @__PURE__ */ jsxs("section", { className: "space-y-3", children: [
      /* @__PURE__ */ jsx("h2", { className: "text-xl font-bold text-zinc-50", children: "13. Policy Version and Changelog" }),
      /* @__PURE__ */ jsxs("p", { children: [
        "Current policy version:",
        " ",
        /* @__PURE__ */ jsx("span", { className: "font-semibold text-zinc-100", children: LEGAL_POLICY_VERSION }),
        " ",
        "(updated ",
        LEGAL_POLICY_LAST_UPDATED,
        ")."
      ] }),
      /* @__PURE__ */ jsx("div", { className: "overflow-hidden rounded-xl border border-zinc-200/15", children: /* @__PURE__ */ jsxs("table", { className: "w-full text-left text-sm", children: [
        /* @__PURE__ */ jsx("thead", { className: "bg-zinc-900/70 text-zinc-200", children: /* @__PURE__ */ jsxs("tr", { children: [
          /* @__PURE__ */ jsx("th", { className: "px-3 py-2", children: "Version" }),
          /* @__PURE__ */ jsx("th", { className: "px-3 py-2", children: "Date" }),
          /* @__PURE__ */ jsx("th", { className: "px-3 py-2", children: "Summary" })
        ] }) }),
        /* @__PURE__ */ jsx("tbody", { children: LEGAL_POLICY_CHANGELOG.map((entry) => /* @__PURE__ */ jsxs("tr", { className: "border-t border-zinc-200/10", children: [
          /* @__PURE__ */ jsx("td", { className: "px-3 py-2 font-semibold text-zinc-100", children: entry.version }),
          /* @__PURE__ */ jsx("td", { className: "px-3 py-2", children: entry.date }),
          /* @__PURE__ */ jsx("td", { className: "px-3 py-2", children: entry.summary })
        ] }, entry.version)) })
      ] }) })
    ] }),
    /* @__PURE__ */ jsxs("section", { className: "space-y-3", children: [
      /* @__PURE__ */ jsx("h2", { className: "text-xl font-bold text-zinc-50", children: "14. Acceptance Tracking" }),
      /* @__PURE__ */ jsx("p", { children: "You can record your acceptance of the current legal policy version in this browser. This creates a local browser record for convenience and does not replace formal contractual requirements." }),
      acceptance ? /* @__PURE__ */ jsxs("p", { className: "rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-emerald-200", children: [
        "Accepted version ",
        acceptance.version,
        " on ",
        new Date(acceptance.acceptedAtIso).toLocaleString(),
        " via",
        " ",
        acceptance.source,
        "."
      ] }) : /* @__PURE__ */ jsx("p", { className: "rounded-lg border border-zinc-200/15 bg-zinc-900/50 px-3 py-2 text-zinc-300", children: "No local acceptance record saved yet." }),
      /* @__PURE__ */ jsxs("button", { type: "button", onClick: handleAccept, className: "rounded-lg bg-orange-300 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-orange-200", children: [
        "I Accept Policy v",
        LEGAL_POLICY_VERSION
      ] })
    ] }),
    /* @__PURE__ */ jsxs("section", { className: "space-y-3", children: [
      /* @__PURE__ */ jsx("h2", { className: "text-xl font-bold text-zinc-50", children: "15. Contact Us" }),
      /* @__PURE__ */ jsxs("p", { children: [
        "For privacy questions or requests, email",
        " ",
        /* @__PURE__ */ jsx("a", { className: "font-semibold text-orange-200 hover:text-orange-100", href: "mailto:appeals@wagesociety.com", children: "appeals@wagesociety.com" }),
        "."
      ] }),
      /* @__PURE__ */ jsxs("p", { children: [
        "You can also review our",
        " ",
        /* @__PURE__ */ jsx(Link, { to: "/terms", className: "font-semibold text-orange-200 hover:text-orange-100", children: "Terms of Service" }),
        "."
      ] })
    ] })
  ] }) });
}
export {
  PrivacyPolicyPage as component
};
