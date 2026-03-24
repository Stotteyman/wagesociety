import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { ChevronDown } from 'lucide-react'

export const Route = createFileRoute('/faq')({
  component: FAQ,
})

const faqs = [
  {
    question: 'What is W.A.G.E. Society?',
    answer:
      'W.A.G.E. Society is a members-only clubhouse platform for live-streaming, online entertainment, and community interaction. It combines secure member access, live events, chat rooms, and link sharing in one experience.',
  },
  {
    question: 'How does member authentication work?',
    answer:
      'Members sign in through a secure login flow that unlocks private clubhouse areas. Access controls can be configured for different member tiers, moderators, and creators.',
  },
  {
    question: 'Is there a dedicated community chat area?',
    answer:
      'Yes. W.A.G.E. Society includes real-time chat channels where members can react during streams, join topic lounges, and participate in hosted conversations.',
  },
  {
    question: 'Can members share links and content drops?',
    answer:
      'Yes. Members can post and discuss links to clips, playlists, event pages, and other entertainment content in curated channels designed for discovery.',
  },
  {
    question: 'How is live-streaming supported?',
    answer:
      'The platform supports live-stream highlights with featured schedules, countdown windows, and now-live visibility so members can quickly jump into current events.',
  },
  {
    question: 'What types of entertainment content are featured?',
    answer:
      'W.A.G.E. Society is built for broad online entertainment culture including music, creator shows, gaming, sports watch sessions, and aftershow discussions.',
  },
  {
    question: 'Who is this platform designed for?',
    answer:
      'It is designed for online communities that want an energetic, branded clubhouse where audience engagement, live interaction, and content sharing happen together.',
  },
]

function FAQ() {
  return (
    <div className="min-h-screen px-4 py-20 text-zinc-100">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-center text-4xl font-black md:text-5xl">
          W.A.G.E. Society FAQ
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-center text-zinc-300">
          Answers about membership, authentication, chat, live-stream features,
          and entertainment community tools.
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

  return (
    <div className="overflow-hidden rounded-lg border border-zinc-200/15 bg-zinc-900/70">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-5 py-4 text-left transition hover:bg-zinc-800/70"
      >
        <span className="text-lg font-semibold text-zinc-100">{question}</span>
        <ChevronDown
          size={20}
          className={`text-zinc-300 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && <div className="px-5 pb-5 leading-relaxed text-zinc-300">{answer}</div>}
    </div>
  )
}
