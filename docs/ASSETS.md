<!-- LAB-2 · assets · Код + тест · 2026-11-07 -->
# Гуравдагч этгээдийн asset ба лиценз

Апп-д багцалсан бүх гуравдагч этгээдийн файл энд бүртгэлтэй байна (шаардлага §3.5,
AC-AS-01). `mobile/src/assets/__tests__/assets-registry.test.ts` нь `mobile/assets/`
доторх файл бүр «Файл» баганад байгааг шалгана; бүртгэлгүй файл build-ийн шалгалтыг
унагана. Тохиргоо → «Лиценз ба талархал» (S-89) энэ жагсаалтаас үүснэ (AC-AS-02).

Брэнд/зохиогчийн эрхтэй дүр (Sanrio, Disney, LINE Friends г.м.) ашиглахгүй (AC-AS-03).

Шинэ asset нэмэх: `mobile/scripts/fetch-assets.mjs`-д эх URL-ийг нэмж
`node scripts/fetch-assets.mjs` ажиллуулаад доорх хүснэгтэд мөр нэмнэ.

## Файл тус бүр

| Файл | Нэр | Эх URL | Лиценз | Хаана |
|---|---|---|---|---|
| `assets/lottie/noto/red-heart.json` | Animated Noto Emoji ❤️ (U+2764) | https://fonts.gstatic.com/s/e/notoemoji/latest/2764/lottie.json | CC BY 4.0 © Google | Зүрх хүлээн авах (ANIM-02) |
| `assets/lottie/noto/growing-heart.json` | Animated Noto Emoji 💗 (U+1F497) | https://fonts.gstatic.com/s/e/notoemoji/latest/1f497/lottie.json | CC BY 4.0 © Google | Зүрх хүлээн авах (ANIM-02), реакц |
| `assets/lottie/noto/smiling-hearts.json` | Animated Noto Emoji 🥰 (U+1F970) | https://fonts.gstatic.com/s/e/notoemoji/latest/1f970/lottie.json | CC BY 4.0 © Google | Реакц (ANIM-07) |
| `assets/lottie/noto/heart-eyes.json` | Animated Noto Emoji 😍 (U+1F60D) | https://fonts.gstatic.com/s/e/notoemoji/latest/1f60d/lottie.json | CC BY 4.0 © Google | Реакц (ANIM-07) |
| `assets/lottie/noto/kiss.json` | Animated Noto Emoji 😘 (U+1F618) | https://fonts.gstatic.com/s/e/notoemoji/latest/1f618/lottie.json | CC BY 4.0 © Google | Реакц (ANIM-07) |
| `assets/lottie/noto/hug.json` | Animated Noto Emoji 🤗 (U+1F917) | https://fonts.gstatic.com/s/e/notoemoji/latest/1f917/lottie.json | CC BY 4.0 © Google | Том тэврэлт (FR-4.2) |
| `assets/lottie/noto/sparkles.json` | Animated Noto Emoji ✨ (U+2728) | https://fonts.gstatic.com/s/e/notoemoji/latest/2728/lottie.json | CC BY 4.0 © Google | Эхний 7 хоногийн даалгавар |
| `assets/lottie/noto/love-letter.json` | Animated Noto Emoji 💌 (U+1F48C) | https://fonts.gstatic.com/s/e/notoemoji/latest/1f48c/lottie.json | CC BY 4.0 © Google | Захидал |
| `assets/lottie/noto/joy.json` | Animated Noto Emoji 😂 (U+1F602) | https://fonts.gstatic.com/s/e/notoemoji/latest/1f602/lottie.json | CC BY 4.0 © Google | Реакц (ANIM-07) |
| `assets/lottie/noto/wow.json` | Animated Noto Emoji 😮 (U+1F62E) | https://fonts.gstatic.com/s/e/notoemoji/latest/1f62e/lottie.json | CC BY 4.0 © Google | Реакц (ANIM-07) |
| `assets/lottie/noto/sad.json` | Animated Noto Emoji 😢 (U+1F622) | https://fonts.gstatic.com/s/e/notoemoji/latest/1f622/lottie.json | CC BY 4.0 © Google | Реакц (ANIM-07) |
| `assets/lottie/noto/mood-1.json` | Animated Noto Emoji 😢 (U+1F622) | https://fonts.gstatic.com/s/e/notoemoji/latest/1f622/lottie.json | CC BY 4.0 © Google | Check-in 1-р түвшин (ANIM-15) |
| `assets/lottie/noto/mood-2.json` | Animated Noto Emoji 😕 (U+1F615) | https://fonts.gstatic.com/s/e/notoemoji/latest/1f615/lottie.json | CC BY 4.0 © Google | Check-in 2-р түвшин (ANIM-15) |
| `assets/lottie/noto/mood-3.json` | Animated Noto Emoji 😐 (U+1F610) | https://fonts.gstatic.com/s/e/notoemoji/latest/1f610/lottie.json | CC BY 4.0 © Google | Check-in 3-р түвшин (ANIM-15) |
| `assets/lottie/noto/mood-4.json` | Animated Noto Emoji 🙂 (U+1F642) | https://fonts.gstatic.com/s/e/notoemoji/latest/1f642/lottie.json | CC BY 4.0 © Google | Check-in 4-р түвшин (ANIM-15) |
| `assets/lottie/noto/mood-5.json` | Animated Noto Emoji 😄 (U+1F604) | https://fonts.gstatic.com/s/e/notoemoji/latest/1f604/lottie.json | CC BY 4.0 © Google | Check-in 5-р түвшин (ANIM-15) |
| `assets/fluent/bear.png` | Fluent Emoji 3D 🐻 Bear | https://github.com/microsoft/fluentui-emoji/blob/main/assets/Bear/3D/bear_3d.png | MIT © Microsoft | Маскот «Бөмбөлөг», «Бөмбий» |
| `assets/fluent/birthday-cake.png` | Fluent Emoji 3D 🎂 Birthday cake | https://github.com/microsoft/fluentui-emoji/blob/main/assets/Birthday%20cake/3D/birthday_cake_3d.png | MIT © Microsoft | Ой, төрсөн өдөр |
| `assets/fluent/ring.png` | Fluent Emoji 3D 💍 Ring | https://github.com/microsoft/fluentui-emoji/blob/main/assets/Ring/3D/ring_3d.png | MIT © Microsoft | Ой |
| `assets/fluent/airplane.png` | Fluent Emoji 3D ✈️ Airplane | https://github.com/microsoft/fluentui-emoji/blob/main/assets/Airplane/3D/airplane_3d.png | MIT © Microsoft | Аялал ангилал, алс зайн хэсэг |
| `assets/fluent/house.png` | Fluent Emoji 3D 🏡 House | https://github.com/microsoft/fluentui-emoji/blob/main/assets/House/3D/house_3d.png | MIT © Microsoft | Гэртээ ангилал |
| `assets/fluent/gift.png` | Fluent Emoji 3D 🎁 Wrapped gift | https://github.com/microsoft/fluentui-emoji/blob/main/assets/Wrapped%20gift/3D/wrapped_gift_3d.png | MIT © Microsoft | Бэлгийн санаа |
| `assets/fluent/cherry-blossom.png` | Fluent Emoji 3D 🌸 Cherry blossom | https://github.com/microsoft/fluentui-emoji/blob/main/assets/Cherry%20blossom/3D/cherry_blossom_3d.png | MIT © Microsoft | Хоосон төлөв, onboarding |
| `assets/fluent/fork-knife-plate.png` | Fluent Emoji 3D 🍽️ Fork and knife with plate | https://github.com/microsoft/fluentui-emoji/blob/main/assets/Fork%20and%20knife%20with%20plate/3D/fork_and_knife_with_plate_3d.png | MIT © Microsoft | Хоол ангилал |
| `assets/fluent/clapper-board.png` | Fluent Emoji 3D 🎬 Clapper board | https://github.com/microsoft/fluentui-emoji/blob/main/assets/Clapper%20board/3D/clapper_board_3d.png | MIT © Microsoft | Соёл ангилал, wishlist кино |
| `assets/fluent/books.png` | Fluent Emoji 3D 📚 Books | https://github.com/microsoft/fluentui-emoji/blob/main/assets/Books/3D/books_3d.png | MIT © Microsoft | Wishlist ном |
| `assets/fluent/mountain.png` | Fluent Emoji 3D 🏔️ Snow-capped mountain | https://github.com/microsoft/fluentui-emoji/blob/main/assets/Snow-capped%20mountain/3D/snow-capped_mountain_3d.png | MIT © Microsoft | Гадаа ангилал |
| `assets/fluent/moon.png` | Fluent Emoji 3D 🌙 Crescent moon | https://github.com/microsoft/fluentui-emoji/blob/main/assets/Crescent%20moon/3D/crescent_moon_3d.png | MIT © Microsoft | Оройн мэндчилгээ, «Түр тайван байх» (Noto 🌙 animated байхгүй) |
| `assets/fluent/sun.png` | Fluent Emoji 3D ☀️ Sun | https://github.com/microsoft/fluentui-emoji/blob/main/assets/Sun/3D/sun_3d.png | MIT © Microsoft | Өглөөний мэндчилгээ (Noto ☀️ animated байхгүй) |
| `assets/sounds/heart.wav` | Зүрхний «lub-dub» | `mobile/scripts/generate-sounds.mjs` | Өөрийн бүтээсэн (CC0) | ANIM-01, тэврэлт (FR-19.7) |
| `assets/sounds/chime.wav` | Зөөлөн хонх | `mobile/scripts/generate-sounds.mjs` | Өөрийн бүтээсэн (CC0) | ANIM-02, ANIM-19 |
| `assets/sounds/pop.wav` | Богино «поп» | `mobile/scripts/generate-sounds.mjs` | Өөрийн бүтээсэн (CC0) | Сонголт, реакц |
| `assets/sounds/success.wav` | Өсөх гурван нот | `mobile/scripts/generate-sounds.mjs` | Өөрийн бүтээсэн (CC0) | Баярын мөчүүд |
| `assets/images/icon.png` | Апп-ын түр дүрс | create-expo-app SDK 58 template | MIT © 650 Industries | Апп-ын дүрс (T-88-д Aura дүрсээр солигдоно) |
| `assets/images/android-icon-background.png` | Android adaptive icon (дэвсгэр) | create-expo-app SDK 58 template | MIT © 650 Industries | Android дүрс (T-88-д солигдоно) |
| `assets/images/android-icon-foreground.png` | Android adaptive icon (урд) | create-expo-app SDK 58 template | MIT © 650 Industries | Android дүрс (T-88-д солигдоно) |
| `assets/images/android-icon-monochrome.png` | Android adaptive icon (нэг өнгө) | create-expo-app SDK 58 template | MIT © 650 Industries | Android дүрс (T-88-д солигдоно) |
| `assets/images/favicon.png` | Favicon | create-expo-app SDK 58 template | MIT © 650 Industries | Вэб (T-82-т солигдоно) |
| `assets/images/splash-icon.png` | Splash дүрс | create-expo-app SDK 58 template | MIT © 650 Industries | Splash (T-88-д солигдоно) |
| `assets/expo.icon/icon.json` | iOS icon composer тохиргоо | create-expo-app SDK 58 template | MIT © 650 Industries | iOS дүрс (T-88-д солигдоно) |
| `assets/expo.icon/Assets/expo-symbol 2.svg` | iOS icon давхарга | create-expo-app SDK 58 template | MIT © 650 Industries | iOS дүрс (T-88-д солигдоно) |
| `assets/expo.icon/Assets/grid.png` | iOS icon давхарга | create-expo-app SDK 58 template | MIT © 650 Industries | iOS дүрс (T-88-д солигдоно) |

