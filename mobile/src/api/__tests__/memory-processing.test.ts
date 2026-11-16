import { hasProcessingMedia, type Memory } from '@/api/queries/memories';

const item = (status: Memory['media'][number]['media']['status']) =>
  ({ media: { id: status, kind: 'VIDEO', status, mime: 'video/mp4', sizeBytes: 1, urls: { original: 'https://s3.test/v' }, urlsExpireAt: '' } }) as Memory['media'][number];

describe('AC-24 S-31 видео хөрвүүлэлт дуустал дахин татна', () => {
  it('PENDING/PROCESSING медиа байвал true', () => {
    expect(hasProcessingMedia({ media: [item('READY'), item('PROCESSING')] })).toBe(true);
    expect(hasProcessingMedia({ media: [item('PENDING')] })).toBe(true);
  });

  it('бүгд READY/FAILED эсвэл өгөгдөлгүй бол false (давтан татахгүй)', () => {
    expect(hasProcessingMedia({ media: [item('READY'), item('FAILED')] })).toBe(false);
    expect(hasProcessingMedia({ media: [] })).toBe(false);
    expect(hasProcessingMedia(undefined)).toBe(false);
  });
});
