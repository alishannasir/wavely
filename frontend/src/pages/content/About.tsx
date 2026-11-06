import PageShell from '../../components/ui/PageShell';
import { BRAND } from '../../brand';

export default function About() {
  return (
    <PageShell>
      <h1 className="mb-8 text-center font-display text-4xl font-semibold text-brand">About {BRAND.name}</h1>
      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-3xl bg-white p-6 shadow-sm">
          <h2 className="mb-2 font-display text-2xl text-brand">Random video chat, simplified</h2>
          <p className="text-muted">
            {BRAND.name} pairs you with another person for a live video conversation. Press Start, say hello, and press Next
            whenever you want to move on. Text chat sits right next to the video, so you can type if you prefer.
          </p>
        </section>
        <section className="rounded-3xl bg-white p-6 shadow-sm">
          <h2 className="mb-2 font-display text-2xl text-brand">Built to be friendly</h2>
          <p className="text-muted">
            Everyone must be 18 or older and accept the chat rules before their first chat. Reports reach our moderators with a
            screenshot and the recent messages, and repeated offenders are banned, including by device.
          </p>
        </section>
        <section className="rounded-3xl bg-white p-6 shadow-sm">
          <h2 className="mb-2 font-display text-2xl text-brand">Free to use, Premium to go further</h2>
          <p className="text-muted">
            You can chat without an account. A free account unlocks friends and messages. Premium removes the daily limits and
            lets you choose the gender and country you meet.
          </p>
        </section>
        <section className="rounded-3xl bg-white p-6 shadow-sm">
          <h2 className="mb-2 font-display text-2xl text-brand">Your privacy</h2>
          <p className="text-muted">
            Video travels between you and the other person through a secure media server and is not recorded. We only keep a
            screenshot and chat lines when someone files a report, and delete them after a short retention period.
          </p>
        </section>
      </div>
    </PageShell>
  );
}
