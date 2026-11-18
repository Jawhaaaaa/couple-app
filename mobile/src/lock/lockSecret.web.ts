import { kvStore } from '@/offline/storage';

/** Вэбэд PIN-ийн давс ба hash IndexedDB-д (DD-AURA-033) — PIN өөрөө хэзээ ч хадгалагдахгүй. */
const KEY = 'aura.lock.pin.v1';

export interface PinSecret {
  salt: string;
  hash: string;
  iterations: number;
}

export async function readPinSecret(): Promise<PinSecret | null> {
  const raw = await kvStore.get(KEY);
  return raw ? (JSON.parse(raw) as PinSecret) : null;
}

export async function writePinSecret(secret: PinSecret | null): Promise<void> {
  if (secret) await kvStore.set(KEY, JSON.stringify(secret));
  else await kvStore.remove(KEY);
}
