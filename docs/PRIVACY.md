<!-- LAB-2 · policy · DEVELOPMENT · 2026-11-14 -->
<!-- GAP-05: энэ нь НООРОГ. Эцсийн хуулийн текстийг эзэмшигч баталтал хүчинтэй бодлого биш. -->
<!-- Бүтэц: «lang:mn» ба «lang:en» тэмдэг бүхий HTML тайлбараар хэл тусгаарлана — backend
     PolicyVersionService нь GET /policies/current?locale= хүсэлтэд тухайн хэсгийг буцаана. -->

<!-- lang:mn -->
# Aura — Нууцлалын бодлого

> **Ноорог (GAP-05).** Энэ текст хөгжүүлэлтийн шатны ноорог бөгөөд эцсийн хуулийн хянан
> баталгаажуулалт хийгдээгүй. Хувилбарын дугаар нь апп доторх «Бодлого ба нөхцөл» хэсэгт харагдана.

## 1. Хэнд зориулсан бэ

Aura нь хоёр хүний хувийн орон зай (хосын апп) юм. Апп-ыг зөвхөн **18 ба түүнээс дээш насны**
хүн ашиглана. Бүртгэлийн үед төрсөн огноог шалгадаг; 18 хүрээгүй бол бүртгэл үүсэхгүй.

## 2. Бид ямар мэдээлэл цуглуулдаг вэ

- **Акаунт:** имэйл, нууц үгийн hash (нууц үг өөрөө хадгалагдахгүй), нэр, дуудах нэр, төрсөн огноо,
  цагийн бүс, хэл, сонгосон хот, профайлын зураг. Google-ээр нэвтэрвэл Google-ийн акаунтын ID ба имэйл.
- **Хосын агуулга:** дурсамж, зураг, видео, дуу, чат, захидал, time capsule, төлөвлөгөө, жагсаалт,
  зорилго, ой, сэтгэл санааны check-in, зүрхний дохио, өдрийн асуулт.
- **Техникийн мэдээлэл:** төхөөрөмжийн нэр ба төрөл, нэвтрэх session-ий сүүлд ашигласан цаг, push
  мэдэгдлийн токен, нэвтрэх оролдлогыг хязгаарлах зорилгоор IP хаяг (богино хугацаагаар).
- **Нэгтгэсэн хэмжүүр:** өдрийн апп нээлтийн нийт тоо (хэрэглэгчийн ID-гүй), нэг асуулттай сэтгэл
  ханамжийн санал (1–5 оноо, алгасах боломжтой, 30 хоногт нэгээс илүүгүй).

Бид **зар сурталчилгаа, гуравдагч талын аналитик, tracker, төлбөрийн систем ашигладаггүй**. Таны
мэдээллийг худалдахгүй, түрээслэхгүй.

## 3. Хадгалалт ба хамгаалалт

- Апп ба сервер хоорондын бүх холболт **TLS (HTTPS)**-ээр дамжина.
- Өгөгдөл ба медиа нь үйлчилгээний серверийн дискэнд хадгалагдана; хостинг үйлчилгээ үзүүлэгчийн
  дискний түвшний шифрлэлт ашиглагдана.
- Агуулгыг төхөөрөмж дээр урьдчилан шифрлэдэггүй тул **сервер техникийн хувьд агуулгад хандах
  боломжтой**. Доорх 4-р хэсгийн дүрмээр л хандалт хийгдэнэ.
- Апп-ын PIN, хурууны хээ, царай танилт, passkey нь зөвхөн тухайн төхөөрөмж дээрх апп-ын түгжээ
  бөгөөд серверт хадгалагдсан өгөгдлийг шифрлэдэггүй.
- Байршуулсан зургийн EXIF metadata (GPS г.м.) дахин кодлох үед цэвэрлэгдэнэ.
- Өдөр бүрийн нөөц хуулбар 30 хоног хадгалагдаад автоматаар устна.

## 4. Хэн юу харж чадах вэ

### 4.1 Таны хамтрагч
Хосын орон зайд нэмсэн агуулгыг хоёулаа харна. Дараах нь хамтрагчид **харагдахгүй**: таны нууц
бэлгийн санааны жагсаалт, хүргэгдэх хугацаа нь болоогүй захидлын агуулга, хуваалцаагүй check-in,
хос болохоос өмнөх ганцаараа үеийн хувийн зүйл (хуваалцахаар сонгоогүй бол).

