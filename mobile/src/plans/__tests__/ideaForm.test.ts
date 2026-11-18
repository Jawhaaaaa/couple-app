import type { Message } from '@/api/queries/chat';
import { ideaPrefillFrom } from '@/chat/attachments';
import { buildIdeaInput, buildIdeaUpdate, emptyIdeaForm, parseIdeaDraft, planDraftFromIdea, validateIdeaForm } from '@/plans/ideaForm';

jest.mock('@/upload/uploadRuntime', () => ({ uploadQueue: {} }));

describe('S-53 санааны маягт', () => {
  it('AC-179 гарчиггүй бол талбарын алдаа; буруу холбоос, хотгүй газар', () => {
    expect(validateIdeaForm({ ...emptyIdeaForm(), url: 'aura', venue: 'Кафе' })).toEqual(['TITLE', 'PLACE', 'URL']);
  });

  it('AC-179 бүх талбартай санаа → `POST /ideas`', () => {
    const form = {
      title: ' Шөнийн од харах ',
      description: 'Дуран авна',
      category: 'OUTDOOR' as const,
      budget: '50 000',
      venue: 'Тэрэлж',
      city: { name: 'Улаанбаатар', countryCode: 'MN', lat: 47.9, lon: 106.9, timezone: 'Asia/Ulaanbaatar' },
      url: 'https://aura.example.mn/stars',
      setting: 'OUTDOOR' as const,
    };
    expect(validateIdeaForm(form)).toEqual([]);
    expect(buildIdeaInput(form, 'cid')).toEqual({
      title: 'Шөнийн од харах',
      description: 'Дуран авна',
      category: 'OUTDOOR',
      budgetMnt: 50000,
      place: { name: 'Тэрэлж', lat: 47.9, lon: 106.9, city: 'Улаанбаатар', countryCode: 'MN' },
      url: 'https://aura.example.mn/stars',
      setting: 'OUTDOOR',
      clientId: 'cid',
    });
    expect(buildIdeaUpdate({ ...emptyIdeaForm(), title: 'Кино' }, 3)).toEqual({
      title: 'Кино',
      description: null,
      category: 'OTHER',
      budgetMnt: null,
      place: null,
      url: null,
      setting: null,
      version: 3,
    });
  });

  it('AC-91 чатын мессежээс S-53 ноорог: гарчиг = эхний мөр, тайлбар = бүтэн текст, байршил', () => {
    const m = { id: 'm1', kind: 'TEXT', text: 'Энэ амралтын өдөр уул руу\nхоол авч явъя', location: null, createdAt: '2026-11-07T04:00:00Z' } as unknown as Message;
    const prefill = ideaPrefillFrom(m);
    expect(prefill).toEqual({ title: 'Энэ амралтын өдөр уул руу', description: 'Энэ амралтын өдөр уул руу\nхоол авч явъя' });
    const form = { ...emptyIdeaForm(), ...parseIdeaDraft(JSON.stringify(prefill)) };
    expect(form.title).toBe('Энэ амралтын өдөр уул руу');
    const located = ideaPrefillFrom({ ...m, kind: 'LOCATION', text: null, location: { name: 'Зайсан', lat: 47.88, lon: 106.91 } } as unknown as Message);
    expect(parseIdeaDraft(JSON.stringify(located))).toMatchObject({ venue: 'Зайсан', city: { lat: 47.88, lon: 106.91 } });
    expect(parseIdeaDraft('{')).toBeNull();
  });

  it('«Болзоо болгох» → S-54 ноорог (ideaId, ангилал, төсөв)', () => {
    const draft = JSON.parse(planDraftFromIdea({ id: 'i1', title: 'Кино', description: null, category: 'CULTURE', budgetMnt: 40000, place: null }));
    expect(draft).toEqual({ title: 'Кино', category: 'CULTURE', ideaId: 'i1', budgetMnt: 40000 });
  });
});
