// Runs after `vite build`. For each public page it writes dist/<path>/index.html with its own title, description,
// canonical, Open Graph / Twitter tags, JSON-LD and a short plain-HTML summary inside #root (React replaces it on load),
// so crawlers and link-preview bots see real content. It also writes robots.txt and sitemap.xml.
// Staging builds (SITE_ENV=staging, or a VITE_API_URL containing "staging") are marked noindex everywhere.
import { mkdirSync, readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const seo = JSON.parse(readFileSync(join(root, 'src/seo/routes.json'), 'utf8'));
const guides = JSON.parse(readFileSync(join(root, 'src/seo/guides.json'), 'utf8'));
const site = (process.env.SITE_URL || seo.siteUrl).replace(/\/$/, '');
const staging = process.env.SITE_ENV === 'staging' || (process.env.VITE_API_URL || '').includes('staging');
const ogImage = `${site}/og-image.png`;

const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const ld = (obj) => `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>`;

const template = readFileSync(join(dist, 'index.html'), 'utf8');
// The template's own title/description are replaced per page.
const base = template
  .replace(/<title>[\s\S]*?<\/title>\s*/i, '')
  .replace(/<meta\s+name="description"[^>]*>\s*/i, '');

function structuredData(route) {
  const out = [];
  if (route.path === '/') {
    out.push(ld({ '@context': 'https://schema.org', '@type': 'WebSite', name: seo.siteName, url: `${site}/` }));
    out.push(ld({ '@context': 'https://schema.org', '@type': 'Organization', name: seo.siteName, url: `${site}/`, logo: `${site}/icon-512.png` }));
  }
  if (route.path === '/faq') {
    out.push(ld({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: seo.faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
    }));
  }
  if (route.article) {
    out.push(ld({
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: route.h1,
      description: route.description,
      dateModified: route.article.updated,
      datePublished: route.article.updated,
      mainEntityOfPage: `${site}${route.path}`,
      image: ogImage,
      author: { '@type': 'Organization', name: seo.siteName },
      publisher: { '@type': 'Organization', name: seo.siteName, logo: { '@type': 'ImageObject', url: `${site}/icon-512.png` } },
    }));
  }
  return out.join('\n    ');
}

function page(route) {
  const url = `${site}${route.path === '/' ? '/' : route.path}`;
  const head = [
    `<title>${esc(route.title)}</title>`,
    `<meta name="description" content="${esc(route.description)}" />`,
    `<meta name="robots" content="${staging ? 'noindex, nofollow' : 'index, follow'}" />`,
    staging ? '' : `<link rel="canonical" href="${url}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${esc(seo.siteName)}" />`,
    `<meta property="og:title" content="${esc(route.title)}" />`,
    `<meta property="og:description" content="${esc(route.description)}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:image" content="${ogImage}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(route.title)}" />`,
    `<meta name="twitter:description" content="${esc(route.description)}" />`,
    `<meta name="twitter:image" content="${ogImage}" />`,
    structuredData(route),
  ].filter(Boolean).join('\n    ');

  const nav = seo.routes.filter((r) => r.path !== '/' && r.priority >= 0.7)
    .map((r) => `<a href="${r.path}">${esc(r.h1)}</a>`).join(' · ');
  const body = route.article
    ? `<p>${esc(route.article.intro)}</p>` + route.article.sections.map((sec) =>
        `<h2>${esc(sec.h)}</h2>` +
        (sec.p || []).map((t) => `<p>${esc(t)}</p>`).join('') +
        (sec.ul ? `<ul>${sec.ul.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : '')).join('')
    : `<p>${esc(route.summary)}</p>`;
  const fallback = `<main style="max-width:40rem;margin:0 auto;padding:3rem 1.5rem;font-family:system-ui,sans-serif;${route.article ? 'text-align:left' : 'text-align:center'}">
      <h1>${esc(route.h1)}</h1>
      ${body}
      <p>${nav}</p>
    </main>`;

  return base
    .replace('</head>', `    ${head}\n  </head>`)
    .replace('<div id="root"></div>', `<div id="root">${fallback}</div>`);
}

const guidePages = guides.map((g) => ({
  path: `/guides/${g.slug}`, title: g.title, description: g.description, h1: g.h1, summary: g.intro, priority: '0.6', article: g, updated: g.updated,
}));
const allRoutes = [...seo.routes, ...guidePages];

for (const route of allRoutes) {
  const file = route.path === '/' ? join(dist, 'index.html') : join(dist, route.path, 'index.html');
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, page(route));
}

if (staging) {
  writeFileSync(join(dist, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
  appendFileSync(join(dist, '_headers'), '\n/*\n  X-Robots-Tag: noindex, nofollow\n');
} else {
  writeFileSync(join(dist, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: /admin\n\nSitemap: ${site}/sitemap.xml\n`);
  const today = new Date().toISOString().slice(0, 10);
  const urls = allRoutes.map((r) =>
    `  <url><loc>${site}${r.path === '/' ? '/' : r.path}</loc><lastmod>${r.updated || today}</lastmod><priority>${r.priority}</priority></url>`).join('\n');
  writeFileSync(join(dist, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
}
if (!existsSync(join(dist, 'og-image.png'))) console.warn('seo: public/og-image.png is missing');
console.log(`seo: ${allRoutes.length} pages written for ${staging ? 'STAGING (noindex)' : site}`);
