import { extractInviteCode, INVITE_ALPHABET, INVITE_CODE_RE, inviteRemaining, normalizeInviteCode } from '../inviteCode';
import { startDateIssue, startDateView } from '../startDate';

describe('AC-169 урилгын кодын хэвийн болгол', () => {
  it('AC-169 цагаан толгойд 0, O, 1, I байхгүй', () => {
    for (const ch of ['0', 'O', '1', 'I']) expect(INVITE_ALPHABET).not.toContain(ch);
    expect(INVITE_ALPHABET).toHaveLength(32);
  });

  it('AC-169 жижиг үсэг, угтваргүй, зураасгүй, хоосон зайтай кодыг AURA-XXXX болгоно', () => {
    expect(normalizeInviteCode('AURA-7K3M')).toBe('AURA-7K3M');
    expect(normalizeInviteCode('aura-7k3m')).toBe('AURA-7K3M');
    expect(normalizeInviteCode('7k3m')).toBe('AURA-7K3M');
    expect(normalizeInviteCode('AURA7K3M')).toBe('AURA-7K3M');
    expect(normalizeInviteCode(' aura 7k3m ')).toBe('AURA-7K3M');
    expect(normalizeInviteCode('7K-3M')).toBe('AURA-7K3M');
  });

  it('AC-169 0/O/1/I агуулсан, урт буруу, өөр угтвартай кодыг татгалзана', () => {
    expect(normalizeInviteCode('AURA-0K3M')).toBeNull();
    expect(normalizeInviteCode('AURA-OK3M')).toBeNull();
    expect(normalizeInviteCode('AURA-1K3M')).toBeNull();
    expect(normalizeInviteCode('AURA-IK3M')).toBeNull();
    expect(normalizeInviteCode('7K3')).toBeNull();
    expect(normalizeInviteCode('7K3MX')).toBeNull();
    expect(normalizeInviteCode('LOVE-7K3M')).toBeNull();
    expect(normalizeInviteCode('')).toBeNull();
  });

  it('AC-169 үр дүн нь гэрээний pattern-д таарна', () => {
    for (const raw of ['7k3m', 'aura2345', 'zzzz']) {
      const code = normalizeInviteCode(raw);
      expect(code).not.toBeNull();
      expect(INVITE_CODE_RE.test(code ?? '')).toBe(true);
    }
  });

  it('AC-12 QR/холбоосоос кодыг гаргана', () => {
    expect(extractInviteCode('https://aura.example.mn/i/AURA-7K3M')).toBe('AURA-7K3M');
    expect(extractInviteCode('https://aura.example.mn/i/aura-7k3m?utm=x')).toBe('AURA-7K3M');
    expect(extractInviteCode('aura://i/AURA-7K3M')).toBe('AURA-7K3M');
    expect(extractInviteCode('AURA-7K3M')).toBe('AURA-7K3M');
    expect(extractInviteCode('https://example.com/hello')).toBeNull();
  });

  it('AC-169 7 хоногийн хүчинтэй хугацааны тоолуур', () => {
    const now = new Date('2026-11-07T12:00:00Z');
    expect(inviteRemaining('2026-11-14T12:00:00Z', now)).toEqual({ days: 7, hours: 0, minutes: 0 });
    expect(inviteRemaining('2026-11-08T15:30:00Z', now)).toEqual({ days: 1, hours: 3, minutes: 30 });
    expect(inviteRemaining('2026-11-07T11:59:00Z', now)).toBeNull();
    expect(inviteRemaining('not-a-date', now)).toBeNull();
  });
});

describe('AC-65 эхэлсэн өдөр', () => {
  const base = { startDate: null, startDateStatus: 'PENDING' as const, myProposal: null, partnerProposal: null };

  it('AC-65 хоёр өөр санал → зөрүү, хоёр огноо', () => {
    expect(startDateView({ ...base, startDateStatus: 'MISMATCH', myProposal: '2024-10-24', partnerProposal: '2024-10-25' })).toEqual({
      kind: 'mismatch',
      mine: '2024-10-24',
      partner: '2024-10-25',
    });
  });

  it('AC-65 нэг талын санал ба батлагдсан төлөв', () => {
    expect(startDateView({ ...base, myProposal: '2024-10-24' })).toEqual({ kind: 'waitingPartner', mine: '2024-10-24' });
    expect(startDateView({ ...base, partnerProposal: '2024-10-25' })).toEqual({ kind: 'partnerProposed', partner: '2024-10-25' });
    expect(startDateView({ ...base, startDateStatus: 'CONFIRMED', startDate: '2024-10-24' })).toEqual({ kind: 'confirmed', date: '2024-10-24' });
    expect(startDateView(base)).toEqual({ kind: 'none' });
  });

  it('AC-65 ирээдүйн огноо хориотой', () => {
    expect(startDateIssue('2026-11-08', '2026-11-07')).toBe('future');
    expect(startDateIssue('2026-11-07', '2026-11-07')).toBeNull();
    expect(startDateIssue('2024-02-30', '2026-11-07')).toBe('invalid');
    expect(startDateIssue(null, '2026-11-07')).toBe('incomplete');
  });
});
