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

export const Route = createFileRoute('/terms')({
  head: () => ({
    meta: [
      { title: 'Terms of Service — W.A.G.E. Society' },
      {
        name: 'description',
        content:
          'Terms governing your use of W.A.G.E. Society, including accounts, memberships, merch purchases, and community conduct.',
      },
      { property: 'og:title', content: 'Terms of Service — W.A.G.E. Society' },
      {
        property: 'og:description',
        content: 'Read the rules and conditions for using W.A.G.E. Society services.',
      },
      { property: 'og:url', content: 'https://wagesociety.com/terms' },
    ],
    links: [{ rel: 'canonical', href: 'https://wagesociety.com/terms' }],
  }),
  component: TermsPage,
})

function TermsPage() {
  const [acceptance, setAcceptance] = useState<PolicyAcceptanceRecord | null>(null)

  useEffect(() => {
    setAcceptance(readPolicyAcceptance())
  }, [])

  const handleAccept = () => {
    writePolicyAcceptance('terms')
    setAcceptance(readPolicyAcceptance())
  }

  return (
    <main className="mt-8 rounded-2xl border border-zinc-200/15 bg-zinc-900/70 p-6 sm:p-8">
      <div className="mx-auto max-w-3xl space-y-8 text-sm leading-relaxed text-zinc-300 sm:text-base">
        <header className="space-y-3">
          <h1 className="text-3xl font-black text-zinc-50 sm:text-4xl">Terms of Service</h1>
          <p>
            Effective date: <span className="font-semibold text-zinc-100">{EFFECTIVE_DATE}</span>
          </p>
          <p>
            These Terms of Service ("Terms") are an agreement between you and W.A.G.E. Society ("W.A.G.E.
            Society," "we," "our," or "us") governing your use of wagesociety.com and related services, including
            account, community, directory, livestream, admin, and e-commerce features.
          </p>
        </header>

        <section className="space-y-3">
          <h2 className="text-xl font-bold text-zinc-50">1. Acceptance of Terms</h2>
          <p>
            By accessing or using the services, you agree to these Terms and our
            {' '}
            <Link to="/privacy" className="font-semibold text-orange-200 hover:text-orange-100">
              Privacy Policy
            </Link>
            . If you do not agree, do not use the services.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold text-zinc-50">2. Eligibility and Accounts</h2>
          <ul className="list-disc space-y-2 pl-5">
            <li>You must be legally able to enter into a binding agreement to use the services.</li>
            <li>You are responsible for maintaining the confidentiality of your login credentials.</li>
            <li>You are responsible for all activity that occurs under your account.</li>
            <li>You must provide accurate account information and keep it up to date.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold text-zinc-50">3. Community Rules and Prohibited Conduct</h2>
          <p>You agree not to:</p>
          <ul className="list-disc space-y-2 pl-5">
            <li>Violate any law or regulation.</li>
            <li>Infringe intellectual property, privacy, or other rights of others.</li>
            <li>Post or transmit malicious code, spam, fraudulent content, or harmful material.</li>
            <li>Attempt unauthorized access, scraping abuse, or disruption of platform operations.</li>
            <li>Impersonate others or misrepresent your identity or affiliation.</li>
          </ul>
          <p>
            We may suspend or terminate access for violations, including abuse of community, moderation, or admin
            systems.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold text-zinc-50">4. User Content</h2>
          <p>
            You retain ownership of content you submit. You grant us a non-exclusive, worldwide, royalty-free license
            to host, store, process, display, and distribute your content as needed to operate and improve the
            services.
          </p>
          <p>
            You represent that you have all rights necessary to submit your content and that your content does not
            violate laws or third-party rights.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold text-zinc-50">5. Memberships, Purchases, and Billing</h2>
          <ul className="list-disc space-y-2 pl-5">
            <li>Membership and merch pricing is displayed at checkout and may be updated from time to time.</li>
            <li>Payments are processed by third-party providers, including Stripe.</li>
            <li>You authorize charges for orders and subscription renewals you initiate.</li>
            <li>Taxes and fees may apply depending on your location and transaction type.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold text-zinc-50">6. Refunds and Cancellations</h2>
          <p>
            Unless required by law or stated otherwise at checkout, purchases may be non-refundable. You may cancel
            future recurring charges by managing your subscription before the next billing cycle.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold text-zinc-50">7. Service Availability and Changes</h2>
          <p>
            We may modify, suspend, or discontinue any part of the services at any time, with or without notice. We do
            not guarantee uninterrupted or error-free operation.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold text-zinc-50">8. Third-Party Services</h2>
          <p>
            The platform integrates with third-party services, including authentication and payment providers. Your use
            of those services is subject to their own terms and privacy policies.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold text-zinc-50">9. Intellectual Property</h2>
          <p>
            The services, including software, branding, and site content provided by us, are protected by intellectual
            property laws. Except as expressly permitted, you may not copy, modify, distribute, sell, or reverse
            engineer our services.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold text-zinc-50">10. Disclaimers</h2>
          <p>
            The services are provided on an "as is" and "as available" basis. To the maximum extent permitted by law,
            we disclaim all warranties, express or implied, including merchantability, fitness for a particular
            purpose, and non-infringement.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold text-zinc-50">11. Limitation of Liability</h2>
          <p>
            To the maximum extent permitted by law, W.A.G.E. Society and its affiliates will not be liable for
            indirect, incidental, special, consequential, exemplary, or punitive damages, or for loss of profits,
            revenues, data, or goodwill arising out of or related to your use of the services.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold text-zinc-50">12. Indemnification</h2>
          <p>
            You agree to defend, indemnify, and hold harmless W.A.G.E. Society and its affiliates from claims,
            liabilities, damages, losses, and expenses arising from your use of the services, your content, or your
            violation of these Terms.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold text-zinc-50">13. Termination</h2>
          <p>
            We may suspend or terminate your access at any time for violation of these Terms, security risk, legal
            requirements, or misuse of services. Sections that by nature should survive termination remain in effect.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold text-zinc-50">14. Governing Law and Disputes</h2>
          <p>
            These Terms are governed by applicable law in the jurisdiction where W.A.G.E. Society operates, without
            regard to conflict-of-law principles. You agree to resolve disputes in the applicable courts of that
            jurisdiction unless otherwise required by law.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold text-zinc-50">15. Changes to Terms</h2>
          <p>
            We may update these Terms from time to time. Updated Terms are effective when posted unless a later date is
            stated. Your continued use of the services after changes become effective means you accept the updated
            Terms.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold text-zinc-50">16. Policy Version and Changelog</h2>
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
          <h2 className="text-xl font-bold text-zinc-50">17. Acceptance Tracking</h2>
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
          <h2 className="text-xl font-bold text-zinc-50">18. Contact</h2>
          <p>
            Questions about these Terms can be sent to
            {' '}
            <a className="font-semibold text-orange-200 hover:text-orange-100" href="mailto:appeals@wagesociety.com">
              appeals@wagesociety.com
            </a>
            .
          </p>
        </section>
      </div>
    </main>
  )
}
