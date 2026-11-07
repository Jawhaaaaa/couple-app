/* Jest-ийн нийтлэг mock (native модулиудыг test орчинд орлуулна). */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
