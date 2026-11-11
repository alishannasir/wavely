import { Suspense, lazy } from 'react';
import { Link } from 'react-router-dom';
import SiteHeader from '../components/ui/SiteHeader';
import SiteFooter from '../components/ui/SiteFooter';
import DoodleBackground from '../components/ui/DoodleBackground';
import ChunkyButton from '../components/ui/ChunkyButton';
import Logo, { LogoMark } from '../components/brand/Logo';
import StaticNoise from '../components/ui/StaticNoise';
import { useStartChat } from '../components/ui/StartChat';
import { OnlineCount } from '../lib/online';
import { useSignedInUser } from '../store/auth';
import { BRAND } from '../brand';
import seo from '../seo/routes.json';

// Loaded only when the visitor has a session, so the camera and video code stay out of the first page load.
const EmbeddedChat = lazy(() => import('./Chat'));

const STEPS = [
  { n: '1', title: 'Press Start', text: 'Confirm you are 18 or older and allow your camera. No account is needed to try it.' },
  { n: '2', title: 'Meet someone new', text: 'You are paired with a real person from around the world for a live video chat.' },
  { n: '3', title: 'Chat, or press Next', text: 'Talk, type in the text chat, or move on to someone else whenever you like. Add people you click with as friends.' },
];

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
  const user = useSignedInUser();
  const account = user && !user.isGuest ? user : null;

  return (
    <div className="min-h-screen bg-page">
      <SiteHeader onStart={start} />

      <DoodleBackground tone="brand" className="px-3 py-5 text-center md:py-6">
        <div className="mx-auto max-w-6xl">
          {/* The headline is not shown (the chat is the page), but the page keeps its main heading for search engines and screen readers. */}
          <h1 className="sr-only">Free random video chat — meet someone new today</h1>
          <div className="mx-auto mt-4 h-[40rem] w-full text-left md:h-[max(34rem,calc(100dvh-9.5rem))]">
            {user ? (
              <Suspense fallback={<div className="h-full w-full animate-pulse rounded-3xl bg-white/10" aria-label="Loading chat" />}>
                <EmbeddedChat embedded />
              </Suspense>
            ) : (
              // Same card as the live chat. The camera only opens after the visitor accepts the 18+ rules, so until then
              // the right half holds the Start button instead of the camera.
              <div className="grid h-full grid-rows-2 overflow-hidden rounded-3xl bg-stage shadow-2xl md:grid-cols-2 md:grid-rows-1">
                <div className="relative min-h-0 overflow-hidden">
                  <StaticNoise />
                  <div className="absolute inset-0 flex items-center justify-center p-4">
                    <div className="rounded-3xl bg-white/95 p-4 shadow-lg">
                      <Logo size={44} />
                    </div>
                  </div>
                </div>
                <div className="flex min-h-0 flex-col items-center justify-center gap-4 bg-stage p-6 text-center text-white">
                  <ChunkyButton size="lg" onClick={start} className="min-w-[14rem]">
                    Start chatting now!
                  </ChunkyButton>
                  <OnlineCount tone="dark" />
                  <p className="text-sm text-white/80">
                    No signup needed.{' '}
                    <Link to="/signup" className="font-semibold underline">Create an account</Link> to add friends and use filters.
                  </p>
                </div>
              </div>
            )}
          </div>
          {user && (
          <div className="mt-8 flex flex-col items-center gap-4">
            <OnlineCount tone="dark" />
            {account ? (
              <p className="flex flex-wrap justify-center gap-x-5 gap-y-1 text-sm font-semibold text-white/90">
                <Link to="/friends" className="underline">Friends</Link>
                <Link to="/upgrade" className="underline">Premium</Link>
                <Link to="/me" className="underline">Your profile</Link>
              </p>
            ) : (
              <p className="text-sm text-white/80">
                No signup needed.{' '}
                <Link to="/signup" className="font-semibold underline">Create an account</Link> to add friends and use filters.
              </p>
            )}
          </div>
          )}
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

      <section className="mx-auto max-w-6xl px-4 py-14" aria-labelledby="how-it-works">
        <h2 id="how-it-works" className="text-center font-display text-3xl font-semibold text-brand">How {BRAND.name} works</h2>
        <ol className="mt-8 grid gap-6 md:grid-cols-3">
          {STEPS.map((s) => (
            <li key={s.n} className="rounded-3xl bg-white p-6 text-center shadow-sm">
              <span className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-brand font-display text-lg text-white">{s.n}</span>
              <h3 className="font-display text-xl font-semibold text-brand">{s.title}</h3>
              <p className="mt-2 text-sm text-muted">{s.text}</p>
            </li>
          ))}
        </ol>
        <p className="mt-6 text-center text-muted">
          New to random video chat? Read our <Link to="/guides/is-random-video-chat-safe" className="font-semibold text-accent underline">safety tips</Link> or
          see <Link to="/guides/how-random-video-chat-works" className="font-semibold text-accent underline">how matching works</Link>.
        </p>
      </section>

      <section className="bg-white py-14" aria-labelledby="home-faq">
        <div className="mx-auto max-w-3xl px-4">
          <h2 id="home-faq" className="text-center font-display text-3xl font-semibold text-brand">Questions people ask</h2>
          <div className="mt-6 space-y-3">
            {seo.faq.slice(0, 4).map((f) => (
              <details key={f.q} className="rounded-2xl bg-page p-4">
                <summary className="cursor-pointer font-semibold">{f.q}</summary>
                <p className="mt-2 text-muted">{f.a}</p>
              </details>
            ))}
          </div>
          <p className="mt-5 text-center">
            <Link to="/faq" className="font-display text-lg text-accent hover:underline">More questions and answers →</Link>
          </p>
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
