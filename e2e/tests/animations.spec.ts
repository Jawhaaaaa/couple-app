import { randomUUID } from 'node:crypto';

import { expect, type Page } from '@playwright/test';

import { type Partner, test } from '../fixtures/twoPartners';
import { clearAnims, expectAnim, finishCelebration, localDate, recordAnims } from '../support/anims';
import { sendTextApi } from '../support/chat';
import { resetServerClock, setServerClock } from '../support/clock';
import { confirmStartDate, linkedCouple } from '../support/couple';
import { createMemoryApi, makeJpeg } from '../support/memories';
import { runJob } from '../support/seed';
import { apiJson, createVerifiedUser, signInUi, type TestUser } from '../support/users';

/**
 * ANIM-01…23 (шаардлага §3.4, T-89): ANIM бүрийг хүснэгтийн «Хаана» баганын үйлдлээр өдөөж,
 * тухайн дэлгэцэд `anim-ANIM-XX` тэмдэглэгээ тоглогдсоныг (`data-anim-state="playing"`) шалгана
 * (AC-214, TQ-05). Баярын мөч (ANIM-05, 14, 18, 20, 21) товшимогц хаагдана, эсвэл өөрөө
 * ≤ 2.5 с-д (AC-MO-02). `reducedMotion: 'reduce'`-д ижил үйлдлүүд `reduced` төлөв өгч, утгын
 * бичвэр («Очлоо» г.м.) харагдсаар байна (AC-MO-01).
 *
 * Хувилбар бүр (`Scenario`) хоёр describe-д нэг кодоор ажиллана — `reduced` нь зөвхөн хүлээгдэх
 * төлөвийг солино. Хос бүр API-аар шинээр үүснэ (баяр хэрэглэгч тутамд нэг удаа — GAP-23).
 * Хөтчөөс хамаарах шалгалтыг `smoke.spec` хийдэг тул энд зөвхөн Chromium (хуурамч микрофон —
 * ANIM-23).
 */
interface Ctx {
  a: Partner;
  b: Partner;
  reduced: boolean;
}

interface Scenario {
  /** Гарчигт орох ANIM ба AC ID. */
  anims: string[];
  title: string;
  run: (ctx: Ctx) => Promise<void>;
}

interface Goal {
  id: string;
  steps: { id: string; position: number }[];
}

interface Celebration {
  eventKey: string;
  kind: string;
}

async function openHome(page: Page, user: TestUser) {
  await signInUi(page, user);
  await expect(page.getByTestId('screen-S-20')).toBeVisible();
  await expect(page.getByTestId('heart-button')).toBeVisible();
  // STOMP холболт тогтох хүртэл
  await page.waitForLoadState('networkidle');
}

async function signedIn(page: Page, user: TestUser, path: string, screen: string) {
  await signInUi(page, user);
  await page.goto(path);
  await expect(page.getByTestId(screen)).toBeVisible();
  await page.waitForLoadState('networkidle');
}

