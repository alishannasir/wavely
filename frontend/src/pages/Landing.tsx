import { Link } from 'react-router-dom';
import SiteHeader from '../components/ui/SiteHeader';
import SiteFooter from '../components/ui/SiteFooter';
import DoodleBackground from '../components/ui/DoodleBackground';
import ChunkyButton from '../components/ui/ChunkyButton';
import { LogoMark } from '../components/brand/Logo';
import { useStartChat } from '../components/ui/StartChat';
import { OnlineCount } from '../lib/online';
import { BRAND } from '../brand';

const FEATURES = [
  { icon: '🎥', title: 'Instant video chat', text: 'One tap and you are talking to someone new. No signup needed to try it.' },
  { icon: '🌍', title: 'People everywhere', text: 'Meet people from around the world, or choose a country with Premium.' },
  { icon: '🛡️', title: 'Safety first', text: 'Moderators and automatic checks keep the chat friendly. Report anyone in one tap.' },
  { icon: '💬', title: 'Chat and make friends', text: 'Say hi in text, then add the people you like and call them again later.' },
];

/** Decorative phone showing a fake call, drawn in CSS (no photos). */
function PhoneMock() {
  return (
    <div className="mx-auto w-56 rounded-[2.2rem] border-[6px] border-white bg-stage p-2 shadow-2xl sm:w-64" aria-hidden>
      <div className="flex aspect-[9/16] flex-col overflow-hidden rounded-[1.6rem] bg-gradient-to-b from-brand-700 to-brand">
        <div className="flex flex-1 items-center justify-center">
          <LogoMark size={84} mono />
        </div>
        <div className="mx-3 mb-3 rounded-2xl bg-white/15 p-3 text-center text-xs text-white">Connected 🇨🇦 Canada</div>
        <div className="mx-3 mb-4 grid grid-cols-4 gap-2 text-center text-xl">
          <span>❤️</span><span>😂</span><span>👍</span><span>😍</span>
        </div>
      </div>
    </div>
  );
}

export default function Landing() {
  const { start, modal } = useStartChat();

  return (
    <div className="min-h-screen bg-page">
      <SiteHeader onStart={start} />

      <DoodleBackground tone="brand" className="px-4 py-14 text-center md:py-20">
        <div className="mx-auto max-w-3xl">
          <h1 className="font-display text-4xl font-semibold leading-tight md:text-6xl">
            Free random video chat — meet someone new today
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-white/90">{BRAND.description}</p>
          <div className="mt-8 flex flex-col items-center gap-4">
            <ChunkyButton size="lg" onClick={start} className="min-w-[16rem]">
              Start chatting now!
            </ChunkyButton>
            <OnlineCount tone="dark" />
            <p className="text-sm text-white/80">
              No signup needed.{' '}
              <Link to="/signup" className="font-semibold underline">Create an account</Link> to add friends and use filters.
            </p>
          </div>
        </div>
      </DoodleBackground>

      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 md:grid-cols-[1fr_auto_1fr]">
        <div>
          <h2 className="font-display text-3xl font-semibold text-brand">Discover the thrill of random chats</h2>
          <p className="mt-3 text-muted">
            {BRAND.name} connects you with a real person in seconds. Not feeling it? Hit Next and meet someone else. You decide
            who you talk to and for how long.
          </p>
        </div>
        <PhoneMock />
        <div>
          <h2 className="font-display text-3xl font-semibold text-brand">Stay in control</h2>
          <p className="mt-3 text-muted">
            Keep your face visible, be kind, and report anything that breaks the rules. Our moderators review reports around the
            clock and ban rule breakers.
          </p>
          <Link to="/rules" className="mt-3 inline-block font-display text-lg text-accent hover:underline">
            Read the chat rules →
          </Link>
        </div>
      </section>

      <section className="bg-white py-14">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-3xl bg-page p-6 text-center">
              <div className="mb-3 text-4xl" aria-hidden>{f.icon}</div>
              <h3 className="font-display text-xl font-semibold text-brand">{f.title}</h3>
              <p className="mt-2 text-sm text-muted">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      <DoodleBackground tone="light" className="px-4 py-14 text-center">
        <h2 className="font-display text-3xl font-semibold text-brand">Ready to say hi?</h2>
        <div className="mt-6">
          <ChunkyButton size="lg" onClick={start}>
            Start chatting now!
          </ChunkyButton>
        </div>
      </DoodleBackground>

      <SiteFooter />
      {modal}
    </div>
  );
}
