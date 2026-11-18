import { ApiRequestError } from '@/api/client';
import type { Me } from '@/api/queries/auth';
import { conflictVersion, patchMe, profileVersionCache } from '@/api/queries/profile';

import { draftFromMe, isValidTimeZone, profilePatch } from '../profileForm';

jest.mock('@/auth/tokenStore', () => ({
  usesCookieRefresh: false,
  getRefreshToken: jest.fn(async () => null),
  setRefreshToken: jest.fn(async () => {}),
  clearRefreshToken: jest.fn(async () => {}),
}));

const me = {
  id: '0192f3a4-0000-7000-8000-00000000000a',
  email: 'bat@aura.test',
  displayName: 'Бат',
  callName: null,
  birthDate: '1998-05-14',
  timezone: 'Asia/Ulaanbaatar',
  locale: 'mn',
  city: null,
  emailVerified: true,
  policyVersionAccepted: '2026-11-01',
  policyUpdateRequired: false,
  onlineVisible: true,
  typingVisible: true,
  space: { id: '0192f3a4-5b6c-7d8e-9f01-23456789abcd', kind: 'COUPLE', status: 'ACTIVE' },
} as Me;

const conflict = (details: Record<string, unknown>) =>
  new ApiRequestError(409, { code: 'VERSION_CONFLICT', message: 'x', traceId: 't', details });

beforeEach(() => profileVersionCache().reset());

describe('AC-62 PATCH /me хувилбарын зөрчил (VERSION_CONFLICT)', () => {
  it('эхэндээ version 0; 409-д details.currentVersion-ийг аваад нэг удаа давтана', async () => {
    const send = jest.fn().mockRejectedValueOnce(conflict({ currentVersion: 7 })).mockResolvedValueOnce({ ...me, callName: 'Батаа' });
    const updated = await patchMe({ callName: 'Батаа' }, send);
    expect(updated.callName).toBe('Батаа');
    expect(send).toHaveBeenNthCalledWith(1, { callName: 'Батаа', version: 0 });
    expect(send).toHaveBeenNthCalledWith(2, { callName: 'Батаа', version: 7 });
    expect(profileVersionCache().get()).toBe(8);
  });

  it('дараагийн дуудлага сүүлд мэдсэн хувилбарыг илгээнэ', async () => {
    const send = jest.fn().mockRejectedValueOnce(conflict({ currentVersion: 3 })).mockResolvedValue(me);
    await patchMe({ onlineVisible: false }, send);
    await patchMe({ typingVisible: false }, send);
    expect(send).toHaveBeenLastCalledWith({ typingVisible: false, version: 4 });
  });

  it('хоёр дахь зөрчил эсвэл өөр алдаа — давтахгүй, алдааг шиднэ', async () => {
    const twice = jest.fn().mockRejectedValueOnce(conflict({ currentVersion: 2 })).mockRejectedValueOnce(conflict({ currentVersion: 3 }));
    await expect(patchMe({ callName: 'x' }, twice)).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
    expect(twice).toHaveBeenCalledTimes(2);

    const other = jest.fn().mockRejectedValue(new ApiRequestError(400, { code: 'VALIDATION_FAILED', message: 'x', traceId: 't' }));
    await expect(patchMe({ callName: 'x' }, other)).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(other).toHaveBeenCalledTimes(1);
  });

  it('currentVersion тоо биш бол давтахгүй', async () => {
    expect(conflictVersion(conflict({ currentVersion: '5' }))).toBeNull();
    expect(conflictVersion(conflict({}))).toBeNull();
    expect(conflictVersion(new Error('x'))).toBeNull();
    const send = jest.fn().mockRejectedValue(conflict({}));
    await expect(patchMe({ callName: 'x' }, send)).rejects.toBeInstanceOf(ApiRequestError);
    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe('AC-62 S-81 зөвхөн өөрчлөгдсөн талбар', () => {
  it('өөрчлөлтгүй бол хоосон, дуудах нэр ба хот солигдвол зөвхөн тэд', () => {
    const initial = draftFromMe(me);
    expect(profilePatch(initial, initial)).toEqual({});
    const city = { name: 'Дархан', countryCode: 'MN', lat: 49.48, lon: 105.96, timezone: 'Asia/Ulaanbaatar' };
    expect(profilePatch(initial, { ...initial, callName: '  Батаа ', city })).toEqual({ callName: 'Батаа', city });
    expect(profilePatch({ ...initial, callName: 'Батаа' }, { ...initial, callName: '' })).toEqual({ callName: null });
  });

  it('цагийн бүсийг Intl-ээр шалгана', () => {
    expect(isValidTimeZone('Asia/Ulaanbaatar')).toBe(true);
    expect(isValidTimeZone('America/Argentina/Buenos_Aires')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
  });
});
