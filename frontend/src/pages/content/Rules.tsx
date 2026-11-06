import PageShell from '../../components/ui/PageShell';
import { BRAND } from '../../brand';

const SECTIONS: { title: string; items: string[] }[] = [
  {
    title: '1. Be respectful',
    items: [
      'No insults, harassment, bullying or threats.',
      'No discrimination based on race, religion, nationality, gender, age or appearance.',
      'No obscene language or rude gestures.',
    ],
  },
  {
    title: '2. Video chat is a public space',
    items: [
      'No nudity, underwear or intimate body parts, covered or not.',
      'Do not point the camera below the chest or hide your face while watching others.',
      'No sexual gestures, sounds or conversation.',
    ],
  },
  {
    title: '3. Protect your privacy and others’',
    items: [
      'Do not share addresses, phone numbers, passwords or payment details.',
      'Do not record, screenshot or share other people’s video.',
    ],
  },
  {
    title: '4. No spam or promotion',
    items: [
      'No advertising, links to other sites or asking people to subscribe, follow or vote.',
      'No scams, begging or selling.',
    ],
  },
  {
    title: '5. Reporting',
    items: [
      'Use Report on the video. Moderators receive a screenshot of the other person’s video and the recent messages.',
      'Several reports in a short time can lead to an automatic restriction while a moderator reviews it.',
      'Respond to bad behaviour by reporting it, not by copying it.',
    ],
  },
  {
    title: '6. Age restriction',
    items: [
      `${BRAND.name} is for people 18 and over only. Minors are banned on sight.`,
      'Parents can use device parental controls to block the app or site.',
    ],
  },
  {
    title: '7. Do not tamper with the service',
    items: ['No bots, scripts or add-ons that change how the service works.', 'No attempts to bypass bans or limits.'],
  },
];

export default function Rules() {
  return (
    <PageShell>
      <h1 className="mx-auto mb-4 max-w-2xl text-center font-display text-4xl font-semibold text-brand">
        {BRAND.name} rules — safe and fun video chat
      </h1>
      <p className="mx-auto mb-10 max-w-2xl text-center text-muted">
        By using {BRAND.name} you agree to these rules. Moderators watch for violations and ban those who break them.
      </p>
      <div className="mx-auto max-w-3xl space-y-8">
        {SECTIONS.map((s) => (
          <section key={s.title}>
            <h2 className="mb-2 font-display text-xl font-semibold text-brand">{s.title}</h2>
            <ul className="list-disc space-y-1 pl-6 text-muted">
              {s.items.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          </section>
        ))}
        <section className="rounded-3xl bg-white p-6 shadow-sm">
          <h2 className="mb-2 font-display text-xl font-semibold text-brand">Our advice</h2>
          <p className="text-muted">
            Keep your face visible, be polite, and enjoy meeting people. If someone makes you uncomfortable, press Next or
            Report.
          </p>
        </section>
      </div>
    </PageShell>
  );
}
