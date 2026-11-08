import { useMemo, useState } from 'react';
import { searchCountries } from '../../lib/countries';
import { inputCls } from '../../lib/ui';

/**
 * Pick a country from the whole world: type to search (by name, code or nickname such as "uk"), or scroll.
 * `null` means "anywhere".
 */
export default function CountryPicker({ value, onChange }: { value: string | null; onChange: (code: string | null) => void }) {
  const [query, setQuery] = useState('');
  const results = useMemo(() => searchCountries(query), [query]);
  const showAnywhere = !query.trim();

  const row = (selected: boolean) =>
    `flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition hover:bg-surface-2 focus:bg-surface-2 focus:outline-none ${selected ? 'bg-brand-50 font-semibold' : ''}`;

  return (
    <div className="flex flex-col gap-2">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && results[0]) {
            e.preventDefault();
            onChange(results[0].code); // Enter picks the top match
          }
        }}
        placeholder="Search countries…"
        aria-label="Search countries"
        autoComplete="off"
        className={inputCls}
      />
      <ul role="listbox" aria-label="Countries" className="max-h-56 overflow-y-auto rounded-xl border border-line p-1">
        {showAnywhere && (
          <li role="option" aria-selected={value === null}>
            <button type="button" className={row(value === null)} onClick={() => onChange(null)}>
              <span className="text-xl" aria-hidden>🌐</span> Anywhere in the world
              {value === null && <span className="ml-auto text-brand" aria-hidden>✓</span>}
            </button>
          </li>
        )}
        {results.map((c) => (
          <li key={c.code} role="option" aria-selected={value === c.code}>
            <button type="button" className={row(value === c.code)} onClick={() => onChange(c.code)}>
              <span className="text-xl" aria-hidden>{c.flag}</span> {c.name}
              {value === c.code && <span className="ml-auto text-brand" aria-hidden>✓</span>}
            </button>
          </li>
        ))}
        {results.length === 0 && <li className="px-3 py-4 text-center text-sm text-muted">No country matches “{query}”.</li>}
      </ul>
    </div>
  );
}
