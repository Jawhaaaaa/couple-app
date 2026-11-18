import { configure, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { api } from '@/api/client';
import type { Capsule } from '@/api/queries/capsules';
import type { Letter, LetterListItem } from '@/api/queries/letters';
import CapsuleScreen from '@/app/(tabs)/together/capsules/[id]';
import NewCapsuleScreen from '@/app/(tabs)/together/capsules/new';
import LetterScreen from '@/app/(tabs)/together/letters/[id]';
import ComposeLetterScreen from '@/app/(tabs)/together/letters/compose';
import LettersScreen from '@/app/(tabs)/together/letters/index';
import { pickMedia, queueAsset } from '@/memories/pickMedia';
import { useLetterDraftStore } from '@/stores/letterDraftStore';
import { defaultPrefs, usePrefsStore } from '@/stores/prefsStore';
import { useSessionStore } from '@/stores/sessionStore';

import { media, ME, ok, PARTNER, renderWithClient } from '../../../test/memoryFixtures';

let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) },
  useLocalSearchParams: () => mockParams,
}));
jest.mock('@/auth/tokenStore', () => ({
  usesCookieRefresh: false,
  getRefreshToken: jest.fn(async () => null),
  setRefreshToken: jest.fn(async () => {}),
  clearRefreshToken: jest.fn(async () => {}),
}));
jest.mock('@/auth/device', () => ({ deviceTimezone: () => 'Asia/Ulaanbaatar', deviceInfo: () => ({ name: 'test', platform: 'IOS' }) }));
jest.mock('@/memories/pickMedia', () => ({
  pickMedia: jest.fn(),
  assetKind: () => 'image',
  queueAsset: jest.fn(async (_a: unknown, i: number) => ({ key: `l${i}`, localId: `l${i}`, mediaId: null, previewUri: null, kind: 'image', name: `p${i}`, altText: '' })),
}));
jest.mock('@/upload/uploadRuntime', () => ({ uploadQueue: { wait: jest.fn(async (localId: string) => ({ id: `m-${localId}` })) } }));

configure({ asyncUtilTimeout: 5000 });

const listItem = (id: string, o: Partial<LetterListItem> = {}): LetterListItem => ({ id, author: PARTNER, recipient: ME, template: 'PAPER_1', status: 'DELIVERED', ...o });

function letter(o: Partial<Letter> = {}): Letter {
  return {
    id: 'L1',
    author: PARTNER,
    recipient: ME,
    template: 'PAPER_2',
    body: 'Чамдаа хайртай шүү',
    media: [],
    status: 'DELIVERED',
    deliveredAt: '2026-11-13T12:00:00Z',
    createdAt: '2026-11-10T12:00:00Z',
    version: 1,
    ...o,
  };
}

function capsule(o: Partial<Capsule> = {}): Capsule {
  return { id: 'C1', title: '2027 он', openOn: '2027-11-07', status: 'WRITING', parts: [], ...o };
}

let boxes: Record<string, unknown[]>;
let letterData: Letter;
let capsuleData: Capsule;
const spies: jest.SpyInstance[] = [];

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
  usePrefsStore.setState({ ...defaultPrefs });
  useSessionStore.setState({ accessToken: 'at', userId: ME.id, signedOut: false });
  useLetterDraftStore.setState({ drafts: {} });
  boxes = { inbox: [], sent: [], upcoming: [] };
  letterData = letter();
  capsuleData = capsule();
  spies.push(
    jest.spyOn(api, 'GET').mockImplementation((async (path: string, init?: { params?: { query?: { box?: string } } }) => {
      if (path === '/me') return ok({ id: ME.id, displayName: ME.displayName, callName: null, timezone: 'Asia/Ulaanbaatar', avatar: null });
      if (path === '/couple') return ok({ partner: { id: PARTNER.id, displayName: PARTNER.displayName, callName: null, avatar: null }, myView: { partnerNickname: null, partnerAvatar: null } });
      if (path === '/letters') return ok(boxes[init?.params?.query?.box ?? 'inbox']);
      if (path === '/letters/{letterId}') return ok(letterData);
      if (path === '/capsules') return ok([{ id: 'C1', title: '2027 он', openOn: '2027-11-07', status: 'SEALED' }]);
      if (path === '/capsules/{capsuleId}') return ok(capsuleData);
      return ok([]);
    }) as never),
  );
});
afterEach(() => spies.splice(0).forEach((s) => s.mockRestore()));