/** S-20, S-26, S-22: ANIM-04, 11, 01, 02, 03, 19. */
const homeScenario: Scenario = {
  anims: ['ANIM-01', 'ANIM-02', 'ANIM-03', 'ANIM-04', 'ANIM-11', 'ANIM-19'],
  title: 'нүүр: тоолуур, хоосон хэсэг, зүрх, «Чамайг бодож байна», өдрийн асуулт',
  run: async ({ a: A, b: B, reduced }) => {
    const [a, b] = await linkedCouple(A.name, B.name, 'anim-home');
    // SD-01: эхэлсэн өдөр = 1 → өнөөдөр 11 дэх өдөр (ой биш — S-25 гарахгүй)
    await confirmStartDate(a, b, localDate(-10));

    // ANIM-04 тоолуур ба ANIM-11 хоосон хэсэг — S-20 нээгдэхэд
    await openHome(A.page, a);
    await expectAnim(A.page, 'ANIM-04', { reduced, within: 'home-counter' });
    await expect(A.page.getByTestId('counter-days')).toHaveText('11');
    await expectAnim(A.page, 'ANIM-11', { reduced, within: 'home-section-memories-empty' });
    await expect(A.page.getByTestId('home-section-memories-empty')).toBeVisible();

    // ANIM-01 «Зүрх илгээх» → B-д ANIM-02 (WebSocket)
    await openHome(B.page, b);
    await clearAnims(A.page);
    await A.page.getByTestId('heart-button').click();
    await expectAnim(A.page, 'ANIM-01', { reduced, within: 'home-signals' });
    await expect(A.page.getByTestId('heart-sent')).toHaveText('💗 Зүрх чинь очлоо');
    await expectAnim(B.page, 'ANIM-02', { reduced, within: 'signal-overlay-HEART' });
    await expect(B.page.getByTestId('signal-overlay-text')).toHaveText(`${A.name} чамд зүрх илгээлээ`);
    await expect(B.page.getByTestId('signal-overlay-HEART')).toHaveCount(0, { timeout: 5_000 });

    // ANIM-03 S-26 «Чамайг бодож байна» → A-д S-26 дээр, B-д overlay-д
    const text = 'Чамайг бодож байна';
    await A.page.getByTestId('home-thinking-open').click();
    await expect(A.page.getByTestId('screen-S-26')).toBeVisible();
    await A.page.getByTestId('thinking-input').fill(text);
    await clearAnims(A.page);
    await A.page.getByTestId('thinking-send').click();
    await expectAnim(A.page, 'ANIM-03', { reduced, within: 'screen-S-26' });
    await expect(A.page.getByTestId('thinking-sent')).toHaveText('💭 Очлоо');
    await expectAnim(B.page, 'ANIM-03', { reduced, within: 'signal-overlay-THINKING' });
    await expect(B.page.getByTestId('signal-overlay-quote')).toContainText(text);

    // ANIM-19: A хариулсан, B хариулмагц хамтрагчийн хариулт тодорно (S-22)
    const answerA = `Анхны болзоо — ${Date.now().toString(36)}`;
    await apiJson(a, 'POST', '/questions/today/answer', { text: answerA });
    await B.page.goto('/home/question');
    await expect(B.page.getByTestId('screen-S-22')).toBeVisible();
    await B.page.getByTestId('question-input').fill(`Кино — ${Date.now().toString(36)}`);
    await B.page.getByTestId('question-submit').click();
    await expectAnim(B.page, 'ANIM-19', { reduced, within: 'screen-S-22' });
    await expect(B.page.getByTestId('question-partner-answer')).toHaveText(answerA);
  },
};

/** S-40, S-41, S-45 ба доод таб: ANIM-10, 08, 07, 01, 23. */
const chatScenario: Scenario = {
  anims: ['ANIM-10', 'ANIM-08', 'ANIM-07', 'ANIM-01', 'ANIM-23'],
  title: 'чат: таб солих, «Бичиж байна», реакц, зүрх, дуут бичлэг',
  run: async ({ a: A, b: B, reduced }) => {
    const [a, b] = await linkedCouple(A.name, B.name, 'anim-chat');
    const m = await sendTextApi(b, 'Өнөө орой уулзах уу?');
    await A.context.grantPermissions(['microphone']);

    // ANIM-10: нүүрээс «Чат» таб руу — идэвхтэй болсон таб дотор
    await signInUi(A.page, a);
    await expect(A.page.getByTestId('screen-S-20')).toBeVisible();
    await clearAnims(A.page);
    await A.page.getByTestId('tab-chat').click();
    await expectAnim(A.page, 'ANIM-10', { reduced, within: 'tab-chat' });
    await expect(A.page.getByTestId('screen-S-40')).toBeVisible();
    await A.page.waitForLoadState('networkidle');
    await signedIn(B.page, b, '/chat', 'screen-S-40');

    // ANIM-08: B бичиж байхад A-д
    await B.page.getByTestId('composer-input').pressSequentially('сайн', { delay: 50 });
    await expectAnim(A.page, 'ANIM-08', { reduced, within: 'chat-typing' });
    await expect(A.page.getByTestId('chat-typing')).toContainText('бичиж байна');

    // ANIM-07: мессеж дээр удаан дарах (S-41) → реакц
    await A.page.getByTestId(`message-${m.clientMessageId}`).click({ delay: 600 });
    await expectAnim(A.page, 'ANIM-07', { reduced, within: 'message-actions' });
    await A.page.getByTestId('message-react-LOVE').click();
    // Реакцын мөр нь бөмбөлгийн (testID) хажууд — мөрийн эцэг элемент дотор
    await expect(A.page.getByTestId(`message-${m.clientMessageId}`).locator('xpath=..').getByTestId('message-reactions')).toBeVisible();

    // ANIM-01: чатын зүрх → B-д ANIM-02
    await clearAnims(A.page);
    await A.page.getByTestId('composer-heart').click();
    await expectAnim(A.page, 'ANIM-01', { reduced, within: 'chat-composer' });
    await expectAnim(B.page, 'ANIM-02', { reduced, within: 'signal-overlay-HEART' });
    await expect(B.page.getByTestId('signal-overlay-text')).toHaveText(`${A.name} чамд зүрх илгээлээ`);

    // ANIM-23: дуу бичих overlay (S-45) — хуурамч микрофон
    await A.page.getByTestId('composer-voice').click();
    await expect(A.page.getByTestId('screen-S-45')).toBeVisible();
    await expectAnim(A.page, 'ANIM-23', { reduced, within: 'screen-S-45' });
    await expect(A.page.getByTestId('voice-timer')).toContainText('/ 5:00');
    await A.page.getByTestId('voice-cancel').click();
    await expect(A.page.getByTestId('screen-S-45')).toHaveCount(0);
  },
};

