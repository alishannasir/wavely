import type { ReactNode } from 'react';
import PageShell from '../../components/ui/PageShell';
import { BRAND } from '../../brand';

/**
 * Terms of service and privacy policy. The text describes what the code does today
 * (see docs/MODERATION.md). If retention, providers or data collected change, update it here.
 * Have a lawyer review before relying on it.
 */
const UPDATED = '10 November 2026';

type Section = { title: string; body: ReactNode };

export function Terms() {
  return <LegalPage title="Terms of service" sections={TERMS} />;
}
export function Privacy() {
  return <LegalPage title="Privacy policy" sections={PRIVACY} />;
}

function LegalPage({ title, sections }: { title: string; sections: Section[] }) {
  return (
    <PageShell>
      <p className="mb-2 text-center text-sm text-muted">Last updated {UPDATED}</p>
      <h1 className="mb-6 text-center font-display text-4xl font-semibold text-brand">{title}</h1>
      <div className="mx-auto max-w-3xl space-y-6 rounded-3xl bg-white p-6 text-muted shadow-sm sm:p-8">
        {sections.map((s) => (
          <section key={s.title}>
            <h2 className="mb-2 font-display text-xl font-semibold text-brand">{s.title}</h2>
            <div className="space-y-2">{s.body}</div>
          </section>
        ))}
        <p>
          Questions? Contact us at{' '}
          <a className="font-semibold text-accent underline" href={`mailto:${BRAND.supportEmail}`}>
            {BRAND.supportEmail}
          </a>
          .
        </p>
      </div>
    </PageShell>
  );
}

function List({ items }: { items: ReactNode[] }) {
  return (
    <ul className="list-disc space-y-1 pl-6">
      {items.map((it, i) => (
        <li key={i}>{it}</li>
      ))}
    </ul>
  );
}

const TERMS: Section[] = [
  {
    title: '1. Who we are and what these terms cover',
    body: (
      <p>
        {BRAND.name} (“we”, “us”) runs a website that connects adults for random one-to-one video and text chat. By using{' '}
        {BRAND.name} you agree to these terms and to our Rules and Privacy policy. If you do not agree, do not use the service.
      </p>
    ),
  },
  {
    title: '2. You must be 18 or over',
    body: (
      <>
        <p>
          {BRAND.name} is for people aged 18 and over only. You confirm that you are at least 18 when you create an account (by
          giving your date of birth) or continue as a guest (by confirming it).
        </p>
        <p>
          We do not currently verify age with documents. If we believe someone is under 18 we will ban them, and we may keep
          related evidence as described in the Privacy policy. Parents can use their device’s parental controls to block the
          site.
        </p>
      </>
    ),
  },
  {
    title: '3. Accounts and guests',
    body: (
      <List
        items={[
          'You can sign in with Google, sign up with an email and password, or continue as a guest.',
          'Give accurate information and keep your login secure. You are responsible for what happens under your account.',
          'Guest sessions are temporary (they expire after a few hours) and guest accounts are deleted after a short period.',
          'You can delete your account at any time from your account page.',
        ]}
      />
    ),
  },
  {
    title: '4. Rules of conduct',
    body: (
      <>
        <p>You must follow our Rules. In particular you must not:</p>
        <List
          items={[
            'show nudity or sexual content, or engage in sexual conversation;',
            'harass, threaten, bully, discriminate against or exploit anyone;',
            'involve or target anyone under 18 in any way;',
            'record, screenshot or share other people’s video or messages without their consent;',
            'share other people’s personal information, or advertise, spam or run scams;',
            'use bots, scripts or tools that change how the service works, or try to get around bans or limits;',
            'break the law, or use the service for anything illegal.',
          ]}
        />
      </>
    ),
  },
  {
    title: '5. Reporting, moderation and bans',
    body: (
      <>
        <p>
          Users can report each other. When you press Report, a screenshot of the other person’s video and the recent in-call
          chat messages are sent to our moderators. Our software may also automatically flag video that looks like nudity.
          Several reports in a short time can lead to automatic, temporary restrictions while a moderator reviews them.
        </p>
        <p>
          We may warn, restrict, suspend or ban accounts, and ban devices and IP addresses, if we believe these terms or the
          Rules have been broken or to protect other people. Bans can apply to a device or network as well as an account. If
          your account is banned you can send an appeal from the appeal page; we decide appeals at our discretion.
        </p>
        <p>
          Automated tools make mistakes. If you think a decision is wrong, contact us at {BRAND.supportEmail}.
        </p>
      </>
    ),
  },
  {
    title: '6. Illegal content and cooperation with authorities',
    body: (
      <p>
        We may keep evidence and share it with law enforcement or child-safety organisations where the law requires it or where
        we reasonably believe it is needed to protect someone from harm, including reports involving suspected child sexual
        abuse material.
      </p>
    ),
  },
  {
    title: '7. Other users and safety',
    body: (
      <>
        <p>
          You will be matched with strangers. We cannot control what people say or show, and we cannot guarantee that every
          user follows the Rules. Do not share personal details, money or passwords, and leave any chat that makes you
          uncomfortable. You can skip, block and report at any time.
        </p>
      </>
    ),
  },
  {
    title: '8. Free use, limits and paid plans',
    body: (
      <>
        <p>
          The free plan has daily limits on chat minutes and matches, and new accounts get a short free trial of the paid
          features. Paid plans (monthly or annual) are processed by our payment provider, Stripe, and renew until cancelled.
          You can cancel at any time and the plan then runs to the end of the period already paid for. Prices, limits and
          features can change, and we will tell you before a price change affects you.
        </p>
        <p>Except where the law says otherwise, payments are not refundable once a billing period has started.</p>
      </>
    ),
  },
  {
    title: '9. Availability and where it works',
    body: (
      <p>
        The service is provided “as is” and may be unavailable at times. We restrict access in some countries and regions for
        legal reasons, and may change which ones at any time. Do not use tools to hide your location to get around this.
      </p>
    ),
  },
  {
    title: '10. Our rights and your content',
    body: (
      <p>
        The {BRAND.name} name, design and software belong to us. You keep ownership of what you say and show, but you give us
        permission to process it as needed to run the service, including moderation, and as described in the Privacy policy.
      </p>
    ),
  },
  {
    title: '11. Liability',
    body: (
      <p>
        To the fullest extent the law allows, we are not responsible for what other users say or do, or for losses caused by
        using or being unable to use the service. Nothing in these terms limits liability that cannot be limited by law (for
        example for death or personal injury caused by negligence, or for fraud).
      </p>
    ),
  },
  {
    title: '12. Changes, ending use, and governing law',
    body: (
      <>
        <p>
          We may update these terms. The date at the top shows the latest version; if you keep using the service after a change
          you accept it. You can stop using {BRAND.name} at any time, and we may suspend or end access if these terms are
          broken.
        </p>
        <p>
          These terms are governed by the law of Pakistan, and the courts of Pakistan will have jurisdiction,
          except where the law gives you the right to use your local courts.
        </p>
      </>
    ),
  },
];

