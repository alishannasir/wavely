import { Link } from 'react-router-dom';
import PageShell from '../../components/ui/PageShell';
import guides from '../../seo/guides.json';

export default function Guides() {
  return (
    <PageShell>
      <h1 className="mb-3 text-center font-display text-4xl font-semibold text-brand">Guides</h1>
      <p className="mx-auto mb-8 max-w-2xl text-center text-muted">
        Tips for safe, friendly random video chat: staying safe, starting conversations and how it all works.
      </p>
      <div className="grid gap-5 md:grid-cols-2">
        {guides.map((g) => (
          <Link key={g.slug} to={`/guides/${g.slug}`} className="rounded-3xl bg-white p-6 shadow-sm transition hover:shadow-md">
            <h2 className="mb-2 font-display text-2xl text-brand">{g.h1}</h2>
            <p className="text-muted">{g.description}</p>
            <span className="mt-3 inline-block text-sm font-semibold text-accent">Read the guide →</span>
          </Link>
        ))}
      </div>
    </PageShell>
  );
}