### 4.2 Үйлчилгээний админ (оператор)
- Админ эрх нь серверийн тохиргоонд нэрлэгдсэн цөөн имэйлд л олгогдоно.
- Админы хэрэгсэл нь зөвхөн **нэгтгэсэн тоо** (хос холбогдсон хувь, өдрийн дундаж идэвх, санал
  асуулгын нэгтгэл) харуулна — хувь хүний агуулга, нэр, ID агуулдаггүй.
- Админ таны дурсамж, мессеж, зураг зэрэг агуулгыг **ердийн байдлаар үзэхгүй**. Онцгой тохиолдолд л
  хандана: (а) Монгол Улсын хуулийн дагуу эрх бүхий байгууллагын хүсэлт; (б) хууль бус агуулга эсвэл
  хүчирхийллийн талаарх гомдлыг шалгах; (в) таны хүсэлтээр техникийн алдааг засах. Хандалт бүр
  хамгийн бага хэмжээнд, бүртгэлтэйгээр хийгдэнэ.
- Нөхцөл зөрчсөн акаунтыг админ түдгэлзүүлж болно; түдгэлзүүлэхэд бүх төхөөрөмжөөс гаргана.

### 4.3 Гуравдагч этгээд (үйлчилгээ үзүүлэгч)
Үйлчилгээг ажиллуулахад зайлшгүй хэрэгтэй хэмжээнд л дараах этгээдэд мэдээлэл дамжина:

| Үйлчилгээ | Юу дамжих вэ | Зорилго |
|---|---|---|
| Хостинг (cloud сервер) | Бүх өгөгдөл (сервер дээр) | Үйлчилгээг ажиллуулах |
| Имэйл илгээгч (SMTP) | Имэйл хаяг, баталгаажуулах код, мэдэгдлийн текст | Бүртгэл, нууц үг сэргээх, экспортын мэдэгдэл |
| Push үйлчилгээ (Expo, Google FCM, Apple APNs, браузерын Web Push) | Push токен, мэдэгдлийн богино текст | Мэдэгдэл хүргэх |
| Google (зөвхөн Google-ээр нэвтэрвэл) | Нэвтрэх хүсэлт | Нэвтрэлт |
| Open-Meteo | Хотын координат (таны нэр, ID-гүй) | Цаг агаар, хот хайх |
| Алдааны тайлан (Sentry, тохируулсан бол) | Алдааны техникийн мэдээлэл — агуулга, нууц үг, токенгүй | Алдаа засах |

Хуулиар шаардсанаас бусад тохиолдолд өөр этгээдэд мэдээлэл өгөхгүй.

## 5. Хадгалах хугацаа ба устгал

- **Хос тасалбал:** 14 хоног зөвхөн харах ба экспорт хийх боломжтой (хоёулаа зөвшөөрвөл сэргэнэ);
  дараа нь хосын бүх өгөгдөл ба файл бүрэн устна.
- **Акаунт устгавал:** таны хувийн өгөгдөл (профайл, нэвтрэх мэдээлэл, ганцаараа үеийн хувийн зүйл)
  шууд устна. Хамтрагч тань 30 хоногийн турш хосын өгөгдлийг экспортлох боломжтой; дараа нь хосын
  өгөгдөл устна.
- Хогийн саванд орсон дурсамж 30 хоногийн дараа бүрмөсөн устна.
- Экспортын ZIP файлын холбоос 7 хоног хүчинтэй.
- Устгасан өгөгдөл нөөц хуулбараас 30 хоногийн дотор алга болно.

## 6. Таны эрх

- Бүх өгөгдлөө ZIP (JSON + медиа + HTML) хэлбэрээр экспортлох.
- Профайлаа засах, акаунтаа устгах.
- Идэвхтэй төхөөрөмжүүдээ харах, алсаас гаргах, «Бүх төхөөрөмжөөс гарах».
- Мэдэгдлийн тохиргоогоо өөрчлөх, санал асуулгыг алгасах.

## 7. Өөрчлөлт

Бодлого шинэчлэгдэхэд хувилбарын дугаар өөрчлөгдөж, апп-ыг дараа нээхэд дахин зөвшөөрөл асууна.
Таны зөвшөөрсөн хувилбар ба огноо профайлд хадгалагдана.

## 8. Холбоо барих

