import { FormEvent, ReactNode, useEffect, useRef, useState } from 'react';
import { LogoMark } from '../brand/Logo';
import FlagPill from '../ui/FlagPill';

export type ChatMsg =
  | { id: number; kind: 'me' | 'peer'; text: string; /** matches the server's acknowledgement of what the other person sees */ cid?: number }
  | { id: number; kind: 'bot'; text?: string; node?: ReactNode; country?: string | null };

const EMOJIS = ['😀', '😂', '😍', '😊', '😉', '😎', '🤔', '😢', '👍', '👋', '🙏', '❤️', '🔥', '🎉', '🙌', '😴'];

interface Props {
  messages: ChatMsg[];
  /** Typing is only possible while connected to someone. */
  canSend: boolean;
  onSend: (text: string) => void;
  /** Shown as a link in the "connection established" bubble. */
  onReport?: () => void;
  /** Extra bot bubble after the messages (plan / usage info on the idle screen). */
  note?: ReactNode;
  className?: string;
  /** `floating` drops the card look (the floating window provides it). */
  variant?: 'card' | 'floating';
}

/** Chat bubbles + input. Bot bubbles carry the brand mark, like a support-style conversation. */
export default function ChatPanel({ messages, canSend, onSend, onReport, note, className = '', variant = 'card' }: Props) {
  const [draft, setDraft] = useState('');
  const [emojiOpen, setEmojiOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages]);

  function submit(e: FormEvent) {
    e.preventDefault();
    const text = draft.trim().slice(0, 500);
    if (!text || !canSend) return;
    onSend(text);
    setDraft('');
    setEmojiOpen(false);
  }

  return (
    <section aria-label="Chat" className={`relative flex min-h-0 flex-col ${variant === 'card' ? 'rounded-2xl bg-white shadow-sm' : ''} ${className}`}>
      <div className="flex-1 space-y-2 overflow-y-auto p-3" role="log" aria-live="polite">
        {messages.map((m) =>
          m.kind === 'bot' ? (
            <div key={m.id} className="flex items-start gap-2">
              <span className="mt-0.5 shrink-0">
                <LogoMark size={26} />
              </span>
              <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-surface-2 px-3 py-2 text-sm">
                {m.text}
                {m.node}
                {m.country !== undefined && (
                  <span className="mt-1 flex flex-wrap items-center gap-2">
                    <span>Connection established</span>
                    <FlagPill country={m.country} />
                    {onReport && (
                      <button onClick={onReport} className="font-semibold text-accent underline">
                        Report abuse
                      </button>
                    )}
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div
              key={m.id}
              className={`w-fit max-w-[85%] break-words rounded-2xl px-3 py-2 text-sm ${
                m.kind === 'me' ? 'ml-auto rounded-br-sm bg-brand text-white' : 'rounded-bl-sm bg-brand-50 text-ink'
              }`}
            >
              {m.text}
            </div>
          ),
        )}
        {note && (
          <div className="flex items-start gap-2">
            <span className="mt-0.5 shrink-0">
              <LogoMark size={26} />
            </span>
            <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-surface-2 px-3 py-2 text-sm">{note}</div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {emojiOpen && (
        <div className="absolute bottom-14 right-2 z-10 grid grid-cols-8 gap-1 rounded-2xl border border-line bg-white p-2 shadow-lg" role="menu">
          {EMOJIS.map((e) => (
            <button key={e} type="button" className="rounded-lg p-1 text-xl hover:bg-surface-2" onClick={() => setDraft((d) => d + e)}>
              {e}
            </button>
          ))}
        </div>
      )}

      <form onSubmit={submit} className="flex items-center gap-2 border-t border-line p-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={500}
          disabled={!canSend}
          placeholder={canSend ? 'Write a message' : 'Start a chat to write a message'}
          aria-label="Chat message"
          className="min-w-0 flex-1 rounded-xl bg-transparent px-2 py-2 text-base placeholder:text-muted/70 focus:outline-none"
        />
        <button
          type="button"
          aria-label="Emoji"
          aria-expanded={emojiOpen}
          disabled={!canSend}
          onClick={() => setEmojiOpen((o) => !o)}
          className="rounded-full p-1 text-2xl opacity-70 hover:opacity-100 disabled:opacity-30"
        >
          🙂
        </button>
      </form>
    </section>
  );
}
