import PageShell from '../../components/ui/PageShell';
import { BRAND } from '../../brand';

/** Placeholder legal pages. Replace the text with your real documents before launch. */
export function Terms() {
  return <LegalPage title="Terms of service" />;
}
export function Privacy() {
  return <LegalPage title="Privacy policy" />;
}

function LegalPage({ title }: { title: string }) {
  return (
    <PageShell>
      <h1 className="mb-6 text-center font-display text-4xl font-semibold text-brand">{title}</h1>
      <div className="mx-auto max-w-3xl rounded-3xl bg-white p-6 text-muted shadow-sm">
        <p className="mb-3 rounded-xl bg-brand-50 p-3 text-sm text-ink">
          <strong>Placeholder.</strong> The real {title.toLowerCase()} for {BRAND.name} still needs to be written (ideally with a
          lawyer) and put here. See docs/MODERATION.md for the evidence-retention and reporting decisions it must cover.
        </p>
        <p>Contact us at {BRAND.supportEmail}.</p>
      </div>
    </PageShell>
  );
}
