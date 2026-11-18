import type { ReactionEmoji, ReactionSummary } from '@/api/queries/memories';

/** Дурсамжийн 6 реакц (FR-5.4, ANIM-07) — гэрээний `ReactionEmoji`-ийн дарааллаар. */
export const REACTIONS: readonly ReactionEmoji[] = ['LOVE', 'ADORE', 'HEART_EYES', 'KISS', 'HUG', 'SPARKLE'];

export const REACTION_GLYPH: Record<ReactionEmoji, string> = {
  LOVE: '❤️',
  ADORE: '🥰',
  HEART_EYES: '😍',
  KISS: '😘',
  HUG: '🤗',
  SPARKLE: '✨',
};

/** Товшилт: реакцгүй бол ❤️, байгаа бол болиулна. Сонголт: ижлийг дахин сонговол болиулна. */
export function nextReaction(mine: ReactionEmoji | null, picked: ReactionEmoji | 'TOGGLE'): ReactionEmoji | null {
  if (picked === 'TOGGLE') return mine ? null : 'LOVE';
  return mine === picked ? null : picked;
}

export function myReaction(reactions: ReactionSummary[]): ReactionEmoji | null {
  return reactions.find((r) => r.mine)?.emoji ?? null;
}

/** Optimistic: миний реакцийг солиход тоолуурыг засна. */
export function applyReaction(reactions: ReactionSummary[], userId: string, next: ReactionEmoji | null): ReactionSummary[] {
  const stripped = reactions
    .map((r) => (r.mine ? { ...r, mine: false, count: r.count - 1, userIds: r.userIds.filter((u) => u !== userId) } : r))
    .filter((r) => r.count > 0);
  if (!next) return stripped;
  const existing = stripped.find((r) => r.emoji === next);
  if (existing) return stripped.map((r) => (r.emoji === next ? { ...r, mine: true, count: r.count + 1, userIds: [...r.userIds, userId] } : r));
  return [...stripped, { emoji: next, count: 1, userIds: [userId], mine: true }];
}
