/**
 * Урилгын код (FR-2.1, AC-169): `AURA-` угтвар + 4 тэмдэгт, `0`, `O`, `1`, `I`-гүй.
 * Гэрээний pattern: `^AURA-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$`.
 */
export const INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const INVITE_PREFIX = 'AURA';
export const INVITE_CODE_RE = /^AURA-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/;
const BODY_RE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/;

/**
 * Гараар оруулсан кодыг гэрээний хэлбэрт оруулна: том үсэг, хоосон зай/зураасгүй,
 * `AURA` угтваргүй ч хүлээн авна (`7k3m`, `aura7k3m`, `AURA 7K3M` → `AURA-7K3M`).
 * Хүчингүй бол `null`.
 */
export function normalizeInviteCode(raw: string): string | null {
  const compact = raw.toUpperCase().replace(/[\s\-_.]/g, '');
  const body = compact.length === 8 && compact.startsWith(INVITE_PREFIX) ? compact.slice(4) : compact;
  return BODY_RE.test(body) ? `${INVITE_PREFIX}-${body}` : null;
}

/**
 * QR эсвэл холбоосоос код гаргана: `https://<host>/i/AURA-7K3M`, `aura://i/AURA-7K3M`,
 * эсвэл зөвхөн код. Олдохгүй бол `null`.
 */
export function extractInviteCode(scanned: string): string | null {
  const text = scanned.trim();
  const fromPath = /\/i\/([^/?#\s]+)/i.exec(text);
  if (fromPath) return normalizeInviteCode(decodeURIComponent(fromPath[1]));
  return normalizeInviteCode(text);
}

/**
 * Урилгын үлдсэн хугацаа (S-08-ийн тоолуур). Дууссан бол `null`.
 */
export function inviteRemaining(expiresAt: string, now: Date = new Date()): { days: number; hours: number; minutes: number } | null {
  const ms = Date.parse(expiresAt) - now.getTime();
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const totalMinutes = Math.floor(ms / 60_000);
  return {
    days: Math.floor(totalMinutes / (24 * 60)),
    hours: Math.floor((totalMinutes % (24 * 60)) / 60),
    minutes: totalMinutes % 60,
  };
}
