import { resolveBuildInfo } from '@/platform/buildInfo';

describe('S-91 build мэдээлэл (AC-190)', () => {
  it('EXPO_PUBLIC_* — semver, build, commit SHA', () => {
    expect(
      resolveBuildInfo({ env: { EXPO_PUBLIC_APP_VERSION: '1.2.0', EXPO_PUBLIC_BUILD: '142', EXPO_PUBLIC_COMMIT_SHA: '830fbfe' }, appVersion: '1.0.0' }),
    ).toEqual({ version: '1.2.0', build: '142', commit: '830fbfe' });
  });

  it('хоосон утга (prod-ийн `${VAR:-}`) бол app.json-ийн хувилбар, dev, local', () => {
    expect(resolveBuildInfo({ env: { EXPO_PUBLIC_APP_VERSION: '', EXPO_PUBLIC_BUILD: ' ', EXPO_PUBLIC_COMMIT_SHA: '' }, appVersion: '1.0.3' })).toEqual({
      version: '1.0.3',
      build: 'dev',
      commit: 'local',
    });
    expect(resolveBuildInfo({ env: {} })).toEqual({ version: '1.0.0', build: 'dev', commit: 'local' });
  });
});
