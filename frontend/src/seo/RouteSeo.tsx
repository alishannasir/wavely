import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import seo from './routes.json';

function setMeta(selector: string, attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

/** Keeps the tab title, description, canonical and robots tags in step with the route (client-side navigation). */
export default function RouteSeo() {
  const { pathname } = useLocation();
  useEffect(() => {
    const path = pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname;
    const route = seo.routes.find((r) => r.path === path);
    const title = route?.title ?? seo.siteName;
    document.title = title;
    if (route) {
      setMeta('meta[name="description"]', 'name', 'description', route.description);
      setMeta('meta[property="og:title"]', 'property', 'og:title', route.title);
      setMeta('meta[property="og:description"]', 'property', 'og:description', route.description);
      setMeta('meta[property="og:url"]', 'property', 'og:url', seo.siteUrl + route.path);
      // The build writes a canonical for production only; keep it right on client-side navigation.
      const canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
      if (canonical) canonical.href = seo.siteUrl + (route.path === '/' ? '/' : route.path);
    }
    // Pages that are not in the list (app screens, account, admin...) should never be indexed.
    const robots = document.head.querySelector<HTMLMetaElement>('meta[name="robots"]');
    const staging = robots?.content.includes('nofollow');
    if (!staging) setMeta('meta[name="robots"]', 'name', 'robots', route ? 'index, follow' : 'noindex, nofollow');
  }, [pathname]);
  return null;
}
