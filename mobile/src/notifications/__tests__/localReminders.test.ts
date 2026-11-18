import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { api } from '@/api/client';
import { HORIZON_MS, identifierOf, MAX_LOCAL, planLocalReminders, type Reminder, syncLocalReminders } from '@/notifications/localReminders';

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(async () => ({ granted: true })),
  getAllScheduledNotificationsAsync: jest.fn(async () => []),
  cancelScheduledNotificationAsync: jest.fn(async () => {}),
  scheduleNotificationAsync: jest.fn(async () => 'id'),
  SchedulableTriggerInputTypes: { DATE: 'date' },
}));
jest.mock('@/auth/tokenStore', () => ({
  usesCookieRefresh: false,
  getRefreshToken: jest.fn(async () => null),
  setRefreshToken: jest.fn(async () => {}),
  clearRefreshToken: jest.fn(async () => {}),
}));

const NOW = Date.parse('2026-11-07T04:00:00Z');
const rem = (id: string, fireAt: string, overrides: Partial<Reminder> = {}): Reminder =>
  ({ id, sourceType: 'DATE_PLAN', sourceId: 'p1', fireAt, title: 'Болзоо 1 цагийн дараа', deepLink: '/plans/p1', ...overrides }) as Reminder;

describe('AC-35 AC-104 локал сануулгын тааруулга', () => {
  it('шинийг товлож, цуцлагдсаныг цуцална; бусад апп-ын товлолтод хүрэхгүй', () => {
    const keep = rem('r1', '2026-11-08T03:00:00Z');
    const plan = planLocalReminders(
      [{ identifier: identifierOf(keep), fireAt: null }, { identifier: 'aura-rem-gone-1', fireAt: null }, { identifier: 'other-lib', fireAt: null }],
      [keep, rem('r2', '2026-11-09T03:00:00Z')],
      NOW,
    );
    expect(plan.cancel).toEqual(['aura-rem-gone-1']);
    expect(plan.schedule.map((r) => r.id)).toEqual(['r2']);
  });

  it('болзооны цаг өөрчлөгдвөл хуучныг цуцалж шинийг товлоно', () => {
    const old = rem('r1', '2026-11-08T03:00:00Z');
    const moved = rem('r1', '2026-11-08T05:00:00Z');
    const plan = planLocalReminders([{ identifier: identifierOf(old), fireAt: null }], [moved], NOW);
    expect(plan.cancel).toEqual([identifierOf(old)]);
    expect(plan.schedule).toEqual([moved]);
  });

  it('өнгөрсөн, 30 хоногоос хол, 60-аас хэтэрснийг товлохгүй', () => {
    const many = Array.from({ length: 70 }, (_, i) => rem(`m${i}`, new Date(NOW + (i + 1) * 3600_000).toISOString()));
    const plan = planLocalReminders([], [rem('past', '2026-11-06T00:00:00Z'), rem('far', new Date(NOW + HORIZON_MS + 1).toISOString()), ...many], NOW);
    expect(plan.schedule).toHaveLength(MAX_LOCAL);
    expect(plan.schedule.some((r) => r.id === 'past' || r.id === 'far')).toBe(false);
    expect(plan.schedule[0].id).toBe('m0');
  });

  it('native-д GET /reminders → scheduleNotificationAsync (deepLink, төрөл data-д)', async () => {
    Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true });
    const spy = jest.spyOn(api, 'GET').mockImplementation((async () => ({
      data: [rem('r9', '2026-11-08T03:00:00Z', { sourceType: 'ANNIVERSARY', deepLink: '/occasions/a1' })],
      error: undefined,
      response: new Response('[]', { status: 200 }),
    })) as never);
    expect(await syncLocalReminders(NOW)).toEqual({ cancelled: 0, scheduled: 1 });
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({ data: { type: 'ANNIVERSARY_REMINDER', deepLink: '/occasions/a1' } }),
        trigger: { type: 'date', date: new Date('2026-11-08T03:00:00Z') },
      }),
    );
    spy.mockRestore();
  });

  it('зөвшөөрөлгүй бол юу ч товлохгүй (S-101 л асууна)', async () => {
    Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValueOnce({ granted: false });
    expect(await syncLocalReminders(NOW)).toBeNull();
  });
});