Нууцлалын асуултаар: `privacy@aura.example.mn` (ноорог — эцсийн хаягийг GAP-05-аар тогтооно).

<!-- lang:en -->
# Aura — Privacy Policy

> **Draft (GAP-05).** This text is a development-stage draft and has not had a final legal review.
> The version number is shown in the app under "Policies & terms".

## 1. Who it is for

Aura is a private space for two people (a couples app). Only people **aged 18 or older** may use it.
Your birth date is checked at sign-up; no account is created for anyone under 18.

## 2. What we collect

- **Account:** email, a hash of your password (never the password itself), name, nickname, birth
  date, time zone, language, chosen city, profile photo. If you sign in with Google, your Google
  account ID and email.
- **Couple content:** memories, photos, videos, voice notes, chat, letters, time capsules, plans,
  lists, goals, anniversaries, mood check-ins, heart signals, daily questions.
- **Technical data:** device name and type, last-used time of each signed-in session, push
  notification tokens, and your IP address for a short time to rate-limit sign-in attempts.
- **Aggregate metrics:** the total number of app opens per day (without user IDs), and a one-question
  satisfaction survey (score 1–5, skippable, at most once every 30 days).

We **do not use advertising, third-party analytics, trackers or payment systems**. We never sell or
rent your data.

## 3. Storage and protection

- All traffic between the app and the server goes over **TLS (HTTPS)**.
- Data and media are stored on the service's server disks, using the hosting provider's disk-level
  encryption.
- Content is not encrypted on your device before upload, so **the server is technically able to
  access it**. Access only happens under the rules in section 4.
- The app PIN, fingerprint, face unlock and passkey only lock the app on that device; they do not
  encrypt the data stored on the server.
- EXIF metadata (such as GPS) is removed from uploaded photos when they are re-encoded.
- Daily backups are kept for 30 days and then deleted automatically.

## 4. Who can see what

### 4.1 Your partner
Both of you see the content added to your couple space. Your partner **cannot** see: your secret
gift-idea list, the content of letters whose delivery time has not arrived, check-ins you did not
share, or private items from before you paired (unless you choose to share them).

### 4.2 Service administrators (operator)
- Admin rights are granted only to a small number of emails named in the server configuration.
- Admin tools show **aggregate numbers only** (pairing success rate, average daily activity, survey
  summary) — no personal content, names or IDs.
- Administrators **do not routinely view** your memories, messages or photos. They access content
  only in exceptional cases: (a) a lawful request from a competent authority under Mongolian law;
  (b) investigating a report of illegal content or abuse; (c) fixing a technical problem at your
  request. Any access is kept to the minimum necessary and is logged.
- An administrator may suspend an account that breaks the Terms; suspension signs it out of every
  device.

### 4.3 Third parties (service providers)
Data is passed to the following parties only as far as needed to run the service:

| Service | What is shared | Purpose |
|---|---|---|
| Hosting (cloud server) | All data (on the server) | Running the service |
| Email delivery (SMTP) | Email address, verification codes, notification text | Sign-up, password reset, export notices |
| Push services (Expo, Google FCM, Apple APNs, browser Web Push) | Push token, short notification text | Delivering notifications |
| Google (only if you sign in with Google) | Sign-in request | Authentication |
| Open-Meteo | City coordinates (no name or ID) | Weather, city search |
| Error reporting (Sentry, if configured) | Technical error details — no content, passwords or tokens | Fixing bugs |

We do not give your data to anyone else unless the law requires it.

## 5. Retention and deletion

- **If you break up:** for 14 days the space is view-and-export only (it is restored if you both
  agree); after that all couple data and files are fully deleted.
- **If you delete your account:** your personal data (profile, sign-in data, private items from
  before pairing) is deleted immediately. Your partner can export the couple data for 30 days; then
  the couple data is deleted.
- Memories in the trash are permanently deleted after 30 days.
- Export ZIP links are valid for 7 days.
- Deleted data disappears from backups within 30 days.

## 6. Your rights

- Export all your data as a ZIP (JSON + media + HTML).
- Edit your profile and delete your account.
- See your active devices, sign one out remotely, or "Sign out of all devices".
- Change notification settings and skip the survey.

## 7. Changes

When this policy changes, its version number changes and the app asks for your consent again the next
time you open it. The version you accepted and the date are stored in your profile.

## 8. Contact

Privacy questions: `privacy@aura.example.mn` (draft — the final address will be set under GAP-05).
