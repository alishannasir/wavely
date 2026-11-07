import { Link, Navigate, useParams } from 'react-router-dom';
import PageShell from '../../components/ui/PageShell';
import ChunkyButton from '../../components/ui/ChunkyButton';
import guides from '../../seo/guides.json';

export default function Guide() {
  const { slug } = useParams();
  const guide = guides.find((g) => g.slug === slug);
  if (!guide) return <Navigate to="/guides" replace />;
  const others = guides.filter((g) => g.slug !== guide.slug);
  return (
    <PageShell>
      <article className="mx-auto max-w-2xl">
        <p className="mb-2 text-sm text-muted">
          <Link to="/guides" className="text-accent hover:underline">Guides</Link> · Updated {guide.updated}
        </p>
        <h1 className="mb-4 font-display text-4xl font-semibold text-brand">{guide.h1}</h1>
        <p className="mb-8 text-lg text-muted">{guide.intro}</p>
        {guide.sections.map((s) => (
          <section key={s.h} className="mb-6">
            <h2 className="mb-2 font-display text-2xl text-brand">{s.h}</h2>
            {s.p?.map((t) => <p key={t} className="mb-2 text-ink">{t}</p>)}
            {s.ul && (
              <ul className="ml-5 list-disc space-y-1 text-ink">
                {s.ul.map((t) => <li key={t}>{t}</li>)}
              </ul>
            )}
          </section>
        ))}
        <div className="my-10 rounded-3xl bg-white p-6 text-center shadow-sm">
          <p className="mb-3 font-display text-xl text-brand">Ready to meet someone new?</p>
          <ChunkyButton to="/chat">Start chatting</ChunkyButton>
        </div>
        <h2 className="mb-3 font-display text-xl text-brand">More guides</h2>
        <ul className="space-y-1">
          {others.map((g) => (
            <li key={g.slug}><Link to={`/guides/${g.slug}`} className="text-accent hover:underline">{g.h1}</Link></li>
          ))}
        </ul>
      </article>
    </PageShell>
  );
}
