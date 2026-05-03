import { useEffect, useState } from 'react'
import {
  CheckCircle2,
  ChevronDown,
  Circle,
  DollarSign,
  Globe,
  Radio,
  Settings,
  Share2,
  Target,
  Zap,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { getSupabaseBrowserClient } from '../lib/supabaseBrowser'

type ChecklistItem = { id: string; label: string }

type CGSModule = {
  id: string
  title: string
  subtitle: string
  Icon: LucideIcon
  accentClass: string
  bgClass: string
  borderClass: string
  progressHex: string
  items: ChecklistItem[]
  insight?: string
}

const MODULES: CGSModule[] = [
  {
    id: 'broadcast-infrastructure',
    title: 'Broadcast Infrastructure',
    subtitle: 'Content Production Layer',
    Icon: Radio,
    accentClass: 'text-sky-400',
    bgClass: 'bg-sky-400/10',
    borderClass: 'border-sky-400/30',
    progressHex: '#38bdf8',
    items: [
      { id: 'software-installed', label: 'Broadcasting software installed and configured' },
      { id: 'stable-internet', label: 'Stable internet connection verified' },
      { id: 'bitrate-optimized', label: 'Bitrate matches upload speed' },
      { id: 'scenes-created', label: 'Scenes and overlays created' },
      { id: 'test-stream', label: 'Test stream completed successfully' },
    ],
  },
  {
    id: 'digital-hub',
    title: 'Centralized Digital Hub',
    subtitle: 'Brand Infrastructure',
    Icon: Globe,
    accentClass: 'text-violet-400',
    bgClass: 'bg-violet-400/10',
    borderClass: 'border-violet-400/30',
    progressHex: '#a78bfa',
    items: [
      { id: 'website-created', label: 'Website created and published' },
      { id: 'socials-linked', label: 'All social platforms linked' },
      { id: 'stream-embedded', label: 'Livestream embedded or linked' },
      { id: 'monetization-links', label: 'Monetization links active' },
    ],
  },
  {
    id: 'monetization-engine',
    title: 'Monetization Engine',
    subtitle: 'Revenue Layer',
    Icon: DollarSign,
    accentClass: 'text-emerald-400',
    bgClass: 'bg-emerald-400/10',
    borderClass: 'border-emerald-400/30',
    progressHex: '#34d399',
    items: [
      { id: 'merch-store-created', label: 'Merch store created' },
      { id: 'products-published', label: 'Products published (minimum viable catalog)' },
      { id: 'payment-connected', label: 'Payment processing connected' },
      { id: 'store-linked', label: 'Store linked to main hub' },
    ],
    insight:
      'Most small creators fail because they wait too long to monetize. Even a tiny audience can convert if the system exists early.',
  },
  {
    id: 'content-distribution',
    title: 'Content Distribution System',
    subtitle: 'Growth Layer',
    Icon: Share2,
    accentClass: 'text-orange-400',
    bgClass: 'bg-orange-400/10',
    borderClass: 'border-orange-400/30',
    progressHex: '#fb923c',
    items: [
      { id: 'content-schedule', label: 'Weekly content schedule created' },
      { id: 'posting-frequency', label: 'Minimum posting frequency defined' },
      { id: 'clips-extracted', label: 'Clips extracted from streams' },
      { id: 'cross-platform', label: 'Content distributed across platforms' },
    ],
  },
  {
    id: 'operational-system',
    title: 'Operational System',
    subtitle: 'Management Layer',
    Icon: Settings,
    accentClass: 'text-rose-400',
    bgClass: 'bg-rose-400/10',
    borderClass: 'border-rose-400/30',
    progressHex: '#fb7185',
    items: [
      { id: 'tasks-organized', label: 'Tasks organized into system' },
      { id: 'roles-defined', label: 'Roles defined (even if solo)' },
      { id: 'weekly-review', label: 'Weekly review process established' },
      { id: 'metrics-tracked', label: 'Performance metrics tracked' },
    ],
  },
]

const TOTAL_ITEMS = MODULES.reduce((sum, m) => sum + m.items.length, 0)

function modProgress(mod: CGSModule, checked: Record<string, boolean>) {
  const done = mod.items.filter((item) => checked[`${mod.id}:${item.id}`]).length
  return { done, total: mod.items.length, pct: Math.round((done / mod.items.length) * 100) }
}

function getNextAction(
  checked: Record<string, boolean>,
): { moduleTitle: string; itemLabel: string } | null {
  for (const mod of MODULES) {
    for (const item of mod.items) {
      if (!checked[`${mod.id}:${item.id}`]) {
        return { moduleTitle: mod.title, itemLabel: item.label }
      }
    }
  }
  return null
}

export function CreatorGrowthSystem() {
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  const [expanded, setExpanded] = useState<string | null>('broadcast-infrastructure')
  const [storageKey, setStorageKey] = useState('cgs_progress_anon')

  useEffect(() => {
    const supabase = getSupabaseBrowserClient()
    void supabase.auth.getUser().then(({ data }) => {
      const key = data.user ? `cgs_progress_${data.user.id}` : 'cgs_progress_anon'
      setStorageKey(key)
      try {
        const saved = localStorage.getItem(key)
        if (saved) setChecked(JSON.parse(saved) as Record<string, boolean>)
      } catch {
        // ignore parse errors
      }
    })
  }, [])

  function toggle(key: string) {
    setChecked((prev) => {
      const next = { ...prev, [key]: !prev[key] }
      try {
        localStorage.setItem(storageKey, JSON.stringify(next))
      } catch {
        // ignore
      }
      return next
    })
  }

  const totalDone = Object.values(checked).filter(Boolean).length
  const overallPct = TOTAL_ITEMS > 0 ? Math.round((totalDone / TOTAL_ITEMS) * 100) : 0
  const nextAction = getNextAction(checked)
  const completedModules = MODULES.filter((m) => modProgress(m, checked).pct === 100).length

  return (
    <div className="mx-auto max-w-4xl space-y-5 px-1 py-2">
      {/* Score Header */}
      <div className="rounded-2xl border border-zinc-200/15 bg-zinc-900/70 p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-zinc-500">
              <Target size={13} />
              Creator System Score
            </div>
            <div className="mt-2 flex items-end gap-3">
              <span className="text-6xl font-black leading-none text-zinc-50">{overallPct}%</span>
              <span className="mb-1 text-sm text-zinc-500">
                {totalDone} / {TOTAL_ITEMS} tasks complete
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 sm:justify-end">
            {MODULES.map((mod) => {
              const { pct } = modProgress(mod, checked)
              return (
                <div
                  key={mod.id}
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium ${
                    pct === 100
                      ? 'border border-emerald-400/25 bg-emerald-400/10 text-emerald-400'
                      : 'border border-zinc-700 bg-zinc-800/60 text-zinc-400'
                  }`}
                >
                  <mod.Icon size={11} />
                  {pct === 100 ? (
                    <CheckCircle2 size={11} />
                  ) : (
                    <span>{pct}%</span>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Overall progress bar */}
        <div className="mt-5 h-3 w-full overflow-hidden rounded-full bg-zinc-800">
          <div
            className="h-3 rounded-full transition-all duration-700"
            style={{
              width: `${overallPct}%`,
              background: 'linear-gradient(to right, #f97316, #fdba74)',
            }}
          />
        </div>

        {/* Per-module segment bars */}
        <div className="mt-2 flex gap-1">
          {MODULES.map((mod) => {
            const { pct } = modProgress(mod, checked)
            return (
              <div key={mod.id} className="flex-1 overflow-hidden rounded-full bg-zinc-800" style={{ height: 4 }}>
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{ width: `${pct}%`, backgroundColor: mod.progressHex }}
                />
              </div>
            )
          })}
        </div>

        {overallPct === 100 && (
          <div className="mt-4 flex items-center gap-2 text-sm font-semibold text-emerald-400">
            <CheckCircle2 size={16} />
            Your creator system is fully operational.
          </div>
        )}
      </div>

      {/* Next Action */}
      {nextAction && (
        <div className="flex items-start gap-3 rounded-xl border border-orange-400/25 bg-orange-400/8 p-4">
          <div className="mt-0.5 shrink-0 rounded-lg bg-orange-400/15 p-1.5 text-orange-300">
            <Zap size={14} />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-orange-400/80">
              Recommended Next Action
            </p>
            <p className="mt-0.5 text-sm text-zinc-200">
              <span className="text-zinc-500">{nextAction.moduleTitle} › </span>
              {nextAction.itemLabel}
            </p>
          </div>
        </div>
      )}

      {/* Missing items summary */}
      {overallPct > 0 && overallPct < 100 && (
        <div className="rounded-xl border border-zinc-200/10 bg-zinc-900/50 p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Missing</p>
          <ul className="space-y-1">
            {MODULES.flatMap((mod) =>
              mod.items
                .filter((item) => !checked[`${mod.id}:${item.id}`])
                .slice(0, completedModules > 3 ? 5 : 2)
                .map((item) => (
                  <li key={`${mod.id}:${item.id}`} className="flex items-center gap-2 text-sm text-zinc-400">
                    <span
                      className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: mod.progressHex }}
                    />
                    <span className="text-zinc-600">{mod.title} › </span>
                    {item.label}
                  </li>
                )),
            ).slice(0, 5)}
          </ul>
        </div>
      )}

      {/* Modules */}
      <div className="space-y-3">
        {MODULES.map((mod) => {
          const { done, total, pct } = modProgress(mod, checked)
          const isExpanded = expanded === mod.id
          const isComplete = pct === 100

          return (
            <div
              key={mod.id}
              className={`rounded-2xl border transition-colors duration-200 ${
                isComplete
                  ? 'border-emerald-400/20 bg-zinc-900/40'
                  : `${mod.borderClass} bg-zinc-900/60`
              }`}
            >
              {/* Module header button */}
              <button
                type="button"
                onClick={() => setExpanded(isExpanded ? null : mod.id)}
                className="flex w-full items-center gap-4 p-4 text-left"
              >
                <div
                  className={`shrink-0 rounded-xl border p-2.5 ${mod.bgClass} ${mod.borderClass}`}
                >
                  <mod.Icon size={18} className={mod.accentClass} />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-zinc-100">{mod.title}</span>
                    {isComplete && (
                      <CheckCircle2 size={14} className="shrink-0 text-emerald-400" />
                    )}
                  </div>
                  <p className="text-xs text-zinc-500">{mod.subtitle}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-800">
                      <div
                        className="h-1.5 rounded-full transition-all duration-300"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: isComplete ? '#34d399' : mod.progressHex,
                        }}
                      />
                    </div>
                    <span className="shrink-0 text-xs text-zinc-500">
                      {done}/{total}
                    </span>
                  </div>
                </div>

                <ChevronDown
                  size={16}
                  className={`shrink-0 text-zinc-500 transition-transform duration-200 ${
                    isExpanded ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {/* Checklist */}
              {isExpanded && (
                <div className="border-t border-zinc-200/10 px-4 pb-4 pt-3">
                  <ul className="space-y-1">
                    {mod.items.map((item) => {
                      const key = `${mod.id}:${item.id}`
                      const isDone = !!checked[key]
                      return (
                        <li key={item.id}>
                          <label className="flex cursor-pointer items-start gap-3 rounded-lg px-2 py-2 transition hover:bg-zinc-800/50">
                            <div
                              className={`mt-0.5 shrink-0 transition-colors ${
                                isDone ? mod.accentClass : 'text-zinc-600'
                              }`}
                            >
                              {isDone ? <CheckCircle2 size={17} /> : <Circle size={17} />}
                            </div>
                            <span
                              className={`select-none text-sm leading-snug transition-colors ${
                                isDone
                                  ? 'text-zinc-600 line-through decoration-zinc-700'
                                  : 'text-zinc-200'
                              }`}
                            >
                              {item.label}
                            </span>
                            <input
                              type="checkbox"
                              className="sr-only"
                              checked={isDone}
                              onChange={() => toggle(key)}
                            />
                          </label>
                        </li>
                      )
                    })}
                  </ul>

                  {mod.insight && (
                    <div className="mt-3 rounded-lg border border-amber-400/20 bg-amber-400/8 p-3 text-xs leading-relaxed text-amber-200/80">
                      💡 {mod.insight}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
