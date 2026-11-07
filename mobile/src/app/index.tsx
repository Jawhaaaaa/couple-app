import { Redirect } from 'expo-router';

import { useBootstrap } from '@/api/queries/bootstrap';
import { resolveGate } from '@/auth/gate';

/**
 * Эхлэлийн хаалга (spec §6.1): сессгүй → S-03; имэйл баталгаажаагүй → S-05;
 * бодлогын шинэ хувилбар → S-90 хаалга; хосгүй → S-13; хостой → нүүр.
 */
export default function Index() {
  const { status, signedIn, me } = useBootstrap();
  if (status === 'pending') return null;
  return <Redirect href={resolveGate({ signedIn, me })} />;
}
