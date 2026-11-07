import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { useT } from '@/i18n';
import { useColors } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';

import { AppButton } from './AppButton';
import { AppText } from './AppText';

interface Props {
  visible: boolean;
  title: string;
  /** Юу болохыг нэг-хоёр өгүүлбэрээр (жишээ нь «Анугийн 2 сэтгэгдэл хамт устна»). */
  body?: string | null;
  children?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
  testID?: string;
}

/**
 * Баталгаажуулах цонх (устгах, бүрмөсөн устгах): гарчиг, үр дагавар, батлах · болих. Ард нь
 * товшиход болино. `Modal` нь native ба вэбд адил ажиллана.
 */
export function ConfirmSheet({ visible, title, body, children, confirmLabel, cancelLabel, onConfirm, onCancel, loading, testID }: Props) {
  const t = useT();
  const colors = useColors();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={[styles.scrim, { backgroundColor: colors.scrim }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} accessibilityRole="button" accessibilityLabel={cancelLabel ?? t('common.cancel')} />
        <View
          style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}
          accessibilityViewIsModal
          accessibilityRole="alert"
          testID={testID}
        >
          <AppText variant="h2" accessibilityRole="header">
            {title}
          </AppText>
          {body ? (
            <AppText color="textMuted" testID={testID ? `${testID}-body` : undefined}>
              {body}
            </AppText>
          ) : null}
          {children}
          <View style={styles.actions}>
            <AppButton variant="secondary" label={cancelLabel ?? t('common.cancel')} onPress={onCancel} testID={testID ? `${testID}-cancel` : undefined} />
            <AppButton label={confirmLabel} onPress={onConfirm} loading={loading} testID={testID ? `${testID}-confirm` : undefined} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, justifyContent: 'flex-end', alignItems: 'center', padding: spacing.md },
  sheet: { width: '100%', maxWidth: 520, borderWidth: 1, borderRadius: radius.card, padding: spacing.lg, gap: spacing.sm },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm, flexWrap: 'wrap', marginTop: spacing.xs },
});
