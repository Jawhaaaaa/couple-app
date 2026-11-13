/* Jest-ийн нийтлэг mock (native модулиудыг test орчинд орлуулна). */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-native-reanimated', () => require('./test/mocks/reanimated'));
jest.mock('react-native-worklets', () => ({ scheduleOnRN: (fn: (...a: unknown[]) => void, ...a: unknown[]) => fn(...a) }));
jest.mock('@react-native-community/netinfo', () => require('@react-native-community/netinfo/jest/netinfo-mock.js'));
// WebView (газрын зураг, S-70) — native модуль; тестэд HTML-ийг prop-оор шалгана
jest.mock('react-native-webview', () => {
  const { View } = jest.requireActual('react-native');
  return { WebView: (props: object) => require('react').createElement(View, { ...props, testID: 'webview' }) };
});
