import { filterChatText } from './text-filter';

const guest = { allowLinks: false };
const verified = { allowLinks: true };

describe('filterChatText: profanity', () => {
  it('leaves normal text alone', () => {
    const r = filterChatText('Hi! Where are you from? I love football.', guest);
    expect(r).toEqual({ text: 'Hi! Where are you from? I love football.', changed: false, profanity: false, links: false });
  });
  it('masks swear words, including simple tricks', () => {
    for (const bad of ['you are a fuck', 'f u c k you', 'f.u.c.k', 'f-u-c-k you', 'fuuuuck off', 'sh1t', 'what a b!tch']) {
      const r = filterChatText(bad, verified);
      expect(r.profanity).toBe(true);
      expect(r.text).toContain('*');
      expect(r.text).not.toMatch(/fuck|shit|bitch/i);
    }
  });
  it('does not mangle innocent words that contain bad ones (the Scunthorpe problem)', () => {
    for (const ok of ['I live in Scunthorpe', 'a classic assassin', 'Cockburn street', 'I need a Bassett hound', 'shiitake mushrooms are tasty', 'Penistone is a town', 'I like cocktails', 'a spaced out p l a n for tomorrow']) {
      expect(filterChatText(ok, verified).profanity).toBe(false);
    }
  });
});

describe('filterChatText: links and contact details', () => {
  it('removes links, bare domains, emails and phone numbers for guests', () => {
    expect(filterChatText('visit https://evil.example/pay?x=1 now', guest).text).toBe('visit [link removed] now');
    expect(filterChatText('add me www.scam.com', guest).text).toBe('add me [link removed]');
    expect(filterChatText('t.me/somechannel is great', guest).text).toBe('[link removed] is great');
    expect(filterChatText('bit.ly/abc123', guest).text).toBe('[link removed]');
    expect(filterChatText('mail me at bob.smith@gmail.com please', guest).text).toBe('mail me at [contact removed] please');
    expect(filterChatText('call +1 (555) 123-4567 tonight', guest).text).toBe('call [contact removed] tonight');
    expect(filterChatText('my number 0300 1234567', guest).links).toBe(true);
  });
  it('allows them for verified accounts', () => {
    const r = filterChatText('look at https://example.com/page and mail a@b.co', verified);
    expect(r.changed).toBe(false);
  });
  it('does not treat normal numbers or file-like words as contact details', () => {
    for (const ok of ['I am 25 years old', 'room 4521', 'it costs 1999 dollars', 'e.g. this is fine', 'version 1.2.3 works', 'see you at 10.30']) {
      expect(filterChatText(ok, guest).links).toBe(false);
    }
  });
  it('reports what it did', () => {
    const r = filterChatText('fuck https://x.co', guest);
    expect(r).toMatchObject({ changed: true, profanity: true, links: true });
  });
});
