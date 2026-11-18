import * as SecureStore from 'expo-secure-store';

/** PIN-ийн давс ба hash — native-д Keychain/Keystore (`expo-secure-store`), DD-AURA-033. */
const KEY = 'aura.lock.pin.v1';

export interface PinSecret {
  salt: string;
  hash: string;
  iterations: number;
}

export async function readPinSecret(): Promise<PinSecret | null> {
  const raw = await SecureStore.getItemAsync(KEY);
  return raw ? (JSON.parse(raw) as PinSecret) : null;
}

export async function writePinSecret(secret: PinSecret | null): Promise<void> {
  if (secret) await SecureStore.setItemAsync(KEY, JSON.stringify(secret));
  else await SecureStore.deleteItemAsync(KEY);
}