/** S-56, S-54, S-57: ANIM-17, 16, 12, 18. */
const plansScenario: Scenario = {
  anims: ['ANIM-17', 'ANIM-16', 'ANIM-12', 'ANIM-18', 'AC-MO-02'],
  title: 'төлөвлөгөө: санамсаргүй сонго, ачаалал, болзоо зөвшөөрөх, нууц санал нэгдэл',
  run: async ({ a: A, b: B, reduced }) => {
    const [a, b] = await linkedCouple(A.name, B.name, 'anim-plans');
    const ideaTitle = `Гэртээ кино — ${Date.now().toString(36)}`;
    const idea = await apiJson<{ id: string }>(a, 'POST', '/ideas', { clientId: randomUUID(), title: ideaTitle, category: 'HOME' });
    const plan = await apiJson<{ id: string }>(a, 'POST', '/plans', {
      clientId: randomUUID(),
      title: 'Тэрэлж рүү',
      startsAt: new Date(Date.now() + 5 * 86_400_000).toISOString(),
      timezone: 'Asia/Ulaanbaatar',
      reminderOffsets: [60],
      recurrence: 'NONE',
      checklist: [],
    });
    // Нууц deck: A «Тийм» гэсэн; хосын санаа deck-ийн эхэнд (SecretDeckService.next)
    await apiJson(a, 'POST', '/deck/swipes', { ideaRef: `idea:${idea.id}`, liked: true });

    // ANIM-17: S-56 «Санамсаргүй сонго» (сангүй — зөвхөн хосын ганц санаа)
    await signedIn(A.page, a, '/plans/random', 'screen-S-56');
    await A.page.getByTestId('random-pick').click();
    await expectAnim(A.page, 'ANIM-17', { reduced, within: 'screen-S-56' });
    await expect(A.page.getByTestId('random-result')).toContainText(ideaTitle);

    // A нь S-57 дээр хүлээнэ — B таарахад `deck.matched`-ээр ANIM-18
    await A.page.goto('/plans/deck');
    await expect(A.page.getByTestId('screen-S-57')).toBeVisible();
    await A.page.waitForLoadState('networkidle');

    // ANIM-16: S-54-ийн ачаалал (болзооны хариуг 3 с саатуулна) — 1 с-ээс хойш маскот + бичвэр
    await signInUi(B.page, b);
    let delayed = false;
    const planUrl = (url: URL) => url.pathname.endsWith(`/api/v1/plans/${plan.id}`);
    await B.context.route(planUrl, async (route) => {
      if (!delayed && route.request().method() === 'GET') {
        delayed = true;
        await new Promise((resolve) => setTimeout(resolve, 3_000));
      }
      await route.continue();
    });
    await B.page.goto(`/plans/${plan.id}`);
    await expectAnim(B.page, 'ANIM-16', { reduced, within: 'screen-S-54' });
    await expect(B.page.getByTestId('screen-S-54').getByTestId('state-loading-slow')).toBeVisible();
    await expect(B.page.getByTestId('plan-accept')).toBeVisible({ timeout: 15_000 });
    await B.context.unroute(planUrl);

    // ANIM-12: B «Зөвшөөрөх» → баталгаажсан мөч (≤ 1.6 с)
    await B.page.getByTestId('plan-accept').click();
    await expectAnim(B.page, 'ANIM-12', { reduced, within: 'plan-confirmed-moment' });
    await expect(B.page.getByTestId('plan-confirmed')).toBeVisible();

    // ANIM-18: B ч «Тийм» → B-д шууд, A-д realtime-аар; B товшиж хаана, A-д өөрөө ≤ 2.5 с
    await B.page.goto('/plans/deck');
    await expect(B.page.getByTestId('deck-card')).toContainText(ideaTitle);
    await B.page.getByTestId('deck-yes').click();
    await expectAnim(B.page, 'ANIM-18', { reduced, within: 'celebration-overlay' });
    await expect(B.page.getByTestId('deck-match-celebration')).toContainText(ideaTitle);
    await finishCelebration(B.page, 'ANIM-18', 'tap');
    await expect(B.page.getByTestId(`deck-match-idea:${idea.id}`)).toBeVisible();

    // A-гийн мөч B-гийнхтэй зэрэг эхэлсэн тул энэ агшинд аль хэдийн хаагдсан байж болно — бүртгэлээр
    await expectAnim(A.page, 'ANIM-18', { reduced, within: 'celebration-overlay', timeout: 15_000 });
    await finishCelebration(A.page, 'ANIM-18', 'auto');
    await expect(A.page.getByTestId(`deck-match-idea:${idea.id}`)).toBeVisible();
  },
};

