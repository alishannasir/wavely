import PageShell from '../../components/ui/PageShell';
import { BRAND } from '../../brand';

const ITEMS = [
  { icon: '🙋', title: 'Real people', text: 'Every conversation is with a real person, live, in seconds.' },
  { icon: '🆓', title: 'Free video chat', text: 'Chat without an account. Create one for friends, messages and more.' },
  { icon: '🤝', title: 'Make friends', text: 'Add someone you clicked with and call or message them whenever you like.' },
];
const PERKS = [
  ['Chat live', 'with thousands of people every day.'],
  ['Message friends', 'any time, even when you are offline.'],
  ['Choose a country', 'to meet people from a specific place (Premium).'],
  ['Stay safe', 'with reports, blocking-by-ban and automatic checks.'],
];

export default function Why() {
  return (
    <PageShell>
      <h1 className="mb-10 text-center font-display text-4xl font-semibold text-brand">Why people pick {BRAND.name}</h1>
      <div className="grid gap-6 md:grid-cols-3">
        {ITEMS.map((i) => (
          <div key={i.title} className="rounded-3xl bg-white p-8 text-center shadow-sm">
            <div className="mx-auto mb-4 flex h-24 w-24 items-center justify-center rounded-[2rem] bg-brand-50 text-5xl" aria-hidden>
              {i.icon}
            </div>
            <h2 className="font-display text-2xl text-brand">{i.title}</h2>
            <p className="mt-2 text-muted">{i.text}</p>
          </div>
        ))}
      </div>
      <div className="mt-8 grid gap-4 rounded-3xl bg-white p-6 shadow-sm sm:grid-cols-2">
        {PERKS.map(([title, text]) => (
          <p key={title} className="flex gap-3 text-muted">
            <span className="text-accent" aria-hidden>✔</span>
            <span><strong className="text-ink">{title}</strong> {text}</span>
          </p>
        ))}
      </div>
    </PageShell>
  );
}