describe('S-65 захидлын хайрцаг', () => {
  it('AC-182 ирэх захидал — агуулгагүй «💌 Чамд … захидал ирнэ» тэмдэг', async () => {
    mockParams = { box: 'upcoming' };
    boxes.upcoming = [{ id: 'T1', deliverAt: '2026-12-24T12:00:00Z', occasionLabel: null }, { id: 'T2', occasionLabel: '1000 дахь өдөр' }];
    await renderWithClient(<LettersScreen />);
    expect(await screen.findByTestId('letter-teaser-T1')).toHaveTextContent(/💌 Чамд .*2026.* захидал ирнэ/);
    expect(screen.getByTestId('letter-teaser-T2')).toHaveTextContent('💌 Чамд 1000 дахь өдөр захидал ирнэ');
  });

  it('AC-113 «Надад ирсэн» огноогоор (шинэ нь эхэнд), нээхэд S-67', async () => {
    boxes.inbox = [
      listItem('old', { deliveredAt: '2026-11-01T00:00:00Z', status: 'READ' }),
      listItem('new', { deliveredAt: '2026-11-12T00:00:00Z' }),
    ];
    await renderWithClient(<LettersScreen />);
    await screen.findByTestId('letter-new');
    const ids = screen.getAllByTestId(/^letter-(new|old)$/).map((n) => n.props.testID);
    expect(ids).toEqual(['letter-new', 'letter-old']);
    await fireEvent.press(screen.getByTestId('letter-new'));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/together/letters/[id]', params: { id: 'new' } });
  });

  it('AC-113 / AC-182 «Миний илгээсэн» — хүлээгдэж буй, хүргэгдсэн, уншсан төлөв; товлосныг засварт нээнэ', async () => {
    mockParams = { box: 'sent' };
    boxes.sent = [
      listItem('s1', { author: ME, recipient: PARTNER, status: 'SCHEDULED', deliverAt: '2026-12-24T12:00:00Z' }),
      listItem('s2', { author: ME, recipient: PARTNER, status: 'READ', deliveredAt: '2026-11-02T00:00:00Z' }),
      listItem('s3', { author: ME, recipient: PARTNER, status: 'DELIVERED', deliveredAt: '2026-11-05T00:00:00Z' }),
    ];
    await renderWithClient(<LettersScreen />);
    expect(await screen.findByTestId('letter-status-s1')).toHaveTextContent('Хүлээгдэж буй');
    expect(screen.getByTestId('letter-status-s2')).toHaveTextContent('Уншсан');
    expect(screen.getByTestId('letter-status-s3')).toHaveTextContent('Хүргэгдсэн');
    await fireEvent.press(screen.getByTestId('letter-s1'));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/together/letters/compose', params: { id: 's1' } });
  });

  it('хоосон бол хамтрагчийн нэртэй хоосон төлөв → S-66', async () => {
    await renderWithClient(<LettersScreen />);
    expect(await screen.findByText(/Ану чинь чиний захидлыг/)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('state-empty-action'));
    expect(router.push).toHaveBeenCalledWith('/together/letters/compose');
  });

  it('капсулын таб — жагсаалт, үүсгэх', async () => {
    mockParams = { box: 'capsules' };
    await renderWithClient(<LettersScreen />);
    expect(await screen.findByTestId('capsule-C1')).toHaveTextContent(/2027 он/);
    await fireEvent.press(screen.getByTestId('capsule-create'));
    expect(router.push).toHaveBeenCalledWith('/together/capsules/new');
  });
});

