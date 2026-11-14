import { Platform } from 'react-native';

import { api, ApiRequestError, unwrap } from '@/api/client';
import type { components } from '@/api/schema';
import { base64UrlToBytes, bytesToBase64Url } from '@/pwa/base64url';

import { RESET_ATTEMPTS } from './lockPolicy';
import { useLockStore } from './lockStore';

/**
 * Вэбийн passkey түгжээ (FR-19.6, DD-AURA-033, AC-157): platform authenticator (Face ID / Touch ID /
 * Windows Hello)-оор апп-ын түгжээг серверээр баталгаажуулж тайлна (`/passkeys/**`, webauthn4j).
 * Нэвтрэлт биш — хэрэглэгч аль хэдийн нэвтэрсэн; PIN нь үргэлж нөөц (дэмжихгүй, offline, татгалзсан).
 * Native-д `expo-local-authentication` (LockScreen) хэвээр.
 */
type CreationOptionsJSON = components['schemas']['PublicKeyCredentialCreationOptions'];
type RequestOptionsJSON = components['schemas']['PublicKeyCredentialRequestOptions'];
type DescriptorJSON = { id: string; type?: string; transports?: string[] };

/** WebAuthn platform authenticator (UV-тэй) энэ хөтөч/төхөөрөмжид байгаа эсэх. */
export async function passkeySupported(platform: string = Platform.OS): Promise<boolean> {
  if (platform !== 'web' || typeof window === 'undefined') return false;
  const PKC = (window as unknown as { PublicKeyCredential?: typeof PublicKeyCredential }).PublicKeyCredential;
  if (!PKC || typeof navigator === 'undefined' || !navigator.credentials) return false;
  try {
    return typeof PKC.isUserVerifyingPlatformAuthenticatorAvailable === 'function' && (await PKC.isUserVerifyingPlatformAuthenticatorAvailable());
  } catch {
    return false;
  }
}

const descriptor = (d: DescriptorJSON): PublicKeyCredentialDescriptor => ({
  type: 'public-key',
  id: base64UrlToBytes(d.id),
  ...(d.transports ? { transports: d.transports as AuthenticatorTransport[] } : {}),
});

/** Серверийн JSON (base64url) → `navigator.credentials.create`-ийн сонголт (ArrayBuffer). */
export function toCreationOptions(json: CreationOptionsJSON): PublicKeyCredentialCreationOptions {
  const { challenge, user, rp, pubKeyCredParams, timeout, excludeCredentials, authenticatorSelection, attestation } = json as CreationOptionsJSON & {
    excludeCredentials?: DescriptorJSON[];
    authenticatorSelection?: AuthenticatorSelectionCriteria;
    attestation?: AttestationConveyancePreference;
  };
  const u = user as { id: string; name: string; displayName: string };
  return {
    challenge: base64UrlToBytes(challenge),
    rp: rp as unknown as PublicKeyCredentialRpEntity,
    user: { id: base64UrlToBytes(u.id), name: u.name, displayName: u.displayName },
    pubKeyCredParams: pubKeyCredParams as unknown as PublicKeyCredentialParameters[],
    ...(timeout ? { timeout } : {}),
    excludeCredentials: (excludeCredentials ?? []).map(descriptor),
    authenticatorSelection: authenticatorSelection ?? { authenticatorAttachment: 'platform', userVerification: 'required' },
    attestation: attestation ?? 'none',
  };
}

/** Серверийн JSON → `navigator.credentials.get`-ийн сонголт. */
export function toRequestOptions(json: RequestOptionsJSON): PublicKeyCredentialRequestOptions {
  const { challenge, rpId, allowCredentials, timeout, userVerification } = json as RequestOptionsJSON & { userVerification?: UserVerificationRequirement };
  return {
    challenge: base64UrlToBytes(challenge),
    ...(rpId ? { rpId } : {}),
    allowCredentials: ((allowCredentials ?? []) as DescriptorJSON[]).map(descriptor),
    ...(timeout ? { timeout } : {}),
    userVerification: userVerification ?? 'required',
  };
}

interface CredentialLike {
  id: string;
  rawId: ArrayBuffer;
  type: string;
  authenticatorAttachment?: string | null;
  getClientExtensionResults?: () => AuthenticationExtensionsClientOutputs;
}