/** S-67, S-69, S-64, S-68: ANIM-06, 15, 20, 21. */
const togetherScenario: Scenario = {
  anims: ['ANIM-06', 'ANIM-15', 'ANIM-20', 'ANIM-21', 'AC-MO-02'],
  title: 'хамтдаа: захидал нээх, сэтгэл санаа, зорилгын явц, цагийн капсул',
  run: async ({ a: A, b: B, reduced }) => {
    const [a, b] = await linkedCouple(A.name, B.name, 'anim-together');
    const letterBody = `Сайн уу, хайрт минь — ${Date.now().toString(36)}`;
    // deliverAt байхгүй — шууд хүргэгдэнэ (DELIVERED)
    const letter = await apiJson<{ id: string }>(a, 'POST', '/letters', { template: 'PAPER_1', body: letterBody, mediaIds: [], draft: false });
    const goal = await apiJson<Goal>(a, 'POST', '/goals', { title: 'Аялалын сан', steps: ['Төлөвлөх', 'Хуримтлуулах'] });
    const [step1, step2] = [...goal.steps].sort((x, y) => x.position - y.position);

    // Капсул (GAP-15): хоёулаа өөрийн хэсгийг бичиж битүүмжилнэ → нээх өдөр `letterDelivery` нээнэ
    const openOn = localDate(1);
    const capsule = await apiJson<{ id: string }>(a, 'POST', '/capsules', { title: 'Ирээдүйн бид', openOn });
    const partA = `Нэг жилийн дараах бид — ${Date.now().toString(36)}`;
    await apiJson(a, 'PUT', `/capsules/${capsule.id}/my-part`, { body: partA, mediaIds: [] });
    await apiJson(a, 'POST', `/capsules/${capsule.id}/seal`);
    await apiJson(b, 'PUT', `/capsules/${capsule.id}/my-part`, { body: 'Бас би', mediaIds: [] });
    await apiJson(b, 'POST', `/capsules/${capsule.id}/seal`);
    await setServerClock(`${openOn}T12:00:00+08:00`);
    try {
      await runJob('letterDelivery');
    } finally {
      await resetServerClock();
    }
    await expect.poll(async () => (await apiJson<{ status: string }>(b, 'GET', `/capsules/${capsule.id}`)).status).toBe('OPENED');

    // ANIM-06: B (хүлээн авагч) дугтуйг нээнэ (S-67)
    await signedIn(B.page, b, `/together/letters/${letter.id}`, 'screen-S-67');
    await expect(B.page.getByTestId('letter-envelope')).toBeVisible();
    await clearAnims(B.page);
    await B.page.getByTestId('letter-open').click();
    await expectAnim(B.page, 'ANIM-06', { reduced, within: 'screen-S-67' });
    await expect(B.page.getByTestId('letter-body-text')).toHaveText(letterBody);

    // ANIM-15: S-69 сэтгэл санааны түвшин сонгох
    await B.page.goto('/together/checkin');
    await expect(B.page.getByTestId('screen-S-69')).toBeVisible();
    await clearAnims(B.page);
    await B.page.getByTestId('checkin-level-4').click();
    await expectAnim(B.page, 'ANIM-15', { reduced, within: 'screen-S-69' });
    await B.page.getByTestId('checkin-save').click();
    await expect(B.page.getByTestId('checkin-message')).toBeVisible();

    // ANIM-21: нээгдсэн капсул (S-68) — баярын мөч өөрөө ≤ 2.5 с-д хаагдана, дараа нь хоёр хэсэг
    await B.page.goto(`/together/capsules/${capsule.id}`);
    await expectAnim(B.page, 'ANIM-21', { reduced, within: 'celebration-overlay' });
    await expect(B.page.getByTestId('capsule-opened-moment')).toBeVisible();
    await finishCelebration(B.page, 'ANIM-21', 'auto');
    await expect(B.page.getByTestId(`capsule-opened-${a.id}`)).toContainText(partA);

    // ANIM-20: зорилгын алхам → шингэн явц; 100%-д баярын мөч, товшиход хаагдана
    await signedIn(A.page, a, `/together/goals/${goal.id}`, 'screen-S-64-detail');
    await clearAnims(A.page);
    await A.page.getByTestId(`goal-step-toggle-${step1.id}`).click();
    await expectAnim(A.page, 'ANIM-20', { reduced, within: 'screen-S-64-detail' });
    await expect(A.page.getByTestId('goal-percent')).toHaveText('50%');
    await A.page.getByTestId(`goal-step-toggle-${step2.id}`).click();
    await expectAnim(A.page, 'ANIM-20', { reduced, within: 'celebration-overlay' });
    await expect(A.page.getByTestId('goal-complete')).toBeVisible();
    await finishCelebration(A.page, 'ANIM-20', 'tap');
    await expect(A.page.getByTestId('goal-percent')).toHaveText('100%');
  },
};