describe('S-66 захидал бичих', () => {
  it('AC-111 загвар сонгож, 6 зураг сонгоход 5 нь орж 6 дахь татгалзана; шууд илгээхэд POST', async () => {
    (pickMedia as jest.Mock).mockResolvedValue({ status: 'picked', assets: Array.from({ length: 6 }, (_, i) => ({ uri: `file://${i}`, type: 'image' })) });
    const post = jest.spyOn(api, 'POST').mockImplementation((async () => ok(letter({ id: 'N1', author: ME, recipient: PARTNER, status: 'DELIVERED' }), 201)) as never);
    spies.push(post);
    await renderWithClient(<ComposeLetterScreen />);
    await fireEvent.press(await screen.findByTestId('letter-template-PAPER_3'));
    await fireEvent.changeText(screen.getByTestId('letter-body'), 'Хайртай шүү');
    await fireEvent.press(screen.getByTestId('letter-photos-add'));
    expect(await screen.findByTestId('letter-photos-notice')).toHaveTextContent('Нэг захидалд дээд тал нь 5 зураг — илүүг нь нэмсэнгүй.');
    expect(queueAsset).toHaveBeenCalledTimes(5);
    expect(screen.getAllByTestId('letter-photos-item')).toHaveLength(5);
    expect(screen.queryByTestId('letter-photos-add')).toBeNull();
    await fireEvent.press(screen.getByTestId('letter-send'));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/letters', {
        body: { template: 'PAPER_3', body: 'Хайртай шүү', mediaIds: ['m-l0', 'm-l1', 'm-l2', 'm-l3', 'm-l4'], deliverAt: null, draft: false },
      }),
    );
    expect(router.replace).toHaveBeenCalledWith({ pathname: '/together/letters', params: { box: 'sent' } });
    expect(useLetterDraftStore.getState().drafts.new).toBeUndefined();
  });

  it('товлосон цаг хэрэглэгчийн бүсээр UTC болж, үйл явдлын нэртэй POST', async () => {
    const post = jest.spyOn(api, 'POST').mockImplementation((async () => ok(letter({ id: 'N2' }), 201)) as never);
    spies.push(post);
    await renderWithClient(<ComposeLetterScreen />);
    await fireEvent.changeText(await screen.findByTestId('letter-body'), 'Зул сарын мэнд');
    await fireEvent.press(screen.getByTestId('letter-mode-scheduled'));
    await fireEvent.changeText(screen.getByTestId('letter-date'), '2030-12-24');
    await fireEvent.changeText(screen.getByTestId('letter-time'), '20:00');
    await fireEvent.changeText(screen.getByTestId('letter-occasion'), 'Зул сар');
    await fireEvent.press(screen.getByTestId('letter-send'));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/letters', {
        body: { template: 'PAPER_1', body: 'Зул сарын мэнд', mediaIds: [], deliverAt: '2030-12-24T12:00:00Z', draft: false, occasionLabel: 'Зул сар' },
      }),
    );
  });

  it('AC-191 бичсэн нь төхөөрөмж дээр ноорог болж хадгалагдана; «Ноорог хадгалах» draft:true', async () => {
    const post = jest.spyOn(api, 'POST').mockImplementation((async () => ok(letter({ id: 'D1', author: ME, status: 'DRAFT' }), 201)) as never);
    spies.push(post);
    await renderWithClient(<ComposeLetterScreen />);
    await fireEvent.changeText(await screen.findByTestId('letter-body'), 'Ноорог');
    expect(useLetterDraftStore.getState().drafts.new?.form.body).toBe('Ноорог');
    await fireEvent.press(screen.getByTestId('letter-save-draft'));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/letters', { body: expect.objectContaining({ body: 'Ноорог', draft: true }) }));
    expect(router.replace).toHaveBeenCalledWith({ pathname: '/together/letters/compose', params: { id: 'D1' } });
  });

  it('AC-112 хүргэгдээгүй захидлыг засах (PATCH + version), цуцлах (DELETE)', async () => {
    mockParams = { id: 'L9' };
    letterData = letter({ id: 'L9', author: ME, recipient: PARTNER, status: 'SCHEDULED', deliverAt: '2030-12-24T12:00:00Z', deliveredAt: null, version: 4 });
    const patch = jest.spyOn(api, 'PATCH').mockImplementation((async () => ok(letterData)) as never);
    const del = jest.spyOn(api, 'DELETE').mockImplementation((async () => ok(null, 204)) as never);
    spies.push(patch, del);
    await renderWithClient(<ComposeLetterScreen />);
    expect(await screen.findByTestId('letter-date')).toHaveProp('value', '2030-12-24');
    expect(screen.getByTestId('letter-time')).toHaveProp('value', '20:00');
    await fireEvent.changeText(screen.getByTestId('letter-body'), 'Засварласан');
    await fireEvent.press(screen.getByTestId('letter-send'));
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith('/letters/{letterId}', {
        params: { path: { letterId: 'L9' } },
        body: { template: 'PAPER_2', body: 'Засварласан', mediaIds: [], deliverAt: '2030-12-24T12:00:00Z', draft: false, occasionLabel: null, version: 4 },
      }),
    );
    await fireEvent.press(screen.getByTestId('letter-cancel'));
    await fireEvent.press(screen.getByTestId('letter-cancel-sheet-confirm'));
    await waitFor(() => expect(del).toHaveBeenCalledWith('/letters/{letterId}', { params: { path: { letterId: 'L9' } } }));
  });

  it('AC-112 хүргэгдсэн захидал засагдахгүй', async () => {
    mockParams = { id: 'L1' };
    letterData = letter({ author: ME, recipient: PARTNER });
    await renderWithClient(<ComposeLetterScreen />);
    expect(await screen.findByTestId('letter-not-editable')).toBeTruthy();
    expect(screen.queryByTestId('letter-send')).toBeNull();
  });
});

