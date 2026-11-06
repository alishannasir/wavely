import PageShell, { Card } from '../components/ui/PageShell';

export default function RegionBlocked() {
  return (
    <PageShell center>
      <Card className="text-center">
        <div className="mb-3 text-5xl" aria-hidden>🌍</div>
        <h1 className="mb-2 font-display text-3xl font-semibold text-brand">Not available in your region</h1>
        <p className="text-muted">This service is currently only available in selected countries. We hope to expand soon.</p>
      </Card>
    </PageShell>
  );
}
