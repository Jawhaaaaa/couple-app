import type { Message } from '@/api/queries/chat';
import { checkChatFile, FILE_MAX_BYTES, mapUrl, memoryPrefillFrom } from '@/chat/attachments';
import { firstLink, splitHighlights } from '@/chat/highlights';
import { applyPrefill, parseDraftParam } from '@/memories/editorModel';
import { emptyDraft } from '@/stores/draftStore';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

const base = {
  id: 'm1',
  clientMessageId: 'c1',
  sender: { id: 'u', displayName: 'Бат' },
  status: 'READ',
  deleted: false,
  reactions: [],
  createdAt: '2026-11-07T17:30:00Z',
} as const;

describe('AC-87 файлын хязгаар', () => {
  it('PDF ≤ 50 MB зөвшөөрнө; .exe/.apk/.js ба 50 MB-аас том татгалзана', () => {
    expect(checkChatFile('аялал.pdf', 3_000_000)).toEqual({ ok: true });
    expect(checkChatFile('setup.EXE', 10)).toEqual({ ok: false, reason: 'FORBIDDEN' });
    expect(checkChatFile('app.apk', 10)).toEqual({ ok: false, reason: 'FORBIDDEN' });
    expect(checkChatFile('x.js', 10)).toEqual({ ok: false, reason: 'FORBIDDEN' });
    expect(checkChatFile('big.pdf', FILE_MAX_BYTES + 1)).toEqual({ ok: false, reason: 'TOO_LARGE' });
  });

  it('байршлыг OSM газрын зурагт нээнэ', () => {
    expect(mapUrl({ lat: 47.8, lon: 107.3 })).toBe('https://www.openstreetmap.org/?mlat=47.8&mlon=107.3#map=16/47.8/107.3');
  });
});

describe('AC-91 «Дурсамж болгох» ноорог', () => {
  it('текст → гарчиг (эхний мөр) ба тайлбар; огноо хүний бүсээр; байршил', () => {
    const m = { ...base, kind: 'LOCATION', text: 'Тэрэлжид ирлээ\nМаш гоё', location: { name: 'Тэрэлж', lat: 47.98, lon: 107.45 } } as unknown as Message;
    const prefill = memoryPrefillFrom(m, 'Asia/Ulaanbaatar');
    expect(prefill).toMatchObject({ title: 'Тэрэлжид ирлээ', description: 'Тэрэлжид ирлээ\nМаш гоё', occurredOn: '2026-11-08' });
    const draft = applyPrefill(emptyDraft('2026-11-13'), parseDraftParam(JSON.stringify(prefill)));
    expect(draft).toMatchObject({ title: 'Тэрэлжид ирлээ', occurredOn: '2026-11-08', placeName: 'Тэрэлж', lat: '47.98', lon: '107.45' });
  });

  it('зураг → ноорогт серверийн медиа (дахин upload хийхгүй)', () => {
    const m = {
      ...base,
      kind: 'IMAGE',
      text: null,
      media: { id: 'media-1', kind: 'IMAGE', status: 'READY', mime: 'image/jpeg', sizeBytes: 1, urls: { original: 'https://o', md: 'https://md' }, urlsExpireAt: 'x' },
    } as unknown as Message;
    const draft = applyPrefill(emptyDraft('2026-11-13'), parseDraftParam(JSON.stringify(memoryPrefillFrom(m, 'UTC'))));
    expect(draft.media).toEqual([expect.objectContaining({ mediaId: 'media-1', localId: null, previewUri: 'https://md', kind: 'image' })]);
    expect(draft.occurredOn).toBe('2026-11-07');
  });
});

describe('AC-89 хайлтын тодруулга', () => {
  it('[start, end] мужаар хэсэглэнэ, давхцал ба хязгаараас гарсныг тэсвэрлэнэ', () => {
    expect(splitHighlights('Тэрэлж явах уу, Тэрэлж', [[0, 6], [16, 22]])).toEqual([
      { text: 'Тэрэлж', hit: true },
      { text: ' явах уу, ', hit: false },
      { text: 'Тэрэлж', hit: true },
    ]);
    expect(splitHighlights('abc', [[1, 99], [0, 2]])).toEqual([
      { text: 'ab', hit: true },
      { text: 'c', hit: true },
    ]);
    expect(splitHighlights('abc', [])).toEqual([{ text: 'abc', hit: false }]);
  });

  it('эхний холбоос', () => {
    expect(firstLink('Энийг үз https://aura.mn/x?y=1 гоё')).toBe('https://aura.mn/x?y=1');
    expect(firstLink('холбоосгүй')).toBeNull();
  });
});
