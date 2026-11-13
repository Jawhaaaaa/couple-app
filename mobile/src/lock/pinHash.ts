import { v4 as uuidv4 } from 'uuid';

import type { PinSecret } from './lockSecret';
import { constantTimeEqual, pbkdf2Sha256, toHex, utf8 } from './pbkdf2';

/** Утсан дээр ~0.2–0.5 с (PIN-ийн хүч бага тул давталт нь офлайн таалтыг удаашруулна). */
export const PIN_ITERATIONS = 4000;

export function hashPin(pin: string, salt: string, iterations = PIN_ITERATIONS): string {
  return toHex(pbkdf2Sha256(utf8(pin), utf8(salt), iterations));
}

export function createPinSecret(pin: string, iterations = PIN_ITERATIONS): PinSecret {
  const salt = uuidv4();
  return { salt, iterations, hash: hashPin(pin, salt, iterations) };
}

export function verifyPin(pin: string, secret: PinSecret): boolean {
  return constantTimeEqual(hashPin(pin, secret.salt, secret.iterations), secret.hash);
}
