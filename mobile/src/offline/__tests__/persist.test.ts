import { shouldPersistQuery } from '../persist';

describe('AC-156 кэшээс нээх — persist хийх query', () => {
  it('нүүр, чат, дурсамж г.м. persist; session, урилга үгүй', () => {
    expect(shouldPersistQuery(['dashboard'])).toBe(true);
    expect(shouldPersistQuery(['messages'])).toBe(true);
    expect(shouldPersistQuery(['memories', { scope: 'all' }])).toBe(true);
    expect(shouldPersistQuery(['sessions'])).toBe(false);
    expect(shouldPersistQuery(['invite'])).toBe(false);
  });
});
