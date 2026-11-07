import { Link } from 'react-router-dom';
import Logo from '../brand/Logo';
import { BRAND } from '../../brand';

export default function SiteFooter() {
  return (
    <footer className="border-t border-line bg-white">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-6 text-sm text-muted md:flex-row">
        <Logo size={28} />
        <nav className="flex flex-wrap justify-center gap-x-6 gap-y-2" aria-label="Footer">
          <Link to="/guides" className="text-brand hover:underline">Guides</Link>
          <Link to="/rules" className="text-brand hover:underline">Rules</Link>
          <Link to="/terms" className="text-brand hover:underline">Terms</Link>
          <Link to="/privacy" className="text-brand hover:underline">Privacy</Link>
          <a href={`mailto:${BRAND.supportEmail}`} className="text-brand hover:underline">Contacts</a>
        </nav>
        <p>© {new Date().getFullYear()} {BRAND.name}. 18+ only.</p>
      </div>
    </footer>
  );
}
