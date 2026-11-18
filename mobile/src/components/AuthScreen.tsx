import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { spacing } from '@/theme/tokens';

import { AppText } from './AppText';
import { Mascot } from './Mascot';

interface Props {
  title: string;
  subtitle?: string | null;
  children: ReactNode;
  testID?: string;
  /** Маскот харуулах эсэх (анхдагч — тийм). */
  mascot?: boolean;
}

/** Нэвтрэлт/тохируулгын дэлгэцийн хүрээ: маскот, гарчиг, гүйлгэдэг форм (≤ 440 өргөн). */
export function AuthScreen({ title, subtitle, children, testID, mascot = true }: Props) {
  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.fill}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.fill}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" testID={testID}>
          <View style={styles.inner}>
            {mascot ? (
              <View style={styles.mascot}>
                <Mascot size={96} pose="wave" />
              </View>
            ) : null}
            <AppText variant="h1" accessibilityRole="header" style={styles.center}>
              {title}
            </AppText>
            {subtitle ? (
              <AppText color="textMuted" style={styles.center}>
                {subtitle}
              </AppText>
            ) : null}
            {children}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: spacing.screen, paddingVertical: spacing.xl },
  inner: { width: '100%', maxWidth: 440, alignSelf: 'center', gap: spacing.md },
  mascot: { alignItems: 'center' },
  center: { textAlign: 'center' },
});
