import { createDecipheriv, createECDH, hkdfSync, randomBytes } from 'node:crypto';

import { API_BASE } from './env';

/**
 * Web Push-ийн тестийн төхөөрөмж (DD-AURA-027, AC-154): хөтчийн push service-ийн оронд backend-ийн
 * тестийн хүлээн авагч (`/test/push-sink`, e2e profile) руу илгээгдсэнийг уншиж, RFC 8291
 * (aes128gcm) payload-ыг энэ түлхүүрээр тайлна — серверийн бодит илгээлт (VAPID, шифрлэлт) шалгагдана.
 */
export interface PushSinkMessage {
  receivedAt: string;
  headers: Record<string, string>;
  bodyBase64: string;
}

/**
 * Sink-ийн хаяг backend-ийн өөрийнх нь талаас: backend sink руу өөрөө HTTP-ээр илгээнэ. Тестийн
 * хост дээрх порт (`E2E_API_URL`, жишээ :18680) контейнер дотор өөр тул backend-ийн дотоод хаягийг
 * (compose — `localhost:8080`) ашиглана. Өөр байрлалд `E2E_PUSH_SINK_ORIGIN`.
 */
const SINK_ORIGIN = (process.env.E2E_PUSH_SINK_ORIGIN ?? 'http://localhost:8080').replace(/\/$/, '');

export interface PushDevice {
  sinkId: string;
  /** Backend-ийн илгээх endpoint (`SINK_ORIGIN` + sink зам). */
  endpoint: string;
  /** `PushSubscription.toJSON().keys` — base64url. */
  keys: { p256dh: string; auth: string };
  /** Ирсэн push-ууд (түүхий). */
  messages: () => Promise<PushSinkMessage[]>;
  /** Тайлсан payload-ууд (`{title, body, type, deepLink, notificationId}`). */
  payloads: () => Promise<Record<string, unknown>[]>;
  /** Дараагийн хүлээн авалтын HTTP хариу (жишээ 410 — subscription хүчингүй). */
  respondWith: (status: number) => Promise<void>;
}

async function ok(res: Response, what: string) {
  if (!res.ok) throw new Error(`${what} → ${res.status}: ${await res.text()}`);
  return res;
}

export async function createPushDevice(): Promise<PushDevice> {
  const sink = (await (await ok(await fetch(`${API_BASE}/test/push-sink`, { method: 'POST' }), 'POST /test/push-sink')).json()) as {
    sinkId: string;
    endpoint: string;
  };
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  const auth = randomBytes(16);
  const endpoint = `${SINK_ORIGIN}${new URL(sink.endpoint).pathname}`;
  const messages = async () =>
    (await (await ok(await fetch(`${API_BASE}/test/push-sink/${sink.sinkId}/messages`), 'GET push-sink messages')).json()) as PushSinkMessage[];
  return {
    sinkId: sink.sinkId,
    endpoint,
    keys: { p256dh: ecdh.getPublicKey().toString('base64url'), auth: auth.toString('base64url') },
    messages,
    payloads: async () => (await messages()).map((m) => JSON.parse(decryptAes128gcm(Buffer.from(m.bodyBase64, 'base64'), ecdh, auth))),
    respondWith: async (status) => {
      await ok(
        await fetch(`${API_BASE}/test/push-sink/${sink.sinkId}/respond`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status }),
        }),
        'POST push-sink respond',
      );
    },
  };
}

/** RFC 8291 + RFC 8188 (`Content-Encoding: aes128gcm`, нэг бичлэг) — хүлээн авагчийн талаас тайлна. */
export function decryptAes128gcm(body: Buffer, ua: ReturnType<typeof createECDH>, auth: Buffer): string {
  const salt = body.subarray(0, 16);
  const idlen = body.readUInt8(20);
  const asPublic = body.subarray(21, 21 + idlen);
  const ciphertext = body.subarray(21 + idlen);
  const ecdhSecret = ua.computeSecret(asPublic);
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), ua.getPublicKey(), asPublic]);
  const ikm = Buffer.from(hkdfSync('sha256', ecdhSecret, auth, keyInfo, 32));
  const cek = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  const decipher = createDecipheriv('aes-128-gcm', cek, nonce);
  decipher.setAuthTag(ciphertext.subarray(ciphertext.length - 16));
  const plain = Buffer.concat([decipher.update(ciphertext.subarray(0, ciphertext.length - 16)), decipher.final()]);
  // Сүүлийн бичлэгийн padding: өгөгдөл ‖ 0x02 ‖ 0x00*
  let end = plain.length - 1;
  while (end >= 0 && plain[end] === 0) end -= 1;
  if (plain[end] !== 0x02) throw new Error('aes128gcm: padding-ийн хязгаарлагч (0x02) алга');
  return plain.subarray(0, end).toString('utf8');
}