/** `PublicKeyCredential` (create) → WebAuthn `RegistrationResponseJSON` (гэрээний `PasskeyRegistration.credential`). */
export function registrationToJSON(
  cred: CredentialLike & { response: { clientDataJSON: ArrayBuffer; attestationObject: ArrayBuffer; getTransports?: () => string[] } },
) {
  return {
    id: cred.id,
    rawId: bytesToBase64Url(cred.rawId),
    type: cred.type,
    authenticatorAttachment: cred.authenticatorAttachment ?? undefined,
    clientExtensionResults: cred.getClientExtensionResults?.() ?? {},
    response: {
      clientDataJSON: bytesToBase64Url(cred.response.clientDataJSON),
      attestationObject: bytesToBase64Url(cred.response.attestationObject),
      transports: cred.response.getTransports?.() ?? [],
    },
  };
}

/** `PublicKeyCredential` (get) → WebAuthn `AuthenticationResponseJSON` (`PasskeyAssertion.credential`). */
export function assertionToJSON(
  cred: CredentialLike & {
    response: { clientDataJSON: ArrayBuffer; authenticatorData: ArrayBuffer; signature: ArrayBuffer; userHandle?: ArrayBuffer | null };
  },
) {
  return {
    id: cred.id,
    rawId: bytesToBase64Url(cred.rawId),
    type: cred.type,
    authenticatorAttachment: cred.authenticatorAttachment ?? undefined,
    clientExtensionResults: cred.getClientExtensionResults?.() ?? {},
    response: {
      clientDataJSON: bytesToBase64Url(cred.response.clientDataJSON),
      authenticatorData: bytesToBase64Url(cred.response.authenticatorData),
      signature: bytesToBase64Url(cred.response.signature),
      ...(cred.response.userHandle ? { userHandle: bytesToBase64Url(cred.response.userHandle) } : {}),
    },
  };
}

/**
 * Passkey бүртгэнэ (S-102): сонголт → `credentials.create` (platform, UV) → `POST /passkeys`.
 * Амжилттай бол credential id-г (устгахад) түгжээний дэлгүүрт хадгална.
 */
export async function registerPasskey(): Promise<string> {
  const options = await unwrap(api.POST('/passkeys/registration-options'));
  const cred = (await navigator.credentials.create({ publicKey: toCreationOptions(options) })) as unknown as Parameters<typeof registrationToJSON>[0] | null;
  if (!cred) throw new Error('passkey: credential үүссэнгүй');
  await unwrap(api.POST('/passkeys', { body: { credential: registrationToJSON(cred) } }));
  useLockStore.getState().set({ passkeyId: cred.id });
  return cred.id;
}

/** Passkey-ээр баталгаажуулна; серверт `verified: true` бол л `true` (түгжээг тайлахгүй). */
export async function verifyPasskey(): Promise<boolean> {
  const options = await unwrap(api.POST('/passkeys/assertion-options'));
  const cred = (await navigator.credentials.get({ publicKey: toRequestOptions(options) })) as unknown as Parameters<typeof assertionToJSON>[0] | null;
  if (!cred) return false;
  const res = await unwrap(api.POST('/passkeys/assertion', { body: { credential: assertionToJSON(cred) } }));
  return res?.verified === true;
}

/**
 * S-14-ийн «passkey» товч (AC-157): баталгаажвал түгжээг тайлна. Цуцалсан, offline, сервер татгалзсан
 * — бүгд `false` (PIN-ээр үргэлжилнэ).
 */
export async function unlockWithPasskey(): Promise<boolean> {
  try {
    if (!(await verifyPasskey())) return false;
    useLockStore.getState().set({ locked: false, ...RESET_ATTEMPTS });
    return true;
  } catch {
    return false;
  }
}

/** Passkey устгана — серверт аль хэдийн алга (404) бол ч локал тэмдэглэгээг арилгана. */
export async function removePasskey(): Promise<void> {
  const id = useLockStore.getState().passkeyId;
  if (id) {
    try {
      await unwrap(api.DELETE('/passkeys/{credentialId}', { params: { path: { credentialId: id } } }));
    } catch (e) {
      if (!(e instanceof ApiRequestError && e.status === 404)) throw e;
    }
  }
  useLockStore.getState().set({ passkeyId: null });
}

/** Түгжээний дэлгэцэнд passkey товч өгөх эсэх: вэб ба passkey бүртгэлтэй үед. */
export function passkeyUnlockFor(platform: string, passkeyId: string | null): (() => Promise<boolean>) | undefined {
  return platform === 'web' && passkeyId ? unlockWithPasskey : undefined;
}