/** S-30, S-72: ANIM-10, 13, 22. */
const memoriesScenario: Scenario = {
  anims: ['ANIM-10', 'ANIM-13', 'ANIM-22'],
  title: 'дурсамж: таб солих, шинэ дурсамж, «Бидний жил»',
  run: async ({ a: A, b: B, reduced }) => {
    const [a, b] = await linkedCouple(A.name, B.name, 'anim-mem');
    const jpeg = await makeJpeg(A.page);
    const today = localDate(0);
    const year = today.slice(0, 4);
    for (let i = 1; i <= 2; i += 1) {
      await createMemoryApi(a, jpeg, { title: `Өмнөх дурсамж ${i}`, occurredOn: today, location: { name: 'Тэрэлж', lat: 47.98, lon: 107.45 } });
    }

    // ANIM-10: нүүрээс «Дурсамж» таб руу
    await signInUi(A.page, a);
    await expect(A.page.getByTestId('screen-S-20')).toBeVisible();
    await clearAnims(A.page);
    await A.page.getByTestId('tab-memories').click();
    await expectAnim(A.page, 'ANIM-10', { reduced, within: 'tab-memories' });
    await expect(A.page.getByTestId('screen-S-30')).toBeVisible();
    await A.page.waitForLoadState('networkidle');

    // ANIM-13: S-30 нээлттэй байхад хамтрагч дурсамж нэмнэ (`memory.created` → жагсаалт дахин татна).
    // PolaroidIn-ийн SESSION_START нь lazy route chunk ачаалагдах агшин — тиймээс таб нээгдсэний
    // ДАРАА үүсгэнэ; зохиогч өөрөө event авдаггүй тул хамтрагчийнх (MemoryService → partner).
    await A.page.waitForTimeout(1_000);
    const fresh = await createMemoryApi(b, jpeg, { title: 'Шинэ дурсамж', occurredOn: today, location: { name: 'Хустай', lat: 47.8, lon: 106.0 } });
    await expectAnim(A.page, 'ANIM-13', { reduced, within: 'memories-timeline', timeout: 15_000 });
    await expect(A.page.getByTestId(`memory-card-${fresh.id}`)).toBeVisible();

    // ANIM-22: Recap → «Бидний жил» (S-72) story слайд
    await A.page.goto('/memories?view=recap');
    await A.page.getByTestId(`memories-year-${year}`).click();
    await expect(A.page.getByTestId('screen-S-72')).toBeVisible();
    await expectAnim(A.page, 'ANIM-22', { reduced, within: 'screen-S-72' });
    await expect(A.page.getByTestId('recap-position')).toBeVisible();
  },
};

