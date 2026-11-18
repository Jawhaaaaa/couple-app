/**
 * Мэдэгдэл товшиход нээх дэлгэц (FR-13.1, AC-50, AC-120): серверийн `deepLink`-ийг апп-ын route руу
 * буулгана (`/letters/{id}` → S-67 г.м.), `deepLink` алга/танигдахгүй бол төрлөөр нь. Зөвхөн апп доторх
 * зам (`/…`) — гадаад URL, `//host` хэзээ ч нээгдэхгүй.
 */

const REWRITES: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/^\/letters\/([\w-]+)$/, (m) => `/together/letters/${m[1]}`],
  [/^\/letters\/?$/, () => '/together/letters'],
  [/^\/capsules\/([\w-]+)$/, (m) => `/together/capsules/${m[1]}`],
  [/^\/occasions\/(.+)$/, (m) => `/together/occasions/${m[1]}`],
  [/^\/goals\/([\w-]+)$/, (m) => `/together/goals/${m[1]}`],
  [/^\/lists(\?.*)?$/, (m) => `/together/lists${m[1] ?? ''}`],
  [/^\/checkin$/, () => '/together/checkin'],
];

/** `deepLink`-гүй (эсвэл хуучин хувилбарын) мэдэгдлийн анхдагч дэлгэц. */
export const TYPE_ROUTES: Record<string, string> = {
  MESSAGE_NEW: '/chat',
  SCREENSHOT_TAKEN: '/chat',
  PROMISE_PROPOSED: '/chat/promise',
  MEMORY_CREATED: '/memories',
  MEMORY_COMMENT: '/memories',
  HEART_RECEIVED: '/home',
  HUG_RECEIVED: '/home',
  THINKING_OF_YOU: '/home',
  QUESTION_PARTNER_ANSWERED: '/home/question',
  DATE_PROPOSED: '/plans',
  DATE_RESPONDED: '/plans',
  DATE_REMINDER: '/plans',
  ANNIVERSARY_REMINDER: '/together/occasions',
  LETTER_DELIVERED: '/together/letters',
  CAPSULE_OPENED: '/together/letters',
  INVITE_USED: '/join-confirm',
  PAIRING_CANCELLED: '/home',
  THEME_PROPOSED: '/settings/couple',
  THEME_DECLINED: '/settings/couple',
  EXPORT_READY: '/settings/data',
  BREAKUP_STARTED: '/settings/breakup',
  STORAGE_WARNING: '/storage-full',
  QUIET_MODE_ON: '/home',
  INACTIVITY_NUDGE: '/home',
  GREETING_MORNING: '/home',
  GREETING_EVENING: '/home',
};

export function isInAppPath(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && !/[\s\\]/.test(value);
}

export function routeForNotification(n: { type?: string | null; deepLink?: string | null }): string {
  if (isInAppPath(n.deepLink)) {
    for (const [re, to] of REWRITES) {
      const m = n.deepLink.match(re);
      if (m) return to(m);
    }
    return n.deepLink;
  }
  return (n.type && TYPE_ROUTES[n.type]) || '/notifications';
}
