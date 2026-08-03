import { Link } from 'react-router-dom';
import { Bullets, Clause, LegalPage } from '../components/ui/LegalPage';

/**
 * Privacy policy.
 *
 * The processor list is the real one — anything that actually receives personal data is
 * named. If a service is added or dropped, this list changes with it. A policy that omits
 * a live processor is worse than none, because it is a statement people rely on.
 */
export default function PrivacyPolicy() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Privacy policy"
      lede="What we collect, why we have it, and who else can see it."
      updated="2 August 2026"
    >
      <Clause n={1} title="The short version">
        <p>
          We collect what we need to run your account, your public profile and your payments —
          and not much else. We do not sell your data, and we do not use it to train models. Your
          footage never reaches us: the member tools process it on your own machine.
        </p>
      </Clause>

      <Clause n={2} title="What we collect">
        <p><b>When you create an account</b></p>
        <Bullets
          items={[
            'Your email address, where the sign-in method gives us one. Discord does not always provide an email, and an account without one still works — we will simply ask for one before anything that needs to reach you.',
            'The identifier and username from whichever service you signed in with: Discord, Google, X or Kick.',
            'A password, if you chose email sign-in. It is stored hashed by our authentication provider and is never visible to us.',
          ]}
        />
        <p className="pt-1"><b>Your profile, which is public by design</b></p>
        <Bullets
          items={[
            'Handle, display name, avatar, bio, skills, primary platform and any social links you add.',
            'Your connected YouTube or Kick channel, so your streams can appear on the site when you go live.',
            'Points, referral totals and leaderboard position.',
          ]}
        />
        <p className="pt-1"><b>When you pay, or get paid</b></p>
        <Bullets
          items={[
            'Membership tier, status and renewal dates.',
            <><b>We never see or store your card details.</b> Stripe handles payment data directly; we keep only their identifiers for your customer and subscription.</>,
            'If you sell through the platform, Stripe collects the identity and bank details it needs to pay you. That goes to Stripe, not to us.',
          ]}
        />
        <p className="pt-1"><b>While you use the service</b></p>
        <Bullets
          items={[
            'When you were last active, so the directory can show who is around.',
            'Device sessions for member tools, so you can see and revoke what is signed in.',
            'Aggregate page analytics — how many people viewed a page, and roughly where from. No cross-site tracking and no advertising profiles.',
          ]}
        />
      </Clause>

      <Clause n={3} title="Why we have it">
        <Bullets
          items={[
            'To run your account and show your public profile.',
            'To take payments, pay creators, and keep the records that tax and accounting rules require.',
            'To grant the right Discord roles for your membership, and remove them when it ends.',
            'To confirm you are entitled to the member tools when they check in.',
            'To send messages you need: receipts, password resets, and notice of changes that affect you.',
            'To investigate fraud, referral abuse and breaches of our terms.',
          ]}
        />
      </Clause>

      <Clause n={4} title="Who else sees it">
        <p>
          These are the services that process data on our behalf. Each one gets only what it needs.
        </p>
        <Bullets
          items={[
            <><b>Supabase</b> — the database and authentication behind the site.</>,
            <><b>Netlify</b> — hosting and delivery.</>,
            <><b>Stripe</b> — payments, subscriptions and creator payouts.</>,
            <><b>Discord</b> — sign-in, and the bot that manages your roles in the server.</>,
            <><b>Google</b> — sign-in, YouTube live status, and web fonts.</>,
            <><b>Kick</b> and <b>X</b> — sign-in and channel information, where you connect them.</>,
            <><b>Zoho</b> — the mail service that delivers our email.</>,
            <><b>Orange Duck Studios</b> — our own first-party page analytics.</>,
          ]}
        />
        <p>
          We may also disclose information where the law requires it, or to protect someone from
          harm. <b>We do not sell personal data, and we do not share it for advertising.</b>
        </p>
      </Clause>

      <Clause n={5} title="YouTube">
        <p>
          Connecting a channel uses <b>YouTube API Services</b>. When you grant the permission we
          make a single request for the list of channels you own, so you can choose one to
          feature. We read the channel ID, name, handle, thumbnail and public subscriber count,
          and we keep only the public ID of the channel you pick. We do not read your watch
          history, subscriptions, comments, private videos or analytics, and we never post to or
          change anything on your channel.
        </p>
        <p>
          The live status shown on the site afterwards comes from public YouTube data, not from
          your account.
        </p>
        <Bullets
          items={[
            <>Google&rsquo;s own handling of your information is covered by the{' '}
              <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">Google privacy policy</a>.</>,
            <>Using YouTube through this site also means agreeing to the{' '}
              <a href="https://www.youtube.com/t/terms" target="_blank" rel="noreferrer">YouTube terms of service</a>.</>,
            <>You can revoke our access at any time from your{' '}
              <a href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer">Google account permissions</a>{' '}
              page, or by unlinking Google in <Link to="/settings">Settings</Link>.</>,
          ]}
        />
      </Clause>

      <Clause n={6} title="What is public">
        <p>
          Your handle, display name, avatar, bio, skills, links, connected channels and
          leaderboard position are visible to anyone, including search engines. Your email
          address, payment details and account settings are not. Assume anything on your profile
          page is public, because it is.
        </p>
      </Clause>

      <Clause n={7} title="How long we keep it">
        <Bullets
          items={[
            'Account and profile data: until you delete your account.',
            'Transaction records: kept after account deletion where accounting and tax rules require it.',
            'Handle history: kept so an old handle cannot be quietly taken over to impersonate someone.',
            'Analytics: aggregate only, not tied to your account.',
          ]}
        />
      </Clause>

      <Clause n={8} title="Your choices">
        <Bullets
          items={[
            <><b>See and change your data</b> — most of it is editable in <Link to="/settings">Settings</Link>.</>,
            <><b>Delete your account</b> — email <b>contact@wagesociety.com</b> and we will remove it, along with your profile and connections.</>,
            <><b>Disconnect a platform</b> — unlinking Discord, Google, X or Kick in Settings removes that connection and the access it granted.</>,
            <><b>Sign out a device</b> — revoke any app session from Settings, and it stops working immediately.</>,
            <><b>Copy of your data</b> — ask and we will send you what we hold.</>,
          ]}
        />
        <p>
          Depending on where you live you may have additional rights over your data, including
          objecting to how we use it. Email us and we will honour them.
        </p>
      </Clause>

      <Clause n={9} title="Security">
        <p>
          Access to the database is restricted by row-level security, secrets stay on the server
          and never reach your browser, and tokens for member tools are stored only as hashes, so
          a copy of our database would not let someone use them. No system is perfect; if a breach
          affects you, we will tell you.
        </p>
      </Clause>

      <Clause n={10} title="Children">
        <p>
          The service is not for under-13s, and selling requires you to be 18 or over. If we learn
          we hold data on a child under 13, we delete it.
        </p>
      </Clause>

      <Clause n={11} title="Where your data lives">
        <p>
          Our providers operate internationally, so your information may be processed outside your
          country, including in the United States. They are bound to protect it under their own
          agreements with us.
        </p>
      </Clause>

      <Clause n={12} title="Changes and contact">
        <p>
          We will update this policy as the platform changes, and the date at the top will change
          with it. For anything privacy-related, email <b>contact@wagesociety.com</b>. See also our{' '}
          <Link to="/terms">terms of service</Link>.
        </p>
      </Clause>
    </LegalPage>
  );
}