/** S-10 → S-12: ANIM-14. */
const pairingScenario: Scenario = {
  anims: ['ANIM-14', 'AC-MO-02'],
  title: 'хос холбогдох: урьсан хүн батлахад баярын мөч ≤ 2.5 с',
  run: async ({ a: A, b: B, reduced }) => {
    const a = await createVerifiedUser(A.name, 'anim-paira');
    const b = await createVerifiedUser(B.name, 'anim-pairb');
    const invite = await apiJson<{ code: string }>(a, 'POST', '/invites');
    const pairing = await apiJson<{ id: string }>(b, 'POST', '/pairings', { code: invite.code });

    await signInUi(A.page, a);
    await A.page.goto(`/join-confirm?pairing=${pairing.id}`);
    await expect(A.page.getByTestId('join-request')).toBeVisible();
    await A.page.getByTestId('join-confirm').click();
    await expectAnim(A.page, 'ANIM-14', { reduced, within: 'celebration-overlay', timeout: 20_000 });
    await expect(A.page.getByTestId('screen-S-12')).toBeVisible();
    await finishCelebration(A.page, 'ANIM-14', 'auto');
    await expect(A.page.getByTestId('linked-first-memory')).toBeVisible();
  },
};

/** S-25: ANIM-05 — «100 дахь өдөр» нээгдэхэд, товшиход хаагдаж дахин гарахгүй. */
const celebrationScenario: Scenario = {
  anims: ['ANIM-05', 'AC-MO-02'],
  title: 'ойн баяр: «100 дахь өдөр» S-25, товшиход хаагдана, дахин нээхэд гарахгүй',
  run: async ({ a: A, b: B, reduced }) => {
    const [a, b] = await linkedCouple(A.name, B.name, 'anim-ann');
    // SD-01: эхэлсэн + 99 = 100 дахь өдөр (AutoMilestoneCalculator.DAY_MILESTONES)
    await confirmStartDate(a, b, localDate(-99));

    await signInUi(A.page, a);
    await expect(A.page.getByTestId('screen-S-25')).toBeVisible({ timeout: 15_000 });
    await expectAnim(A.page, 'ANIM-05', { reduced, within: 'screen-S-25' });
    await expect(A.page.getByTestId('celebration-days')).toContainText('100');
    await finishCelebration(A.page, 'ANIM-05', 'tap');
    await expect(A.page.getByTestId('screen-S-25')).toHaveCount(0);

    // GAP-23: сервер үзсэн гэж тэмдэглэсэн — дахин нээхэд S-25 ба ANIM-05 гарахгүй
    await expect
      .poll(async () => (await apiJson<Celebration[]>(a, 'GET', '/me/celebrations')).filter((c) => c.kind === 'MILESTONE' || c.kind === 'ANNIVERSARY').length)
      .toBe(0);
    await A.page.reload();
    await expect(A.page.getByTestId('screen-S-20')).toBeVisible();
    await A.page.waitForLoadState('networkidle');
    await expect(A.page.getByTestId('screen-S-25')).toHaveCount(0);
    await expect(A.page.getByTestId('anim-ANIM-05')).toHaveCount(0);
  },
};

const SCENARIOS: Scenario[] = [homeScenario, chatScenario, plansScenario, togetherScenario, memoriesScenario, pairingScenario, celebrationScenario];

function declareScenarios(prefix: string, reduced: boolean) {
  for (const s of SCENARIOS) {
    test(`${prefix} ${s.anims.join(' ')} — ${s.title}`, async ({ partnerA, partnerB }) => {
      test.setTimeout(180_000);
      await recordAnims(partnerA.context);
      await recordAnims(partnerB.context);
      await s.run({ a: partnerA, b: partnerB, reduced });
    });
  }
}

const PULL_TO_REFRESH_SKIP = 'ANIM-09: pull-to-refresh (RefreshControl) вэбэд байхгүй тул өдөөх боломжгүй; native-д ГАР — docs/MANUAL-TEST.md';

test.describe('AC-214 ANIM-01…23 тоглогдоно', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Хөтчөөс хамаарахгүй — хөтөч бүрийн шалгалт smoke.spec-д; ANIM-23 хуурамч микрофон Chromium-д л');
  declareScenarios('AC-214', false);

  test('AC-214 ANIM-09 pull-to-refresh', () => {
    test.skip(true, PULL_TO_REFRESH_SKIP);
  });
});

test.describe('AC-MO-01 reduce motion — fade, утга хэвээр', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Хөтчөөс хамаарахгүй — хөтөч бүрийн шалгалт smoke.spec-д');
  test.use({ reducedMotion: 'reduce' });
  declareScenarios('AC-MO-01 AC-214', true);

  test('AC-MO-01 ANIM-09 pull-to-refresh', () => {
    test.skip(true, PULL_TO_REFRESH_SKIP);
  });
});