const PRIVACY: Section[] = [
  {
    title: '1. Who is responsible',
    body: (
      <p>
        {BRAND.name} (“we”, “us”) is responsible for your data. Operator: Wavely, Pakistan. Contact:{' '}
        {BRAND.supportEmail}.
      </p>
    ),
  },
  {
    title: '2. What we collect',
    body: (
      <>
        <p>
          <strong>Account data.</strong>
        </p>
        <List
          items={[
            'Google sign-in: your email address, name and profile picture link from Google. We do not receive your Google password, and we do not keep Google access tokens.',
            'Email sign-up: your email, a securely hashed password (never the password itself), display name, date of birth, gender and country.',
            'Guests: a random guest name, your country, and your confirmation that you are 18 or over.',
            'Profile: the name, picture, date of birth and gender you choose to set. Pictures you upload are small images stored with your profile.',
          ]}
        />
        <p>
          <strong>Technical data.</strong>
        </p>
        <List
          items={[
            'Your IP address, stored in plain text against your account and updated each time you connect. We use it for safety, bans and abuse limits.',
            'Your country, worked out from your IP address by our network provider (Cloudflare), to apply regional restrictions and filters.',
            'A random device ID generated in your browser, used to enforce bans and limits.',
            'Short-lived counters (kept for minutes to a day) that include your IP address or user ID, used for rate limits.',
            'Usage data: your daily minutes and matches, call start and end times, your daily streak, and your friends and blocks.',
          ]}
        />
        <p>
          <strong>Messages and reports.</strong>
        </p>
        <List
          items={[
            'In-call chat messages are relayed by our server and held temporarily (up to three hours, last 50 lines per call) so they can be attached to a report. They are not kept afterwards unless a report is made.',
            'Direct messages between friends are stored until you delete your account.',
            'When someone reports a call, we save a screenshot of the reported person’s video and the recent in-call chat. Our software can also file an automatic report, with a screenshot, if it detects possible nudity in a video.',
            'Payments: if you subscribe, Stripe collects your payment details. We keep your Stripe customer and subscription IDs, plan and billing period, not your card number.',
          ]}
        />
      </>
    ),
  },
  {
    title: '3. Video and audio',
    body: (
      <>
        <p>
          Video and audio are sent through our media provider, LiveKit (LiveKit Cloud), and encrypted in transit. We do not
          record calls and do not store video or audio. This is not end-to-end encrypted: media passes through LiveKit’s
          servers to connect you.
        </p>
        <p>
          Nudity detection runs on your own device. Only when it flags something, or when you or another user presses Report,
          is a single screenshot sent to us.
        </p>
      </>
    ),
  },
  {
    title: '4. Why we use your data',
    body: (
      <List
        items={[
          'To provide the service: sign-in, matching, calls, friends, plans and limits.',
          'To keep people safe: moderation, reports, bans, preventing under-18 use and abuse, and complying with the law.',
          'To run the business: billing, support, security notices and sending verification and password-reset emails.',
          'We do not sell your personal data and we do not use it for advertising. We do not run analytics or ad trackers.',
        ]}
      />
    ),
  },
  {
    title: '5. How long we keep it',
    body: (
      <List
        items={[
          'Account data: until you delete your account.',
          'Guest accounts without reports: deleted after 7 days.',
          'Report evidence (screenshot and chat): deleted 30 days after the report. If it leads to a suspension or ban, 90 days after the decision. Reports about possible harm to minors, and reports passed to the authorities, can be kept longer while we review them or the law requires it.',
          'The record that a report was made (reason, status and who was involved) is kept so we can enforce bans and spot repeat abuse.',
          'Bans: device bans last 90 days and IP bans 7 days.',
          'Backups: database backups are kept for about 14 days, so deleted data can remain there for that long.',
          'Login cookies: 7 days for accounts and about 4 hours for guests.',
        ]}
      />
    ),
  },
  {
    title: '6. Who we share it with',
    body: (
      <>
        <p>We use these providers to run {BRAND.name}. They process data on our behalf:</p>
        <List
          items={[
            'Cloudflare: network security, hosting of the website, and country detection from your IP address.',
            'Railway: hosting of our servers and databases.',
            'LiveKit: video, audio and connection relay for calls.',
            'Google: sign-in, and Google Fonts, which loads fonts from Google’s servers and therefore sends your IP address to Google.',
            'Stripe: payments and subscriptions.',
            'Our email provider: sending verification, password-reset and security emails.',
          ]}
        />
        <p>
          Moderators can see reports, evidence and the account details needed to act on them. Other users see only your display
          name, picture and country if you share them. We may disclose data to authorities or child-safety organisations where
          the law requires it, or to protect someone from harm.
        </p>
        <p>These providers may handle data outside your country. Where required we rely on appropriate safeguards.</p>
      </>
    ),
  },
  {
    title: '7. Cookies and local storage',
    body: (
      <>
        <p>We only use what is needed to run the service. There are no analytics or advertising cookies.</p>
        <List
          items={[
            'ovc_session: keeps you signed in (HttpOnly, 7 days for accounts, about 4 hours for guests).',
            'ovc_oauth: protects Google sign-in (10 minutes).',
            'Local storage in your browser: a device ID, your cached profile, your camera and microphone choice, your filters and your chat layout.',
          ]}
        />
      </>
    ),
  },
  {
    title: '8. Your choices and rights',
    body: (
      <>
        <List
          items={[
            'Access and download: use “Download my data” on your account page for a copy of your data.',
            'Edit: change your name, picture and profile details on your account page.',
            'Delete: delete your account from your account page. We then erase your profile, messages, friends and other data. If you appear in a report we keep an anonymised record of it, and bans on your device or IP address stay in force.',
            'Other rights: depending on where you live (for example the EU, the UK or California) you may also have the right to object, restrict processing, or complain to a data protection authority. Contact us at the address below.',
          ]}
        />
      </>
    ),
  },
  {
    title: '9. Children',
    body: (
      <p>
        {BRAND.name} is not for anyone under 18. If you believe a child is using it, report them. If we learn that we hold data
        from someone under 18 we will delete it, except where we must keep evidence for safety or legal reasons.
      </p>
    ),
  },
  {
    title: '10. Security and changes',
    body: (
      <p>
        We protect data with encryption in transit, hashed passwords, access limits for moderators and an audit log of
        moderation actions. No system is perfectly secure. We may update this policy; the date at the top shows the latest
        version, and we will take reasonable steps to tell you about important changes.
      </p>
    ),
  },
];
