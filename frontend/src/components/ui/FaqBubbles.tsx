import { LogoMark } from '../brand/Logo';

export interface FaqItem {
  q: string;
  a: string;
}

/** The FAQ as a conversation: questions on the left, answers from the brand on the right. */
export default function FaqBubbles({ items }: { items: FaqItem[] }) {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      {items.map((item) => (
        <div key={item.q} className="flex flex-col gap-3">
          <div className="flex items-start gap-2">
            <span aria-hidden className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-lg">🙂</span>
            <p className="rounded-2xl rounded-tl-sm bg-white px-4 py-3 font-semibold text-brand shadow-sm">{item.q}</p>
          </div>
          <div className="flex items-start justify-end gap-2">
            <p className="rounded-2xl rounded-tr-sm bg-brand px-4 py-3 text-white shadow-sm">{item.a}</p>
            <span className="mt-1 shrink-0">
              <LogoMark size={36} />
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
