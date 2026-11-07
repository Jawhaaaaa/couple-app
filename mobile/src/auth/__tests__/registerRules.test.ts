import { birthDateIssue, isAdult, maskBirthDateInput, parseBirthDateInput, plusYears } from '../birthDate';
import { resolveGate, type Me } from '../gate';
import { passwordIssue, passwordStrength } from '../passwordStrength';
import { isEmail } from '../validation';

describe('AC-164 нууц үгийн дүрэм', () => {
  it('AC-164 7 тэмдэгт (1234567) — хэт богино', () => {
    expect(passwordIssue('1234567')).toBe('tooShort');
    expect(passwordStrength('1234567')).toMatchObject({ acceptable: false, issue: 'tooShort', score: 1 });
  });

  it('AC-164 нийтлэг жагсаалтад байгаа (password1) — татгалзана, том жижиг үсэг хамаарахгүй', () => {
    expect(passwordIssue('password1')).toBe('common');
    expect(passwordIssue('PassWord1')).toBe('common');
    expect(passwordStrength('password1').acceptable).toBe(false);
  });

  it('AC-164 8+ тэмдэгт, жагсаалтад байхгүй — зөвшөөрнө', () => {
    expect(passwordIssue('Talbai-Nuur-2026')).toBeNull();
    expect(passwordStrength('Talbai-Nuur-2026')).toMatchObject({ acceptable: true, score: 4 });
    expect(passwordStrength('bayarmaa88').acceptable).toBe(true);
  });

  it('AC-164 имэйлтэй (эсвэл @-ийн өмнөх хэсэгтэй) ижил — татгалзана', () => {
    expect(passwordIssue('batbayar@aura.test', 'batbayar@aura.test')).toBe('sameAsEmail');
    expect(passwordIssue('Batbayar', 'batbayar@aura.test')).toBe('sameAsEmail');
  });

  it('AC-164 128-аас урт — татгалзана; хоосон — оноо 0', () => {
    expect(passwordIssue('a'.repeat(129))).toBe('tooLong');
    expect(passwordStrength('').score).toBe(0);
  });
});

describe('AC-04 18+ төрсөн огноо', () => {
  const today = '2026-11-07';

  it('AC-04 2008-11-07 зөвшөөрнө, 2008-11-08 татгалзана', () => {
    expect(isAdult('2008-11-07', today)).toBe(true);
    expect(isAdult('2008-11-08', today)).toBe(false);
    expect(birthDateIssue('2008-11-08', today)).toBe('underage');
    expect(birthDateIssue('2008-11-07', today)).toBeNull();
  });

  it('AC-04 2-р сарын 29-нд төрсөн бол 18 насны өдөр нь 2-р сарын 28 (backend-тэй ижил)', () => {
    expect(plusYears('2008-02-29', 18)).toBe('2026-02-28');
    expect(isAdult('2008-02-29', '2026-02-28')).toBe(true);
    expect(isAdult('2008-02-29', '2026-02-27')).toBe(false);
  });

  it('AC-04 байхгүй, ирээдүйн, дутуу огноо', () => {
    expect(birthDateIssue('1999-02-30', today)).toBe('invalid');
    expect(birthDateIssue('2030-01-01', today)).toBe('invalid');
    expect(birthDateIssue(null, today)).toBe('incomplete');
  });

  it('AC-04 цифрийг ОООО.СС.ӨӨ маск болгож ISO огноо гаргана', () => {
    expect(maskBirthDateInput('2008')).toBe('2008');
    expect(maskBirthDateInput('20081')).toBe('2008.1');
    expect(maskBirthDateInput('20081108')).toBe('2008.11.08');
    expect(maskBirthDateInput('2008.11.08999')).toBe('2008.11.08');
    expect(parseBirthDateInput('2008.11.08')).toBe('2008-11-08');
    expect(parseBirthDateInput('2008.11')).toBeNull();
  });
});

describe('имэйлийн шалгалт', () => {
  it('энгийн хэлбэрийг шалгана', () => {
    expect(isEmail('bat@aura.test')).toBe(true);
    expect(isEmail(' bat@aura.test ')).toBe(true);
    expect(isEmail('bat@aura')).toBe(false);
    expect(isEmail('bat aura.test')).toBe(false);
  });
});

describe('AC-63 эхлэлийн хаалга', () => {
  const me = {
    id: '0192f3a4-0000-7000-8000-00000000000a',
    email: 'bat@aura.test',
    displayName: 'Бат',
    birthDate: '1998-05-14',
    timezone: 'Asia/Ulaanbaatar',
    locale: 'mn',
    emailVerified: true,
    policyVersionAccepted: '2026-11-01',
    policyUpdateRequired: false,
    onlineVisible: true,
    typingVisible: true,
    space: { id: '0192f3a4-5b6c-7d8e-9f01-23456789abcd', kind: 'SOLO', status: 'ACTIVE' },
  } as Me;

  it('сессгүй → нэвтрэх', () => {
    expect(resolveGate({ signedIn: false, me })).toEqual({ pathname: '/login' });
    expect(resolveGate({ signedIn: true, me: undefined })).toEqual({ pathname: '/login' });
  });

  it('имэйл баталгаажаагүй → S-05', () => {
    expect(resolveGate({ signedIn: true, me: { ...me, emailVerified: false } })).toEqual({
      pathname: '/verify-email',
      params: { email: 'bat@aura.test' },
    });
  });

  it('AC-63 бодлогын шинэ хувилбар → S-90 хаалга', () => {
    expect(resolveGate({ signedIn: true, me: { ...me, policyUpdateRequired: true } })).toEqual({ pathname: '/policy-update' });
  });

  it('хосгүй (SOLO) → S-13 хүлээх дэлгэц', () => {
    expect(resolveGate({ signedIn: true, me })).toEqual({ pathname: '/waiting' });
  });

  it('хостой (COUPLE) → нүүр', () => {
    expect(resolveGate({ signedIn: true, me: { ...me, space: { ...me.space, kind: 'COUPLE' } } })).toEqual({ pathname: '/home' });
  });

  it('бодлого ба имэйл нь хос эсэхээс өмнө шалгагдана', () => {
    const couple = { ...me, space: { ...me.space, kind: 'COUPLE' as const } };
    expect(resolveGate({ signedIn: true, me: { ...couple, policyUpdateRequired: true } })).toEqual({ pathname: '/policy-update' });
    expect(resolveGate({ signedIn: true, me: { ...couple, emailVerified: false } })).toMatchObject({ pathname: '/verify-email' });
  });
});
