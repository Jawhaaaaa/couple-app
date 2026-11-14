import { api } from '@/api/client';
import { useLockStore } from '@/lock/lockStore';
import {
  assertionToJSON,
  passkeySupported,
  passkeyUnlockFor,
  registerPasskey,
  registrationToJSON,
  removePasskey,
  toCreationOptions,
  toRequestOptions,
  unlockWithPasskey,
} from '@/lock/passkey';
import { base64UrlToBytes, bytesToBase64Url } from '@/pwa/base64url';

import { fail, ok } from '../../../test/memoryFixtures';

jest.mock('@/auth/tokenStore', () => ({
  usesCookieRefresh: true,
  getRefreshToken: jest.fn(async () => null),
  setRefreshToken: jest.fn(async () => {}),
  clearRefreshToken: jest.fn(async () => {}),
}));

const bytes = (...b: number[]) => new Uint8Array(b);
const ascii = (s: string) => new TextEncoder().encode(s);
const buf = (u: Uint8Array) => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;

describe('AC-157 base64url хувиргалт (цэвэр функц)', () => {
  it('RFC 4648 жишээ — padding-гүй', () => {
    expect(['', 'f', 'fo', 'foo', 'foob', 'fooba', 'foobar'].map((s) => bytesToBase64Url(ascii(s)))).toEqual(['', 'Zg', 'Zm8', 'Zm9v', 'Zm9vYg', 'Zm9vYmE', 'Zm9vYmFy']);
  });

  it('URL-safe тэмдэгт (- _) ба буцааж задлах', () => {
    expect(bytesToBase64Url(bytes(0xfb, 0xff, 0xbf))).toBe('-_-_');
    expect(Array.from(base64UrlToBytes('-_-_'))).toEqual([0xfb, 0xff, 0xbf]);
  });

  it('стандарт base64 (+/ ба =) ч хүлээн авна; буруу тэмдэгт/урт — алдаа', () => {
    expect(Array.from(base64UrlToBytes('+/+/'))).toEqual([0xfb, 0xff, 0xbf]);
    expect(Array.from(base64UrlToBytes('Zg=='))).toEqual([0x66]);
    expect(() => base64UrlToBytes('Z')).toThrow();
    expect(() => base64UrlToBytes('Zm9*')).toThrow();
  });

  it('санамсаргүй байт буцааж ижил (ArrayBuffer ба view-ийн offset)', () => {
    const data = Uint8Array.from({ length: 257 }, (_, i) => (i * 37 + 11) & 0xff);
    expect(Array.from(base64UrlToBytes(bytesToBase64Url(data)))).toEqual(Array.from(data));
    expect(bytesToBase64Url(data.subarray(1, 4))).toBe(bytesToBase64Url(bytes(data[1], data[2], data[3])));
    expect(bytesToBase64Url(buf(ascii('foo')))).toBe('Zm9v');
  });
});

const CREATION = {
  challenge: bytesToBase64Url(ascii('challenge-32')),
  rp: { id: 'aura.test', name: 'Aura' },
  user: { id: bytesToBase64Url(bytes(1, 2, 3)), name: 'bat@aura.test', displayName: 'Бат' },
  pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
  timeout: 60000,
  attestation: 'none',
  authenticatorSelection: { authenticatorAttachment: 'platform', residentKey: 'preferred', userVerification: 'required' },
  excludeCredentials: [{ type: 'public-key', id: 'AQID', transports: ['internal'] }],
};
const REQUEST = { challenge: bytesToBase64Url(ascii('assert')), rpId: 'aura.test', allowCredentials: [{ type: 'public-key', id: 'AQID' }], timeout: 60000, userVerification: 'required' };

const created = {
  id: 'AQID',
  rawId: buf(bytes(1, 2, 3)),
  type: 'public-key',
  authenticatorAttachment: 'platform',
  getClientExtensionResults: () => ({}),
  response: { clientDataJSON: buf(ascii('{"type":"webauthn.create"}')), attestationObject: buf(bytes(0xa3, 0x63)), getTransports: () => ['internal'] },
};
const asserted = {
  id: 'AQID',
  rawId: buf(bytes(1, 2, 3)),
  type: 'public-key',
  response: { clientDataJSON: buf(ascii('{"type":"webauthn.get"}')), authenticatorData: buf(bytes(9, 9)), signature: buf(bytes(0x30, 0x45)), userHandle: buf(bytes(7)) },
};

