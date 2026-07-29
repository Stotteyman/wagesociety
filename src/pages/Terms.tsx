import { Link } from 'react-router-dom';
import { Bullets, Clause, LegalPage } from '../components/ui/LegalPage';

/**
 * Terms of service.
 *
 * Written against what the platform actually does — the tiers and prices in
 * membership_plans, the 7-day trial and 10-month annual rate in checkout.js, and the
 * 10% application fee in _platform.js. If any of those change, this page changes with
 * them; a term that contradicts the code is worse than no term at all.
 */
export default function Terms() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Terms of service"
      lede="What you can expect from W.A.G.E. Society, and what we expect from you."
      updated="29 July 2026"
    >
      <Clause n={1} title="Who we are">
        <p>
          W.A.G.E. Society (&ldquo;W.A.G.E.&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;) operates{' '}
          <b>wagesociety.com</b> and the associated Discord server, member tools and creator
          storefronts. By creating an account or using the service, you agree to these terms.
        </p>
        <p>
          You can reach us at <b>contact@wagesociety.com</b>.
        </p>
      </Clause>

      <Clause n={2} title="Your account">
        <Bullets
          items={[
            'You must be at least 13 years old to hold an account, and at least 18 to sell anything or receive payouts.',
            <>Your handle is public and appears at <b>wagesociety.com/creators/@yourhandle</b>. Handles are at least 5 characters, unique regardless of capitalisation, and some are reserved to prevent impersonation.</>,
            'You are responsible for what happens under your account. Tell us promptly if you think someone else has access to it.',
            'You may sign in with Discord, Google, X or an email address. Removing a connection may remove the access it granted.',
          ]}
        />
      </Clause>

      <Clause n={3} title="Membership and billing">
        <p>
          Membership is optional. A free account gives you a profile, the directory and the
          Discord. Paid tiers are billed through Stripe.
        </p>
        <Bullets
          items={[
            <>Monthly prices are <b>Creator $9.99</b>, <b>Pro $24.99</b>, <b>Elite $49.99</b> and <b>Unlimited $99.99</b>.</>,
            'Annual billing is charged at ten months for twelve — two months free.',
            'New paid memberships include a 7-day trial. You are not charged until it ends.',
            'Memberships renew automatically until cancelled. You can cancel at any time and keep access until the end of the period you have already paid for.',
            'We do not give partial refunds for time you have not used, except where the law requires it. If something on our side went wrong, contact us and we will sort it out.',
            'If a price changes, it will not change what you are paying mid-period, and we will tell you before it applies to you.',
          ]}
        />
      </Clause>

      <Clause n={4} title="Selling on W.A.G.E., and the 10%">
        <p>
          You can sell memberships and paid video through your profile. Payments are processed
          by Stripe and paid into a Stripe account connected to you.
        </p>
        <Bullets
          items={[
            <><b>We take 10% of a sale, and you receive the other 90%.</b> That is the whole platform fee.</>,
            <>Stripe&rsquo;s own processing fee comes out of <b>our</b> share, not yours. Your 90% is 90% of the sale price. The reasoning is at <Link to="/why-10-percent">why we take 10%</Link>.</>,
            'You need a connected Stripe account before you can be paid. Stripe decides payout timing and may require identity information directly from you.',
            'You set your own prices. You are responsible for any tax you owe on what you earn.',
            'Refunds and chargebacks on your sales are deducted from your earnings, including our fee on that sale.',
          ]}
        />
      </Clause>

      <Clause n={5} title="Your content stays yours">
        <p>
          You own what you upload and what you sell. Nothing here transfers ownership to us.
        </p>
        <p>
          You give us permission to host, display and distribute your content where it is needed
          to run the service — showing your profile in the directory, listing your streams,
          delivering video to people who bought it, and displaying your handle and avatar. That
          permission ends when you remove the content or close your account, except where we must
          keep records of completed transactions.
        </p>
        <p>
          You confirm you have the rights to what you post, and that it does not infringe anyone
          else&rsquo;s. We remove infringing material when we are told about it, and we may
          suspend accounts that repeatedly infringe.
        </p>
      </Clause>

      <Clause n={6} title="Member tools">
        <p>
          Paid tiers include software such as Clip Studio. While your membership is active you may
          use it on your own machines for your own content, including commercially.
        </p>
        <Bullets
          items={[
            'The licence lasts as long as your membership. If it lapses, the software stops working.',
            'Do not redistribute the build, share your download link, or resell access.',
            'The tools run on your machine. Your footage is processed locally and is not uploaded to us.',
            'Signing an app in to your account creates a device session, which you can revoke from Settings at any time.',
          ]}
        />
      </Clause>

      <Clause n={7} title="The Discord server">
        <p>
          Access to the Discord is tied to a connected W.A.G.E. account, and your roles reflect
          your membership. Connecting or cancelling changes your access automatically. Server
          rules apply alongside these terms, and moderation decisions there are ours to make.
        </p>
      </Clause>

      <Clause n={8} title="What you may not do">
        <Bullets
          items={[
            'Break the law, or use the service to harm, harass or impersonate someone.',
            'Upload content you do not have the rights to, or content that is sexual material involving minors, or that incites violence.',
            'Interfere with the service — scraping at scale, probing for vulnerabilities, or working around access controls or payment.',
            'Use referrals dishonestly, including fake accounts and self-referral.',
            'Resell or sublicense access to the platform or its tools.',
          ]}
        />
      </Clause>

      <Clause n={9} title="Suspension and closing your account">
        <p>
          You can stop using the service at any time and ask us to delete your account. We may
          suspend or close an account that breaks these terms, that we are legally required to act
          on, or that is being used to defraud people. Where it is reasonable to do so, we will
          tell you why and give you a chance to put it right.
        </p>
        <p>
          If we close your account, you keep any earnings already owed to you, minus refunds and
          chargebacks.
        </p>
      </Clause>

      <Clause n={10} title="Availability and liability">
        <p>
          We work to keep the service running, but we do not promise it will be uninterrupted or
          error-free. Features change and some are withdrawn.
        </p>
        <p>
          To the extent the law allows, we are not liable for indirect or consequential losses,
          including lost profits or lost audience. Where liability cannot be excluded, it is
          limited to what you paid us in the twelve months before the claim. Nothing here limits
          liability for fraud, or for anything that cannot lawfully be limited.
        </p>
        <p>
          Third-party services we rely on — Stripe, Discord, YouTube, Kick, X — have their own
          terms, and we are not responsible for what they do.
        </p>
      </Clause>

      <Clause n={11} title="Changes">
        <p>
          We will update these terms as the platform changes. If a change materially affects you,
          we will say so on the site or by email before it takes effect. Continuing to use the
          service after that means you accept the new version.
        </p>
      </Clause>

      <Clause n={12} title="Contact">
        <p>
          Questions about these terms: <b>contact@wagesociety.com</b>. See also our{' '}
          <Link to="/privacy-policy">privacy policy</Link>.
        </p>
      </Clause>
    </LegalPage>
  );
}
