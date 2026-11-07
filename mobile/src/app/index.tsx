import { Redirect } from 'expo-router';

/** Эхлэлийн хаалга — нэвтрэлт/хосын төлөвийн шалгалт T-21-д нэмэгдэнэ. */
export default function Index() {
  return <Redirect href="/home" />;
}
