#!/usr/bin/env node
/**
 * E2E-ийн түр VAPID түлхүүр (AC-154): P-256 хос үүсгэж `.env`-ийн мөр болгон хэвлэнэ.
 * Ажиллалт бүрд шинэ — нууц утга репод хадгалагдахгүй. Жишээ: `node scripts/vapid-keys.mjs >> ../.env`
 */
import { generateKeyPairSync } from 'node:crypto';

const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const pub = publicKey.export({ format: 'jwk' });
const priv = privateKey.export({ format: 'jwk' });
const raw = Buffer.concat([Buffer.from([4]), Buffer.from(pub.x, 'base64url'), Buffer.from(pub.y, 'base64url')]);
console.log(`AURA_VAPID_PUBLIC_KEY=${raw.toString('base64url')}`);
console.log(`AURA_VAPID_PRIVATE_KEY=${priv.d}`);
