import PageShell from '../../components/ui/PageShell';
import FaqBubbles, { FaqItem } from '../../components/ui/FaqBubbles';
import { BRAND } from '../../brand';

const ITEMS: FaqItem[] = [
  { q: `Is ${BRAND.name} free?`, a: 'Yes. You can start chatting for free without an account. Premium removes the daily limits and adds filters.' },
  { q: 'Do I need to sign up?', a: 'No. Press Start chatting and confirm you are 18+. Create an account later to add friends, message them and keep your history.' },
  { q: 'How old do I have to be?', a: 'You must be 18 or older. Accounts under 18 are not allowed and will be banned.' },
  { q: 'Is the video recorded?', a: 'No. Video goes through a secure media server and is not stored. If someone reports you or you report someone, a screenshot and the recent chat lines are saved for moderators and deleted after a retention period.' },
  { q: 'Someone broke the rules. What do I do?', a: 'Press Report on their video, choose a reason and you move on to someone new. Moderators review reports, and repeat offenders are banned, including by device.' },
  { q: 'Why was my video blurred?', a: 'Your device checks the stranger’s video and hides it if it looks explicit. It is also sent to moderators. You can show it anyway or press Next.' },
  { q: 'What do the daily limits mean?', a: 'Free accounts have a daily number of chat minutes and matches. Premium has no limits. The timer in the call shows how much time you have left today.' },
  { q: 'Can I choose who I meet?', a: 'Premium members can pick a country and a gender. If nobody matches for a while, the filters are relaxed so you are not left waiting.' },
];

export default function Faq() {
  return (
    <PageShell>
      <h1 className="mb-8 text-center font-display text-4xl font-semibold text-brand">Frequently asked questions</h1>
      <FaqBubbles items={ITEMS} />
    </PageShell>
  );
}
