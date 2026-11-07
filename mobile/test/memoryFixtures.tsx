import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import type { MediaRef, Memory, MemorySummary } from '@/api/queries/memories';
import { ThemeProvider } from '@/theme/ThemeProvider';

/** Дурсамжийн дэлгэцийн тестийн нийтлэг өгөгдөл ба туслах (T-38…T-42). */
export const ME = { id: 'u-bat', displayName: 'Бат', avatar: null };
export const PARTNER = { id: 'u-anu', displayName: 'Ану', avatar: null };

export function media(id: string, overrides: Partial<MediaRef> = {}): MediaRef {
  return {
    id,
    kind: 'IMAGE',
    status: 'READY',
    mime: 'image/jpeg',
    sizeBytes: 1000,
    width: 1600,
    height: 1200,
    blurhash: 'LEHV6nWB2yk8pyo0adR*.7kCMdnj',
    urls: { original: `https://s3.test/${id}`, sm: `https://s3.test/${id}-sm`, md: `https://s3.test/${id}-md`, lg: `https://s3.test/${id}-lg` },
    urlsExpireAt: '2026-11-07T13:00:00Z',
    ...overrides,
  };
}

export function summary(id: string, overrides: Partial<MemorySummary> = {}): MemorySummary {
  return {
    id,
    title: `Дурсамж ${id}`,
    occurredOn: '2026-11-03',
    visibility: 'SHARED',
    status: 'READY',
    cover: media(`${id}-cover`),
    mediaCount: 1,
    location: null,
    author: ME,
    commentCount: 0,
    favorite: false,
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

export function memory(id: string, overrides: Partial<Memory> = {}): Memory {
  return {
    ...summary(id),
    description: 'Нуурын эрэг дээр',
    dateSource: 'MANUAL',
    locationSource: 'NONE',
    media: [{ media: media(`${id}-m1`), altText: 'Нуур', position: 0 }],
    tags: ['аялал'],
    groups: [],
    perspectives: [],
    comments: [],
    reactions: [],
    myFavorite: false,
    datePlan: null,
    version: 3,
    ...overrides,
  };
}

export const ok = (data: unknown, status = 200) => ({
  data,
  error: undefined,
  response: new Response(status === 204 ? null : JSON.stringify(data ?? {}), { status }),
});

export const fail = (status: number, code: string, details?: Record<string, unknown>) => ({
  data: undefined,
  error: { code, message: code, traceId: 't', ...(details ? { details } : {}) },
  response: new Response('{}', { status }),
});

export async function renderWithClient(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
  const wrap = (node: ReactElement) => (
    <QueryClientProvider client={client}>
      <ThemeProvider>{node}</ThemeProvider>
    </QueryClientProvider>
  );
  const result = await render(wrap(ui));
  return { ...result, client, rerender: (node: ReactElement) => result.rerender(wrap(node)) };
}
