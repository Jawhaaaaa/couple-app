import Constants, { ExecutionEnvironment } from 'expo-constants';

import { isExpoGo, loadOutsideExpoGo } from '../expoGo';

describe('INV-13 Expo Go хамгаалалт', () => {
  const original = Constants.executionEnvironment;
  afterEach(() => {
    Object.defineProperty(Constants, 'executionEnvironment', { value: original, configurable: true });
  });
  const setEnv = (v: ExecutionEnvironment) =>
    Object.defineProperty(Constants, 'executionEnvironment', { value: v, configurable: true });

  it('Expo Go-д модуль ачаалагдахгүй, null буцна', () => {
    setEnv(ExecutionEnvironment.StoreClient);
    const loader = jest.fn(() => 'native');
    expect(isExpoGo()).toBe(true);
    expect(loadOutsideExpoGo(loader)).toBeNull();
    expect(loader).not.toHaveBeenCalled();
  });

  it('standalone build-д ачаална, алдаа гарвал null', () => {
    setEnv(ExecutionEnvironment.Standalone);
    expect(loadOutsideExpoGo(() => 'native')).toBe('native');
    expect(
      loadOutsideExpoGo(() => {
        throw new Error('модуль алга');
      }),
    ).toBeNull();
  });
});