describe('S-67 захидал нээх', () => {
  it('AC-111 хүлээн авагчид ANIM-06 дугтуй; «Нээх» дарахад агуулга ба уншсан болгох POST', async () => {
    mockParams = { id: 'L1' };
    const post = jest.spyOn(api, 'POST').mockImplementation((async () => ok({ ...letterData, status: 'READ' })) as never);
    spies.push(post);
    await renderWithClient(<LetterScreen />);
    expect(await screen.findByTestId('letter-envelope')).toHaveTextContent(/Ану-аас захидал/);
    expect(screen.getByTestId('anim-ANIM-06')).toBeTruthy();
    expect(screen.queryByTestId('letter-body-text')).toBeNull();
    await fireEvent.press(screen.getByTestId('letter-open'));
    expect(await screen.findByTestId('letter-body-text')).toHaveTextContent('Чамдаа хайртай шүү');
    expect(screen.getByTestId('letter-paper-PAPER_2')).toBeTruthy();
    await waitFor(() => expect(post).toHaveBeenCalledWith('/letters/{letterId}/read', { params: { path: { letterId: 'L1' } } }));
  });

  it('уншсан захидал шууд нээлттэй; зохиогчид төлөв харагдана', async () => {
    mockParams = { id: 'L1' };
    letterData = letter({ author: ME, recipient: PARTNER, status: 'READ', media: [media('p1')] });
    await renderWithClient(<LetterScreen />);
    expect(await screen.findByTestId('letter-body-text')).toBeTruthy();
    expect(screen.getByTestId('letter-status')).toHaveTextContent('Уншсан');
    expect(screen.queryByTestId('letter-envelope')).toBeNull();
  });
});

