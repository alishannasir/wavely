import PageShell from '../../components/ui/PageShell';
import FaqBubbles, { FaqItem } from '../../components/ui/FaqBubbles';
import seo from '../../seo/routes.json';

const ITEMS: FaqItem[] = seo.faq; // same list feeds the FAQPage structured data (see scripts/seo-postbuild.mjs)

export default function Faq() {
  return (
    <PageShell>
      <h1 className="mb-8 text-center font-display text-4xl font-semibold text-brand">Frequently asked questions</h1>
      <FaqBubbles items={ITEMS} />
    </PageShell>
  );
}
