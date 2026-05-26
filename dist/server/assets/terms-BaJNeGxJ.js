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
function TermsPage() {
  const [acceptance, setAcceptance] = useState(null);
  useEffect(() => {
    setAcceptance(readPolicyAcceptance());
  }, []);
  const handleAccept = () => {
    writePolicyAcceptance("terms");
    setAcceptance(readPolicyAcceptance());
  };
  return /* @__PURE__ */ jsx("main", { className: "mt-8 rounded-2xl border border-zinc-200/15 bg-zinc-900/70 p-6 sm:p-8", children: /* @__PURE__ */ jsxs("div", { className: "mx-auto max-w-3xl space-y-8 text-sm leading-relaxed text-zinc-300 sm:text-base", children: [
    /* @__PURE__ */ jsxs("header", { className: "space-y-3", children: [
      /* @__PURE__ */ jsx("h1", { className: "text-3xl font-black text-zinc-50 sm:text-4xl", children: "Terms of Service" }),
      /* @__PURE__ */ jsxs("p", { children: [
        "Effective date: ",
        /* @__PURE__ */ jsx("span", { className: "font-semibold text-zinc-100", children: EFFECTIVE_DATE })
      ] }),
      /* @__PURE__ */ jsx("p", { children: 'These Terms of Service ("Terms") are an agreement between you and W.A.G.E. Society ("W.A.G.E. Society," "we," "our," or "us") governing your use of wagesociety.com and related services, including account, community, directory, livestream, admin, and e-commerce features.' })
    ] }),
    /* @__PURE__ */ jsxs("section", { className: "space-y-3", children: [
      /* @__PURE__ */ jsx("h2", { className: "text-xl font-bold text-zinc-50", children: "1. Acceptance of Terms" }),
      /* @__PURE__ */ jsxs("p", { children: [
        "By accessing or using the services, you agree to these Terms and our",
        " ",
        /* @__PURE__ */ jsx(Link, { to: "/privacy", className: "font-semibold text-orange-200 hover:text-orange-100", children: "Privacy Policy" }),
        ". If you do not agree, do not use the services."
      ] })
    ] }),
    /* @__PURE__ */ jsxs("section", { className: "space-y-3", children: [
      /* @__PURE__ */ jsx("h2", { className: "text-xl font-bold text-zinc-50", children: "2. Eligibility and Accounts" }),
      /* @__PURE__ */ jsxs("ul", { className: "list-disc space-y-2 pl-5", children: [
        /* @__PURE__ */ jsx("li", { children: "You must be legally able to enter into a binding agreement to use the services." }),
        /* @__PURE__ */ jsx("li", { children: "You are responsible for maintaining the confidentiality of your login credentials." }),
        /* @__PURE__ */ jsx("li", { children: "You are responsible for all activity that occurs under your account." }),
        /* @__PURE__ */ jsx("li", { children: "You must provide accurate account information and keep it up to date." })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("section", { className: "space-y-3", children: [
      /* @__PURE__ */ jsx("h2", { className: "text-xl font-bold text-zinc-50", children: "3. Community Rules and Prohibited Conduct" }),
      /* @__PURE__ */ jsx("p", { children: "You agree not to:" }),
      /* @__PURE__ */ jsxs("ul", { className: "list-disc space-y-2 pl-5", children: [
        /* @__PURE__ */ jsx("li", { children: "Violate any law or regulation." }),
        /* @__PURE__ */ jsx("li", { children: "Infringe intellectual property, privacy, or other rights of others." }),
        /* @__PURE__ */ jsx("li", { children: "Post or transmit malicious code, spam, fraudulent content, or harmful material." }),
        /* @__PURE__ */ jsx("li", { children: "Attempt unauthorized access, scraping abuse, or disruption of platform operations." }),
        /* @__PURE__ */ jsx("li", { children: "Impersonate others or misrepresent your identity or affiliation." })
      ] }),
      /* @__PURE__ */ jsx("p", { children: "We may suspend or terminate access for violations, including abuse of community, moderation, or admin systems." })
    ] }),
    /* @__PURE__ */ jsxs("section", { className: "space-y-3", children: [
      /* @__PURE__ */ jsx("h2", { className: "text-xl font-bold text-zinc-50", children: "4. User Content" }),
      /* @__PURE__ */ jsx("p", { children: "You retain ownership of content you submit. You grant us a non-exclusive, worldwide, royalty-free license to host, store, process, display, and distribute your content as needed to operate and improve the services." }),
      /* @__PURE__ */ jsx("p", { children: "You represent that you have all rights necessary to submit your content and that your content does not violate laws or third-party rights." })
    ] }),
    /* @__PURE__ */ jsxs("section", { className: "space-y-3", children: [
      /* @__PURE__ */ jsx("h2", { className: "text-xl font-bold text-zinc-50", children: "5. Memberships, Purchases, and Billing" }),
      /* @__PURE__ */ jsxs("ul", { className: "list-disc space-y-2 pl-5", children: [
        /* @__PURE__ */ jsx("li", { children: "Membership and merch pricing is displayed at checkout and may be updated from time to time." }),
        /* @__PURE__ */ jsx("li", { children: "Payments are processed by third-party providers, including Stripe." }),
        /* @__PURE__ */ jsx("li", { children: "You authorize charges for orders and subscription renewals you initiate." }),
        /* @__PURE__ */ jsx("li", { children: "Taxes and fees may apply depending on your location and transaction type." })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("section", { className: "space-y-3", children: [
      /* @__PURE__ */ jsx("h2", { className: "text-xl font-bold text-zinc-50", children: "6. Refunds and Cancellations" }),
      /* @__PURE__ */ jsx("p", { children: "Unless required by law or stated otherwise at checkout, purchases may be non-refundable. You may cancel future recurring charges by managing your subscription before the next billing cycle." })
    ] }),
    /* @__PURE__ */ jsxs("section", { className: "space-y-3", children: [
      /* @__PURE__ */ jsx("h2", { className: "text-xl font-bold text-zinc-50", children: "7. Service Availability and Changes" }),
      /* @__PURE__ */ jsx("p", { children: "We may modify, suspend, or discontinue any part of the services at any time, with or without notice. We do not guarantee uninterrupted or error-free operation." })
    ] }),
    /* @__PURE__ */ jsxs("section", { className: "space-y-3", children: [
      /* @__PURE__ */ jsx("h2", { className: "text-xl font-bold text-zinc-50", children: "8. Third-Party Services" }),
      /* @__PURE__ */ jsx("p", { children: "The platform integrates with third-party services, including authentication and payment providers. Your use of those services is subject to their own terms and privacy policies." })
    ] }),
    /* @__PURE__ */ jsxs("section", { className: "space-y-3", children: [
      /* @__PURE__ */ jsx("h2", { className: "text-xl font-bold text-zinc-50", children: "9. Intellectual Property" }),
      /* @__PURE__ */ jsx("p", { children: "The services, including software, branding, and site content provided by us, are protected by intellectual property laws. Except as expressly permitted, you may not copy, modify, distribute, sell, or reverse engineer our services." })
    ] }),
    /* @__PURE__ */ jsxs("section", { className: "space-y-3", children: [
      /* @__PURE__ */ jsx("h2", { className: "text-xl font-bold text-zinc-50", children: "10. Disclaimers" }),
      /* @__PURE__ */ jsx("p", { children: 'The services are provided on an "as is" and "as available" basis. To the maximum extent permitted by law, we disclaim all warranties, express or implied, including merchantability, fitness for a particular purpose, and non-infringement.' })
    ] }),
    /* @__PURE__ */ jsxs("section", { className: "space-y-3", children: [
      /* @__PURE__ */ jsx("h2", { className: "text-xl font-bold text-zinc-50", children: "11. Limitation of Liability" }),
      /* @__PURE__ */ jsx("p", { children: "To the maximum extent permitted by law, W.A.G.E. Society and its affiliates will not be liable for indirect, incidental, special, consequential, exemplary, or punitive damages, or for loss of profits, revenues, data, or goodwill arising out of or related to your use of the services." })
    ] }),
    /* @__PURE__ */ jsxs("section", { className: "space-y-3", children: [
      /* @__PURE__ */ jsx("h2", { className: "text-xl font-bold text-zinc-50", children: "12. Indemnification" }),
      /* @__PURE__ */ jsx("p", { children: "You agree to defend, indemnify, and hold harmless W.A.G.E. Society and its affiliates from claims, liabilities, damages, losses, and expenses arising from your use of the services, your content, or your violation of these Terms." })
    ] }),
    /* @__PURE__ */ jsxs("section", { className: "space-y-3", children: [
      /* @__PURE__ */ jsx("h2", { className: "text-xl font-bold text-zinc-50", children: "13. Termination" }),
      /* @__PURE__ */ jsx("p", { children: "We may suspend or terminate your access at any time for violation of these Terms, security risk, legal requirements, or misuse of services. Sections that by nature should survive termination remain in effect." })
    ] }),
    /* @__PURE__ */ jsxs("section", { className: "space-y-3", children: [
      /* @__PURE__ */ jsx("h2", { className: "text-xl font-bold text-zinc-50", children: "14. Governing Law and Disputes" }),
      /* @__PURE__ */ jsx("p", { children: "These Terms are governed by applicable law in the jurisdiction where W.A.G.E. Society operates, without regard to conflict-of-law principles. You agree to resolve disputes in the applicable courts of that jurisdiction unless otherwise required by law." })
    ] }),
    /* @__PURE__ */ jsxs("section", { className: "space-y-3", children: [
      /* @__PURE__ */ jsx("h2", { className: "text-xl font-bold text-zinc-50", children: "15. Changes to Terms" }),
      /* @__PURE__ */ jsx("p", { children: "We may update these Terms from time to time. Updated Terms are effective when posted unless a later date is stated. Your continued use of the services after changes become effective means you accept the updated Terms." })
    ] }),
    /* @__PURE__ */ jsxs("section", { className: "space-y-3", children: [
      /* @__PURE__ */ jsx("h2", { className: "text-xl font-bold text-zinc-50", children: "16. Policy Version and Changelog" }),
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
      /* @__PURE__ */ jsx("h2", { className: "text-xl font-bold text-zinc-50", children: "17. Acceptance Tracking" }),
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
      /* @__PURE__ */ jsx("h2", { className: "text-xl font-bold text-zinc-50", children: "18. Contact" }),
      /* @__PURE__ */ jsxs("p", { children: [
        "Questions about these Terms can be sent to",
        " ",
        /* @__PURE__ */ jsx("a", { className: "font-semibold text-orange-200 hover:text-orange-100", href: "mailto:appeals@wagesociety.com", children: "appeals@wagesociety.com" }),
        "."
      ] })
    ] })
  ] }) });
}
export {
  TermsPage as component
};
