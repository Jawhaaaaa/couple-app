import { needsLogin } from '../gate';

/** AC-56, AC-125: алсаас гаргасан төхөөрөмж хамгаалагдсан route дээр дахин ачаалахад S-03 руу. */
describe('needsLogin', () => {
  it('сессгүй үед хамгаалагдсан route → нэвтрэх', () => {
    expect(needsLogin(false, ['(setup)', 'waiting'])).toBe(true);
    expect(needsLogin(false, ['(tabs)', 'home'])).toBe(true);
    expect(needsLogin(false, ['settings', 'security'])).toBe(true);
  });

  it('нэвтрэх, танилцуулга, хаалга, урилгын холбоос, суулгах заавар нь нээлттэй', () => {
    for (const s of [[], ['(auth)', 'login'], ['(onboarding)', 'intro'], ['i', '[code]'], ['install'], ['update-required']]) {
      expect(needsLogin(false, s)).toBe(false);
    }
  });

  it('сесстэй бол хэзээ ч шилжүүлэхгүй', () => {
    expect(needsLogin(true, ['(tabs)', 'home'])).toBe(false);
  });
});
