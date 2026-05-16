import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { ChevronDown } from 'lucide-react'

export const Route = createFileRoute('/faq')({
  head: () => ({
    meta: [
      { title: 'Organization FAQ — W.A.G.E. Society' },
      {
        name: 'description',
        content:
          'Answers about W.A.G.E. Society membership tracks, creator resources, marketing systems, and entrepreneur-focused community access.',
      },
      { property: 'og:title', content: 'Organization FAQ — W.A.G.E. Society' },
      {
        property: 'og:description',
        content: 'Everything you need to know about joining W.A.G.E. Society as a creator, marketer, or entrepreneur.',
      },
      { property: 'og:url', content: 'https://wagesociety.com/faq' },
    ],
    links: [{ rel: 'canonical', href: 'https://wagesociety.com/faq' }],
  }),
  component: FAQ,
})

const faqs = [
  {
    question: 'What is W.A.G.E. Society?',
    answer:
      'W.A.G.E. Society is a member-driven organization for content creators, online marketers, and entrepreneurs. It combines strategy resources, community accountability, and execution systems in one environment.',
  },
  {
    question: 'How does member authentication work?',
    answer:
      'Members sign in through a secure login flow that unlocks private organization areas. Access controls can be configured for different membership tracks, moderators, and leadership groups.',
  },
  {
    question: 'Do you provide collaboration channels for growth?',
    answer:
      'Yes. Members get access to collaboration channels for campaign feedback, launch planning, offer testing, and peer accountability sessions.',
  },
  {
    question: 'Can members share marketing assets and playbooks?',
    answer:
      'Yes. Members can share scripts, templates, funnels, swipe files, and curated links in structured channels designed for fast implementation.',
  },
  {
    question: 'Are there live sessions and trainings?',
    answer:
      'Yes. The organization runs live workshops, office hours, and strategy roundtables with schedules and reminders so members can join in real time.',
  },
  {
    question: 'What topics are covered inside the organization?',
    answer:
      'Core topics include content systems, online marketing, offers, audience growth, sales funnels, automation, and entrepreneurship operations.',
  },
  {
    question: 'Who is this platform designed for?',
    answer:
      'It is designed for creators, marketers, founders, and operators who want a focused organization where learning, implementation, and revenue growth happen together.',
  },
]

function FAQ() {
  return (
    <div className="min-h-screen px-4 py-20 text-zinc-100">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-center text-4xl font-black md:text-5xl">
          W.A.G.E. Society Organization FAQ
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-center text-zinc-300">
          Answers about membership tracks, authentication, growth channels,
          live training, and creator business tools.
        </p>
        <div className="mt-14 space-y-3">
          {faqs.map((faq) => (
            <Accordion key={faq.question} question={faq.question} answer={faq.answer} />
          ))}
        </div>
      </div>
    </div>
  )
}

function Accordion({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false)
  const contentId = `faq-${question.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`

  return (
    <div className="overflow-hidden rounded-lg border border-zinc-200/15 bg-zinc-900/70">
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls={contentId}
        className="flex w-full items-center justify-between px-5 py-4 text-left transition hover:bg-zinc-800/70"
      >
        <span className="text-lg font-semibold text-zinc-100">{question}</span>
        <ChevronDown
          size={20}
          className={`text-zinc-300 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div id={contentId} className="px-5 pb-5 leading-relaxed text-zinc-300">
          {answer}
        </div>
      )}
    </div>
  )
}