## Фонт ба нээлттэй эхийн сан

| Нэр | Эх URL | Лиценз | Хаана |
|---|---|---|---|
| Playfair Display (`@expo-google-fonts/playfair-display`) | https://fonts.google.com/specimen/Playfair+Display | SIL OFL 1.1 | Гарчиг, тоолуур, ишлэл |
| Nunito (`@expo-google-fonts/nunito`) | https://fonts.google.com/specimen/Nunito | SIL OFL 1.1 | Бие, товч, шошго |
| Nunito 400/700, Playfair Display 400/400 italic TTF (`backend/src/main/resources/fonts/`, дээрх багцаас хуулсан) | https://fonts.google.com/specimen/Nunito · https://fonts.google.com/specimen/Playfair+Display | SIL OFL 1.1 | Серверийн PDF ном (DD-AURA-024, T-42) |
| Lucide (`lucide-react-native`) | https://lucide.dev | ISC | Дүрс |
| Lottie (`lottie-react-native`, `@lottiefiles/dotlottie-react`) | https://github.com/lottie-react-native/lottie-react-native · https://github.com/LottieFiles/dotlottie-web | Apache-2.0 · MIT | Lottie тоглуулагч |
| React Native Reanimated, Gesture Handler, SVG | https://github.com/software-mansion | MIT | Хөдөлгөөн, бөөм |
| Expo SDK 58 | https://github.com/expo/expo | MIT | Апп-ын суурь |
| TanStack Query, Zustand, i18next | https://tanstack.com · https://github.com/pmndrs/zustand · https://www.i18next.com | MIT | Төлөв, орчуулга |
| Leaflet (`leaflet`) | https://leafletjs.com | BSD-2-Clause | Газрын зураг (S-70) |

## Газрын зураг ба цаг агаарын өгөгдөл

| Нэр | Эх URL | Лиценз | Хаана |
|---|---|---|---|
| © OpenStreetMap contributors | https://www.openstreetmap.org/copyright | ODbL 1.0 | Газрын зургийн tile, газрын нэр (S-70, S-32) |
| Open-Meteo | https://open-meteo.com | CC BY 4.0 | Цаг агаар ба урьдчилсан мэдээ (S-20, S-54) |

S-89 «Лиценз ба талархал» нь `mobile/src/content/licenses.json`-оос харагдана. Энэ файлыг өөрчилсний
дараа `node mobile/scripts/generate-licenses.cjs` ажиллуулна (`licenses.test.ts` зөрүүг барина).
