/**
 * Babel: Expo-гийн анхдагч preset + lucide дүрсийг файл тус бүрээр import хийх plugin
 * (FR-19.10, AC-160 — вэбийн эхний ачааллын JS-ийг ~2.5 MB-аар багасгана,
 * `scripts/babel-plugin-lucide-icons.cjs`). Jest-д plugin хэрэггүй (`moduleNameMapper`-аар cjs barrel).
 */
module.exports = function babelConfig(api) {
  const isTest = api.env('test');
  return {
    presets: ['babel-preset-expo'],
    plugins: isTest ? [] : [require.resolve('./scripts/babel-plugin-lucide-icons.cjs')],
  };
};
