import { jsx, jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
const faqs = [{
  question: "What is W.A.G.E. Society?",
  answer: "W.A.G.E. Society is a member-driven organization for content creators, online marketers, and entrepreneurs. It combines strategy resources, community accountability, and execution systems in one environment."
}, {
  question: "How does member authentication work?",
  answer: "Members sign in through a secure login flow that unlocks private organization areas. Access controls can be configured for different membership tracks, moderators, and leadership groups."
}, {
  question: "Do you provide collaboration channels for growth?",
  answer: "Yes. Members get access to collaboration channels for campaign feedback, launch planning, offer testing, and peer accountability sessions."
}, {
  question: "Can members share marketing assets and playbooks?",
  answer: "Yes. Members can share scripts, templates, funnels, swipe files, and curated links in structured channels designed for fast implementation."
}, {
  question: "Are there live sessions and trainings?",
  answer: "Yes. The organization runs live workshops, office hours, and strategy roundtables with schedules and reminders so members can join in real time."
}, {
  question: "What topics are covered inside the organization?",
  answer: "Core topics include content systems, online marketing, offers, audience growth, sales funnels, automation, and entrepreneurship operations."
}, {
  question: "Who is this platform designed for?",
  answer: "It is designed for creators, marketers, founders, and operators who want a focused organization where learning, implementation, and revenue growth happen together."
}];
function FAQ() {
  return /* @__PURE__ */ jsx("div", { className: "min-h-screen px-4 py-20 text-zinc-100", children: /* @__PURE__ */ jsxs("div", { className: "mx-auto max-w-3xl", children: [
    /* @__PURE__ */ jsx("h1", { className: "text-center text-4xl font-black md:text-5xl", children: "W.A.G.E. Society Organization FAQ" }),
    /* @__PURE__ */ jsx("p", { className: "mx-auto mt-4 max-w-2xl text-center text-zinc-300", children: "Answers about membership tracks, authentication, growth channels, live training, and creator business tools." }),
    /* @__PURE__ */ jsx("div", { className: "mt-14 space-y-3", children: faqs.map((faq) => /* @__PURE__ */ jsx(Accordion, { question: faq.question, answer: faq.answer }, faq.question)) })
  ] }) });
}
function Accordion({
  question,
  answer
}) {
  const [open, setOpen] = useState(false);
  const contentId = `faq-${question.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return /* @__PURE__ */ jsxs("div", { className: "overflow-hidden rounded-lg border border-zinc-200/15 bg-zinc-900/70", children: [
    /* @__PURE__ */ jsxs("button", { onClick: () => setOpen(!open), "aria-expanded": open, "aria-controls": contentId, className: "flex w-full items-center justify-between px-5 py-4 text-left transition hover:bg-zinc-800/70", children: [
      /* @__PURE__ */ jsx("span", { className: "text-lg font-semibold text-zinc-100", children: question }),
      /* @__PURE__ */ jsx(ChevronDown, { size: 20, className: `text-zinc-300 transition-transform ${open ? "rotate-180" : ""}` })
    ] }),
    open && /* @__PURE__ */ jsx("div", { id: contentId, className: "px-5 pb-5 leading-relaxed text-zinc-300", children: answer })
  ] });
}
export {
  FAQ as component
};
