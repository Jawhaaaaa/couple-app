<!-- LAB-2 · store review notes · Код + тест · 2026-11-14 -->
# Шалгагчид зориулсан тэмдэглэл ба маягтууд

## App Review / Play review-д өгөх тэмдэглэл (англиар илгээнэ)

> Aura connects exactly two accounts through a one-time invite code. To review, sign in with the two
> demo accounts on two devices (or one device plus the web app), create an invite on account A and
> enter the code on account B. All content is visible only to those two members.

Demo акаунтыг илгээх бүрд review серверт шинээр үүсгэж, нууц үгийг зөвхөн store-ийн маягтад бичнэ —
репод бичихгүй (`docs/RELEASE.md` → «Шалгагчийн акаунт»).

## Насны ангилал
- Хэрэглэгчийн үүсгэсэн агуулга: зөвхөн хоёр хүний хооронд, олон нийтэд нийтлэгдэхгүй.
- Чат: тийм (хоёр хүний хооронд). Байршил хуваалцах: тийм (хэрэглэгч сонговол).
- Зохицуулалт: хууль бус агуулгыг хэрэглэх нөхцөл хориглоно, админ акаунтыг түдгэлзүүлнэ (FR-14.8).

## Google Play — Data safety
| Өгөгдөл | Цуглуулах | Хуваалцах | Зорилго | Сонголттой |
|---|---|---|---|---|
| Имэйл, нэр | Тийм | Үгүй | Акаунт | Үгүй |
| Зураг, видео, дуу, файл | Тийм | Үгүй | Апп-ын үйлдэл | Тийм |
| Мессеж | Тийм | Үгүй | Апп-ын үйлдэл | Үгүй |
| Ойролцоо байршил (хот) | Тийм | Үгүй | Апп-ын үйлдэл | Тийм |
| Алдааны мэдээлэл | Тийм | Үгүй | Ажиглалт | Үгүй |

- Data is encrypted in transit: тийм (TLS).
- Хэрэглэгч өгөгдлөө устгуулах боломжтой: тийм (S-87 акаунт устгах, S-85 экспорт).
- Аналитик, зар сурталчилгааны SDK: байхгүй (NFR-06).

## App Store — Privacy nutrition label
«Data Linked to You»: Contact Info (email, name), User Content (photos, videos, audio, messages),
Location (coarse), Identifiers (user ID). «Data Used to Track You»: байхгүй.

## Зөвшөөрлүүд
Тайлбарын эх нь `mobile/locales/en.json` ба `mobile/locales/mn.json` (Info.plist / InfoPlist.strings):
камер, зургийн сан, зураг хадгалах, микрофон, байршил (ашиглах үед л), Face ID, календарь.
Android-д арын байршил ба бусад апп-ын дээр зурах зөвшөөрлийг `blockedPermissions`-ээр хасна.

## Шифрлэлтийн экспортын асуулт
`ITSAppUsesNonExemptEncryption = false`: апп зөвхөн үйлдлийн системийн стандарт HTTPS-ийг
ашигладаг тул чөлөөлөгдсөн ангилалд орно.
