/**
 * Нууц үгийн хүч (FR-1.1, AC-164). Дүрэм нь backend-ийн `PasswordPolicy`-тэй ижил:
 * ≥ 8 тэмдэгт (≤ 128), нийтлэг жагсаалтад байхгүй, имэйлтэйгээ (эсвэл `@`-ийн
 * өмнөх хэсэгтэй) ижил биш. Эцсийн шийдвэр серверийнх — энд хамгийн түгээмэл
 * жагсаалтын жижиг хэсэг л байгаа тул UI эрт анхааруулна.
 */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

/** Хамгийн түгээмэл/алдагдсан нууц үгс (backend `security/common-passwords.txt`-ийн эхний хэсэг). */
const COMMON = new Set([
  '12345678',
  '123456789',
  '1234567890',
  '11111111',
  '12341234',
  '11223344',
  'password',
  'password1',
  'password123',
  'passw0rd',
  'qwerty123',
  'qwertyuiop',
  'qwerty12',
  '1q2w3e4r',
  '1qaz2wsx',
  'iloveyou',
  'iloveyou1',
  'sunshine',
  'princess',
  'football',
  'baseball',
  'welcome1',
  'admin123',
  'abc12345',
  'abcd1234',
  'letmein1',
  'trustno1',
  'superman',
  'asdfghjkl',
  'zaq12wsx',
  'monkey123',
  'dragon123',
  'starwars',
  'whatever',
]);

export type PasswordIssue = 'tooShort' | 'tooLong' | 'common' | 'sameAsEmail';

export interface PasswordStrength {
  /** 0 (хоосон) … 4 (хүчтэй) — хэмжүүрийн дүүргэлт. */
  score: 0 | 1 | 2 | 3 | 4;
  /** Татгалзах шалтгаан (байхгүй бол серверт илгээж болно). */
  issue: PasswordIssue | null;
  acceptable: boolean;
}

export function isCommonPassword(password: string): boolean {
  return COMMON.has(password.toLowerCase());
}

/** Тэмдэгтийн тоог code point-оор (backend `codePointCount`-тэй ижил). */
function length(password: string): number {
  return Array.from(password).length;
}

export function passwordIssue(password: string, email?: string): PasswordIssue | null {
  const len = length(password);
  if (len < PASSWORD_MIN_LENGTH || !password.trim()) return 'tooShort';
  if (password.length > PASSWORD_MAX_LENGTH) return 'tooLong';
  if (isCommonPassword(password)) return 'common';
  if (email) {
    const lower = password.toLowerCase();
    const e = email.trim().toLowerCase();
    const at = e.indexOf('@');
    if (lower === e || (at > 0 && lower === e.slice(0, at))) return 'sameAsEmail';
  }
  return null;
}

export function passwordStrength(password: string, email?: string): PasswordStrength {
  if (!password) return { score: 0, issue: 'tooShort', acceptable: false };
  const issue = passwordIssue(password, email);
  if (issue) return { score: 1, issue, acceptable: false };
  const classes = [/[a-zа-яөүё]/u, /[A-ZА-ЯӨҮЁ]/u, /\d/, /[^\p{L}\d]/u].filter((re) => re.test(password)).length;
  const len = length(password);
  let score: 2 | 3 | 4 = 2;
  if (len >= 12 && classes >= 3) score = 4;
  else if (len >= 10 || classes >= 3) score = 3;
  return { score, issue: null, acceptable: true };
}
