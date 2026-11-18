import Constants from 'expo-constants';

export interface BuildInfo {
  /** Semver (`1.2.0`). */
  version: string;
  /** Build дугаар (`142`; локалд `dev`). */
  build: string;
  /** Build хийсэн commit (`830fbfe`; локалд `local`). */
  commit: string;
}

interface Sources {
  env: Record<string, string | undefined>;
  appVersion?: string | null;
}

const nonEmpty = (v: string | null | undefined): string | null => (v && v.trim() ? v.trim() : null);

/**
 * S-91 «Тухай»-гийн хувилбарын мэдээлэл (FR-18.7, AC-190): build үеийн `EXPO_PUBLIC_APP_VERSION`,
 * `EXPO_PUBLIC_BUILD`, `EXPO_PUBLIC_COMMIT_SHA` (deploy-ийн `AURA_COMMIT_SHA` — бодит SHA); хувилбар хоосон
 * бол `app.json`-ийнх руу унана.
 */
export function resolveBuildInfo({ env, appVersion }: Sources): BuildInfo {
  return {
    version: nonEmpty(env.EXPO_PUBLIC_APP_VERSION) ?? nonEmpty(appVersion) ?? '1.0.0',
    build: nonEmpty(env.EXPO_PUBLIC_BUILD) ?? 'dev',
    commit: nonEmpty(env.EXPO_PUBLIC_COMMIT_SHA) ?? 'local',
  };
}

/** Энэ build-ийн мэдээлэл. `process.env.EXPO_PUBLIC_*`-г Metro build үед шууд орлуулдаг тул нэр бүрээр нь уншина. */
export function buildInfo(): BuildInfo {
  return resolveBuildInfo({
    env: {
      EXPO_PUBLIC_APP_VERSION: process.env.EXPO_PUBLIC_APP_VERSION,
      EXPO_PUBLIC_BUILD: process.env.EXPO_PUBLIC_BUILD,
      EXPO_PUBLIC_COMMIT_SHA: process.env.EXPO_PUBLIC_COMMIT_SHA,
    },
    appVersion: Constants.expoConfig?.version,
  });
}
