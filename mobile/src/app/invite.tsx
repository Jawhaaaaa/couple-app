import { Redirect } from 'expo-router';

/**
 * Мэдэгдлийн холбоос `/invite` (`PAIRING_CANCELLED` — backend `CoupleService`) → S-13,
 * тэнд урилгын төлөв ба шинэ урилга үүсгэх боломж бий.
 */
export default function InviteRedirect() {
  return <Redirect href="/waiting" />;
}
