import { QueryClient } from '@tanstack/react-query';

import { onFirstConnect } from '../eventRouter';

describe('onFirstConnect (AC-123)', () => {
  it('persist-ээс сэргээсэн (сессээс өмнөх) query-г л хүчингүй болгоно', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000 } } });
    const sessionStartedAt = 1_000_000;
    qc.setQueryData(['dashboard'], { quiet: true }, { updatedAt: sessionStartedAt - 5_000 });
    qc.setQueryData(['chat'], { items: [] }, { updatedAt: sessionStartedAt + 10 });

    onFirstConnect(qc, sessionStartedAt);

    expect(qc.getQueryState(['dashboard'])?.isInvalidated).toBe(true);
    expect(qc.getQueryState(['chat'])?.isInvalidated).toBe(false);
    qc.clear();
  });
});