describe('AC-157 WebAuthn сонголт ба хариуны хувиргалт', () => {
  it('creation options — challenge, user.id, excludeCredentials-ийг байт болгоно; platform + UV', () => {
    const o = toCreationOptions(CREATION as never);
    expect(new TextDecoder().decode(o.challenge as Uint8Array)).toBe('challenge-32');
    expect(Array.from(o.user.id as Uint8Array)).toEqual([1, 2, 3]);
    expect(Array.from(o.excludeCredentials![0].id as Uint8Array)).toEqual([1, 2, 3]);
    expect(o.authenticatorSelection).toMatchObject({ authenticatorAttachment: 'platform', userVerification: 'required' });
    expect(o.attestation).toBe('none');
  });

  it('request options — challenge ба allowCredentials', () => {
    const o = toRequestOptions(REQUEST as never);
    expect(new TextDecoder().decode(o.challenge as Uint8Array)).toBe('assert');
    expect(o.rpId).toBe('aura.test');
    expect(Array.from(o.allowCredentials![0].id as Uint8Array)).toEqual([1, 2, 3]);
    expect(o.userVerification).toBe('required');
  });

  it('RegistrationResponseJSON ба AuthenticationResponseJSON (webauthn4j-ийн хүлээх хэлбэр)', () => {
    expect(registrationToJSON(created)).toEqual({
      id: 'AQID',
      rawId: 'AQID',
      type: 'public-key',
      authenticatorAttachment: 'platform',
      clientExtensionResults: {},
      response: { clientDataJSON: bytesToBase64Url(ascii('{"type":"webauthn.create"}')), attestationObject: 'o2M', transports: ['internal'] },
    });
    expect(assertionToJSON(asserted).response).toEqual({
      clientDataJSON: bytesToBase64Url(ascii('{"type":"webauthn.get"}')),
      authenticatorData: 'CQk',
      signature: 'MEU',
      userHandle: 'Bw',
    });
  });
});

describe('AC-157 passkey урсгал', () => {
  let create: jest.Mock;
  let get: jest.Mock;
  const spies: jest.SpyInstance[] = [];

  beforeEach(() => {
    create = jest.fn(async () => created);
    get = jest.fn(async () => asserted);
    Object.defineProperty(globalThis, 'navigator', { value: { credentials: { create, get } }, configurable: true });
    useLockStore.setState({ enabled: true, locked: true, passkeyId: null, failures: 3, lockedUntil: null });
  });
  afterEach(() => spies.splice(0).forEach((s) => s.mockRestore()));

  it('тохируулах: registration-options → credentials.create → POST /passkeys; credential id хадгална', async () => {
    const post = jest.spyOn(api, 'POST').mockImplementation((async (path: string) => (path === '/passkeys/registration-options' ? ok(CREATION) : ok(undefined, 201))) as never);
    spies.push(post);
    expect(await registerPasskey()).toBe('AQID');
    expect(create).toHaveBeenCalledWith({ publicKey: expect.objectContaining({ rp: CREATION.rp }) });
    expect(post).toHaveBeenLastCalledWith('/passkeys', { body: { credential: registrationToJSON(created) } });
    expect(useLockStore.getState().passkeyId).toBe('AQID');
  });

  it('апп дахин нээхэд passkey асууна — verified бол түгжээ тайлагдаж оролдлого тэглэгдэнэ', async () => {
    const post = jest.spyOn(api, 'POST').mockImplementation((async (path: string) =>
      path === '/passkeys/assertion-options' ? ok(REQUEST) : ok({ verified: true })) as never);
    spies.push(post);
    expect(await unlockWithPasskey()).toBe(true);
    expect(get).toHaveBeenCalled();
    expect(post).toHaveBeenLastCalledWith('/passkeys/assertion', { body: { credential: assertionToJSON(asserted) } });
    expect(useLockStore.getState()).toMatchObject({ locked: false, failures: 0 });
  });

  it('сервер PASSKEY_INVALID, хэрэглэгч цуцалсан, offline — түгжээ хэвээр (PIN нөөц)', async () => {
    spies.push(
      jest.spyOn(api, 'POST').mockImplementation((async (path: string) => (path === '/passkeys/assertion-options' ? ok(REQUEST) : fail(400, 'PASSKEY_INVALID'))) as never),
    );
    expect(await unlockWithPasskey()).toBe(false);
    get.mockRejectedValueOnce(new DOMException('cancelled', 'NotAllowedError'));
    expect(await unlockWithPasskey()).toBe(false);
    expect(useLockStore.getState().locked).toBe(true);
  });

  it('устгах — DELETE /passkeys/{id}; серверт алга (404) бол ч локал арилна', async () => {
    useLockStore.setState({ passkeyId: 'AQID' });
    const del = jest.spyOn(api, 'DELETE').mockImplementation((async () => fail(404, 'NOT_FOUND')) as never);
    spies.push(del);
    await removePasskey();
    expect(del).toHaveBeenCalledWith('/passkeys/{credentialId}', { params: { path: { credentialId: 'AQID' } } });
    expect(useLockStore.getState().passkeyId).toBeNull();
  });

  it('authenticator-гүй орчин / native → дэмжихгүй (PIN); passkey товч зөвхөн вэб + бүртгэлтэй үед', async () => {
    expect(await passkeySupported('ios')).toBe(false);
    expect(await passkeySupported('web')).toBe(false);
    Object.defineProperty(globalThis, 'PublicKeyCredential', {
      value: { isUserVerifyingPlatformAuthenticatorAvailable: jest.fn(async () => true) },
      configurable: true,
    });
    expect(await passkeySupported('web')).toBe(true);
    expect(passkeyUnlockFor('web', 'AQID')).toBe(unlockWithPasskey);
    expect(passkeyUnlockFor('web', null)).toBeUndefined();
    expect(passkeyUnlockFor('ios', 'AQID')).toBeUndefined();
    delete (globalThis as { PublicKeyCredential?: unknown }).PublicKeyCredential;
  });
});
