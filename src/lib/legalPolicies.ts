export const LEGAL_POLICY_VERSION = '2026.05.05'
export const LEGAL_POLICY_LAST_UPDATED = 'May 5, 2026'

export type PolicyChangelogEntry = {
  version: string
  date: string
  summary: string
}

export const LEGAL_POLICY_CHANGELOG: PolicyChangelogEntry[] = [
  {
    version: '2026.05.05',
    date: 'May 5, 2026',
    summary:
      'Initial publication of Privacy Policy and Terms of Service covering accounts, auth providers, payments, and community features.',
  },
]

const ACCEPTANCE_STORAGE_KEY = 'wage.legalPolicyAcceptance'

export type PolicyAcceptanceRecord = {
  version: string
  acceptedAtIso: string
  source: 'privacy' | 'terms' | 'checkout'
}

export function readPolicyAcceptance(): PolicyAcceptanceRecord | null {
  if (typeof window === 'undefined') return null

  try {
    const raw = window.localStorage.getItem(ACCEPTANCE_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PolicyAcceptanceRecord

    if (!parsed || typeof parsed !== 'object') return null
    if (typeof parsed.version !== 'string' || typeof parsed.acceptedAtIso !== 'string') return null

    return parsed
  } catch {
    return null
  }
}

export function writePolicyAcceptance(source: PolicyAcceptanceRecord['source']) {
  if (typeof window === 'undefined') return

  const record: PolicyAcceptanceRecord = {
    version: LEGAL_POLICY_VERSION,
    acceptedAtIso: new Date().toISOString(),
    source,
  }

  window.localStorage.setItem(ACCEPTANCE_STORAGE_KEY, JSON.stringify(record))
}
