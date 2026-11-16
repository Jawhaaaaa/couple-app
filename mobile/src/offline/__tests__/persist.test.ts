import { QueryClient } from '@tanstack/react-query';

import { refreshRestoredQueries, shouldPersistQuery } from '../persist';

describe('AC-156 кэшээс нээх — persist хийх query', () => {
  it('нүүр, чат, дурсамж г.м. persist; session, урилга үгүй', () => {
    expect(shouldPersistQuery(['dashboard'])).toBe(true);
    expect(shouldPersistQuery(['messages'])).toBe(true);
    expect(shouldPersistQuery(['memories', { scope: 'all' }])).toBe(true);
    expect(shouldPersistQuery(['sessions'])).toBe(false);
    expect(shouldPersistQuery(['invite'])).toBe(false);
  });
});

describe('AC-123, AC-18 — persist-ээс сэргээсний дараа', () => {
  it('сэргээсэн query бүр хүчингүй (staleTime-ийн дотор ч дахин татагдана), өгөгдөл харагдсан хэвээр', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000 } } });
    client.setQueryData(['dashboard'], { partner: { quietUntil: '2026-11-17T00:00:00Z' } });
    client.setQueryData(['messages', 'list'], { items: [] });
    await refreshRestoredQueries(client);
    expect(client.getQueryState(['dashboard'])?.isInvalidated).toBe(true);
    expect(client.getQueryState(['messages', 'list'])?.isInvalidated).toBe(true);
    expect(client.getQueryData(['dashboard'])).toEqual({ partner: { quietUntil: '2026-11-17T00:00:00Z' } });
    client.clear();
  });
});
