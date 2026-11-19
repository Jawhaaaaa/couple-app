import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { useWideLayout } from '@/hooks/useWideLayout';

import { TopBar } from './TopBar';

interface Props {
  title: string;
  children: ReactNode;
  testID?: string;
  /** Табаас гадуурх дэлгэц (S-24, S-80): доод цэс харагдахгүй тул «Буцах» товч (түүхгүй бол Нүүр рүү). */
  back?: boolean;
}

const goBack = () => (router.canGoBack() ? router.back() : router.replace('/home'));

/** Табын дэлгэцийн нийтлэг хүрээ: толгой (хонх, аватар) + агуулга. */
export function TabScreen({ title, children, testID, back }: Props) {
  return (
    <View style={styles.root} testID={testID}>
      <TopBar
        title={title}
        onBell={() => router.push('/notifications')}
        onAvatar={() => router.push('/settings')}
        onBack={back ? goBack : undefined}
      />
      <View style={styles.body}>{children}</View>
    </View>
  );
}

/**
 * Таблет ≥ 768 dp-д жагсаалт + дэлгэрэнгүй хоёр багана (§3.3, AC-192); утсанд
 * зөвхөн жагсаалт.
 */
export function SplitView({ list, detail }: { list: ReactNode; detail: ReactNode }) {
  const { isTablet } = useWideLayout();
  if (!isTablet) return <>{list}</>;
  return (
    <View style={styles.split} testID="split-view">
      <View style={styles.listPane}>{list}</View>
      <View style={styles.detailPane} testID="split-detail">
        {detail}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { flex: 1 },
  split: { flex: 1, flexDirection: 'row' },
  listPane: { width: 380, maxWidth: '45%' },
  detailPane: { flex: 1 },
});