describe('S-68 цагийн капсул', () => {
  it('GAP-15 өөрийн хэсгийг бичиж битүүмжлэхэд PUT my-part → POST seal', async () => {
    mockParams = { id: 'C1' };
    const put = jest.spyOn(api, 'PUT').mockImplementation((async () => {
      capsuleData = capsule({ parts: [{ author: ME, sealed: false }] });
      return ok(capsuleData);
    }) as never);
    const post = jest.spyOn(api, 'POST').mockImplementation((async () => {
      capsuleData = capsule({ parts: [{ author: ME, sealed: true }] });
      return ok(capsuleData);
    }) as never);
    spies.push(put, post);
    await renderWithClient(<CapsuleScreen />);
    expect(await screen.findByTestId('capsule-part-partner')).toHaveTextContent(/хараахан бичээгүй/);
    await fireEvent.changeText(screen.getByTestId('capsule-body'), 'Ирээдүйн бидэнд');
    await fireEvent.press(screen.getByTestId('capsule-seal'));
    await fireEvent.press(screen.getByTestId('capsule-seal-sheet-confirm'));
    await waitFor(() => expect(put).toHaveBeenCalledWith('/capsules/{capsuleId}/my-part', { params: { path: { capsuleId: 'C1' } }, body: { body: 'Ирээдүйн бидэнд', mediaIds: [] } }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/capsules/{capsuleId}/seal', { params: { path: { capsuleId: 'C1' } } }));
    expect(await screen.findByTestId('capsule-locked')).toHaveTextContent(/Ану хэсгээ битүүмжлэхийг хүлээж байна/);
    expect(screen.queryByTestId('capsule-editor')).toBeNull();
  });

  it('AC-45 хоёулаа битүүмжилсэн — огноо хүртэл түгжээтэй, агуулга 0', async () => {
    mockParams = { id: 'C1' };
    capsuleData = capsule({ status: 'SEALED', parts: [{ author: ME, sealed: true }, { author: PARTNER, sealed: true }] });
    await renderWithClient(<CapsuleScreen />);
    expect(await screen.findByTestId('capsule-locked')).toHaveTextContent(/Хоёулаа битүүмжилсэн/);
    expect(screen.queryByTestId('capsule-editor')).toBeNull();
    expect(screen.queryByTestId(`capsule-opened-${ME.id}`)).toBeNull();
  });

  it('AC-45 огноо болоход ANIM-21-тэй нээгдэж хоёр хэсэг харагдана', async () => {
    mockParams = { id: 'C1' };
    capsuleData = capsule({
      status: 'OPENED',
      parts: [
        { author: ME, sealed: true, body: 'Миний хэсэг', media: [] },
        { author: PARTNER, sealed: true, body: 'Түүний хэсэг', media: [] },
      ],
    });
    await renderWithClient(<CapsuleScreen />);
    expect(await screen.findByTestId('capsule-opened-moment')).toBeTruthy();
    expect(screen.getByTestId('anim-ANIM-21')).toBeTruthy();
    expect(screen.getByTestId(`capsule-opened-${PARTNER.id}`)).toHaveTextContent(/Түүний хэсэг/);
  });

  it('капсул үүсгэх: өнгөрсөн огноонд алдаа, зөв бол POST → дэлгэрэнгүй', async () => {
    const post = jest.spyOn(api, 'POST').mockImplementation((async () => ok(capsule({ id: 'C9' }), 201)) as never);
    spies.push(post);
    await renderWithClient(<NewCapsuleScreen />);
    await fireEvent.changeText(await screen.findByTestId('capsule-form-title'), '2030 он');
    await fireEvent.changeText(screen.getByTestId('capsule-form-open-on'), '2020-01-01');
    await fireEvent.press(screen.getByTestId('capsule-form-save'));
    expect(await screen.findByText('Маргаашаас хойших өдөр сонгоно уу')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('capsule-form-open-on'), '2030-11-07');
    await fireEvent.press(screen.getByTestId('capsule-form-save'));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/capsules', { body: { title: '2030 он', openOn: '2030-11-07' } }));
    expect(router.replace).toHaveBeenCalledWith({ pathname: '/together/capsules/[id]', params: { id: 'C9' } });
  });
});
