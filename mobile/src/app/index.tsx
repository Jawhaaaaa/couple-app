import { Redirect } from 'expo-router';

import { useBootstrap } from '@/api/queries/bootstrap';
import { resolveGate } from '@/auth/gate';
import { useOnboardingStore } from '@/stores/onboardingStore';

/**
 * Эхлэлийн хаалга (spec §6.1): анх суулгасан, танилцуулга үзээгүй → S-02 (нэг л удаа, AC-133);
 * сессгүй → S-03; имэйл баталгаажаагүй → S-05; бодлогын шинэ хувилбар → S-90 хаалга; хосгүй → S-13;
 * хостой → нүүр. Танилцуулгын туг AsyncStorage-аас сэргэж дуустал шийдэхгүй.
 */
export default function Index() {
  const { status, signedIn, me } = useBootstrap();
  const introSeen = useOnboardingStore((s) => s.introSeen);
  const hydrated = useOnboardingStore((s) => s.hydrated);
  if (status === 'pending' || !hydrated) return null;
  return <Redirect href={resolveGate({ signedIn, me, introSeen })} />;
}
