/**
 * base64url (RFC 4648 §5, padding-гүй) ↔ байт — VAPID түлхүүр (Web Push, FR-19.3) ба WebAuthn-ийн
 * challenge/credential (FR-19.6). `atob`/`btoa`-аас хамааралгүй цэвэр функц.
 */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const LOOKUP: Record<string, number> = Object.fromEntries([...ALPHABET].map((c, i) => [c, i]));

/** Стандарт base64 (`+/`, `=`)-ийг ч хүлээн авна — серверүүд заримдаа тэгж өгдөг. */
export function base64UrlToBytes(input: string): Uint8Array<ArrayBuffer> {
  const s = input.trim().replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  if (s.length % 4 === 1) throw new Error('base64url: буруу урт');
  const out = new Uint8Array(new ArrayBuffer(Math.floor((s.length * 3) / 4)));
  let buffer = 0;
  let bits = 0;
  let o = 0;
  for (const c of s) {
    const v = LOOKUP[c];
    if (v === undefined) throw new Error(`base64url: буруу тэмдэгт «${c}»`);
    buffer = (buffer << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (buffer >> bits) & 0xff;
    }
  }
  return out;
}

export function bytesToBase64Url(input: ArrayBuffer | ArrayBufferView): string {
  const bytes = input instanceof ArrayBuffer ? new Uint8Array(input) : new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += ALPHABET[(n >> 18) & 63] + ALPHABET[(n >> 12) & 63] + ALPHABET[(n >> 6) & 63] + ALPHABET[n & 63];
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = bytes[i] << 16;
    out += ALPHABET[(n >> 18) & 63] + ALPHABET[(n >> 12) & 63];
  } else if (rest === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
    out += ALPHABET[(n >> 18) & 63] + ALPHABET[(n >> 12) & 63] + ALPHABET[(n >> 6) & 63];
  }
  return out;
}
