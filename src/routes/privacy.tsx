import { Link, createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import {
  LEGAL_POLICY_CHANGELOG,
  LEGAL_POLICY_LAST_UPDATED,
  LEGAL_POLICY_VERSION,
  readPolicyAcceptance,
  writePolicyAcceptance,
  type PolicyAcceptanceRecord,
} from '../lib/legalPolicies'

const EFFECTIVE_DATE = 'May 5, 2026'

export const Route = createFileRoute('/privacy')({
  head: () => ({
    meta: [
      { title: 'Privacy Policy — W.A.G.E. Society' },
      {
        name: 'description',
        content:
          'Read how W.A.G.E. Society collects, uses, shares, and protects personal data across accounts, community features, and payments.',
      },
      { property: 'og:title', content: 'Privacy Policy — W.A.G.E. Society' },
      {
        property: 'og:description',
        content:
          'Learn what data W.A.G.E. Society collects, why we collect it, and your privacy rights and choices.',
      },
      { property: 'og:url', content: 'https://wagesociety.com/privacy' },
    ],
    links: [{ rel: 'canonical', href: 'https://wagesociety.com/privacy' }],
  }),
  component: PrivacyPolicyPage,
})

function PrivacyPolicyPage() {
  const [acceptance, setAcceptance] = useState<PolicyAcceptanceRecord | null>(null)

  useEffect(() => {
    setAcceptance(readPolicyAcceptance())
  }, [])

  const handleAccept = () => {
    writePolicyAcceptance('privacy')
    setAcceptance(readPolicyAcceptance())
  }

  return (
    <main className="mt-8 rounded-2xl border border-zinc-200/15 bg-zinc-900/70 p-6 sm:p-8">
      <div className="mx-auto max-w-3xl space-y-8 text-sm leading-relaxed text-zinc-300 sm:text-base">
        <header className="space-y-3">
          <h1 className="text-3xl font-black text-zinc-50 sm:text-4xl">Privacy Policy</h1>
          <p>
            Effective date: <span className="font-semibold text-zinc-100">{EFFECTIVE_DATE}</span>
          </p>
          <p>
            This Privacy Policy describes how W.A.G.E. Society ("W.A.G.E. Society," "we," "our," or "us")
            collects, uses, stores, and shares personal information when you use wagesociety.com and related
            features, including member accounts, livestream tools, creator directory, blog/news features, and
            merchant and membership checkout.
          </p>
        </header>

        <section className="space-y-3">
          <h2 className="text-xl font-bold text-zinc-50">1. Information We Collect</h2>
          <p>We collect information you provide directly and information generated through your use of the platform.</p>
          <ul className="list-disc space-y-2 pl-5">
            <li>Account data, such as email address and login details.</li>
            <li>Profile and directory data, such as username, full name, profile image, and public profile content.</li>
            <li>Community and content data, such as collaboration requests, blog/news content, comments, and uploads.</li>
            <li>Support and admin communications, including moderation and appeals messages.</li>
            <li>Transaction-related data for memberships and merch purchases, such as order and payment status.</li>
            <li>Technical data, such as IP address, browser/device data, referring pages, and interaction logs.</li>
          </ul>
          <p>
            Payment card details are processed by Stripe and are not stored in full on our servers.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold text-zinc-50">2. Authentication and Sign-In</h2>
          <p>
            We support email/password authentication and social sign-in providers (such as Google and Kick) via
            Supabase Auth. When you sign in through an external provider, we receive basic account information
            associated with that provider account, subject to the provider&apos;s settings and policies.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold text-zinc-50">3. How We Use Information</h2>
          <ul className="list-disc space-y-2 pl-5">
            <li>Provide, maintain, and secure the platform and member features.</li>
            <li>Create and manage user accounts, permissions, and organization roles.</li>
            <li>Process purchases, subscriptions, refunds, and related transaction records.</li>
            <li>Power creator collaboration, directory visibility, and content publishing workflows.</li>
            <li>Detect abuse, fraud, unauthorized access, and policy violations.</li>
            <li>Communicate service notices, updates, and support responses.</li>
            <li>Improve performance, reliability, and user experience.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold text-zinc-50">4. Legal Bases (Where Applicable)</h2>
          <p>
            Where data protection laws such as GDPR apply, we process personal data based on one or more of the
            following: performance of a contract, legitimate interests, legal obligations, and your consent where
            required.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold text-zinc-50">5. Cookies, Local Storage, and Similar Technologies</h2>
          <p>
            We and our service providers use cookies and browser storage to keep you signed in, store preferences,
            maintain security state, and improve site performance. You can control many of these settings in your
            browser, but disabling them may limit functionality.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold text-zinc-50">6. How We Share Information</h2>
          <p>We do not sell personal information. We may share data with:</p>
          <ul className="list-disc space-y-2 pl-5">
            <li>Infrastructure and data platform providers (such as Netlify and Supabase).</li>
            <li>Payment processors (such as Stripe) to process transactions.</li>
            <li>Authentication and identity providers (such as Google and Kick) for sign-in flows you initiate.</li>
            <li>Professional advisors, legal authorities, or law enforcement when required by law.</li>
            <li>Successors in a merger, acquisition, financing, or asset sale involving our business.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold text-zinc-50">7. Data Retention</h2>
          <p>
            We retain personal information for as long as needed to provide services, maintain security and business
            records, comply with legal obligations, and resolve disputes. Retention periods vary by data type,
            sensitivity, and legal requirements.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold text-zinc-50">8. Your Rights and Choices</h2>
          <p>Depending on your location, you may have rights to access, correct, delete, or export your personal data.</p>
          <p>
            You may also have rights to object to or restrict certain processing, and to withdraw consent where
            processing is consent-based. To make a privacy request, contact us using the details below.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold text-zinc-50">9. Children&apos;s Privacy</h2>
          <p>
            Our services are not directed to children under 13 (or a higher age where required by local law), and we
            do not knowingly collect personal data from children.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold text-zinc-50">10. International Transfers</h2>
          <p>
            Your information may be processed in countries other than your own. Where required, we use safeguards to
            protect personal information transferred across borders.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold text-zinc-50">11. Security</h2>
          <p>
            We use technical and organizational measures designed to protect personal information, including access
            controls and authentication safeguards. No method of transmission or storage is completely secure.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold text-zinc-50">12. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. We will post the updated version here and revise the
            effective date above. Material updates may also be communicated through the platform.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold text-zinc-50">13. Policy Version and Changelog</h2>
          <p>
            Current policy version:
            {' '}
            <span className="font-semibold text-zinc-100">{LEGAL_POLICY_VERSION}</span>
            {' '}
            (updated {LEGAL_POLICY_LAST_UPDATED}).
          </p>
          <div className="overflow-hidden rounded-xl border border-zinc-200/15">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-900/70 text-zinc-200">
                <tr>
                  <th className="px-3 py-2">Version</th>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Summary</th>
                </tr>
              </thead>
              <tbody>
                {LEGAL_POLICY_CHANGELOG.map((entry) => (
                  <tr key={entry.version} className="border-t border-zinc-200/10">
                    <td className="px-3 py-2 font-semibold text-zinc-100">{entry.version}</td>
                    <td className="px-3 py-2">{entry.date}</td>
                    <td className="px-3 py-2">{entry.summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold text-zinc-50">14. Acceptance Tracking</h2>
          <p>
            You can record your acceptance of the current legal policy version in this browser. This creates a local
            browser record for convenience and does not replace formal contractual requirements.
          </p>
          {acceptance ? (
            <p className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-emerald-200">
              Accepted version {acceptance.version} on {new Date(acceptance.acceptedAtIso).toLocaleString()} via{' '}
              {acceptance.source}.
            </p>
          ) : (
            <p className="rounded-lg border border-zinc-200/15 bg-zinc-900/50 px-3 py-2 text-zinc-300">
              No local acceptance record saved yet.
            </p>
          )}
          <button
            type="button"
            onClick={handleAccept}
            className="rounded-lg bg-orange-300 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-orange-200"
          >
            I Accept Policy v{LEGAL_POLICY_VERSION}
          </button>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold text-zinc-50">15. Contact Us</h2>
          <p>
            For privacy questions or requests, email
            {' '}
            <a className="font-semibold text-orange-200 hover:text-orange-100" href="mailto:appeals@wagesociety.com">
              appeals@wagesociety.com
            </a>
            .
          </p>
          <p>
            You can also review our
            {' '}
            <Link to="/terms" className="font-semibold text-orange-200 hover:text-orange-100">
              Terms of Service
            </Link>
            .
          </p>
        </section>
      </div>
    </main>
  )
}
