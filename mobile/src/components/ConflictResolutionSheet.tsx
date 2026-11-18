import { Modal, ScrollView, StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { useT } from '@/i18n';
import { useColors } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';

/** Нэг хувилбарын товч дүр: гарчиг, нэмэлт мөр (огноо, газар, төлөв), урт текст. */
export interface ConflictVersion {
  title: string;
  meta?: string | null;
  body?: string | null;
}

interface Props {
  visible: boolean;
  /** Толгой — «Ану энэ зүйлийг саяхан өөрчилжээ» г.м. (объектын төрлөөр дуудагч өгнө). */
  title: string;
  mine: ConflictVersion;
  theirs: ConflictVersion;
  onKeepMine: () => void;
  onKeepTheirs: () => void;
  /** Сонголтгүй хаах (Android «буцах») — өөрчлөлт хэвээр, дахин хадгалж болно. */
  onDismiss: () => void;
  loading?: boolean;
}

/**
 * Зэрэг засварын ерөнхий сонголт (FR-15.1, AC-41, AC-131, INV-07): 409 `VERSION_CONFLICT`-д
 * хоёр дахь хадгалагчид «Миний хувилбар / Түүний хувилбар»-ыг зэрэгцүүлж харуулна — аль ч
 * өөрчлөлт чимээгүй дарагдахгүй. Дурсамж, болзоо, жагсаалтын зүйл, зорилгод нэг компонент.
 */
export function ConflictResolutionSheet({ visible, title, mine, theirs, onKeepMine, onKeepTheirs, onDismiss, loading }: Props) {
  const t = useT();
  const colors = useColors();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={[styles.scrim, { backgroundColor: colors.scrim }]}>
        <View style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]} accessibilityViewIsModal testID="conflict-sheet">
          <ScrollView contentContainerStyle={styles.body}>
            <AppText variant="h2" accessibilityRole="header">
              {title}
            </AppText>
            <AppText color="textMuted">{t('together.conflict.body')}</AppText>
            <VersionBox label={t('together.conflict.mine')} version={mine} tone={colors.primary} testID="conflict-mine" />
            <VersionBox label={t('together.conflict.theirs')} version={theirs} tone={colors.secondary} testID="conflict-theirs" />
            <View style={styles.actions}>
              <AppButton variant="secondary" label={t('together.conflict.keepTheirs')} onPress={onKeepTheirs} disabled={loading} testID="conflict-keep-theirs" />
              <AppButton label={t('together.conflict.keepMine')} onPress={onKeepMine} loading={loading} testID="conflict-keep-mine" />
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function VersionBox({ label, version, tone, testID }: { label: string; version: ConflictVersion; tone: string; testID: string }) {
  return (
    <View style={[styles.box, { borderColor: tone }]} testID={testID}>
      <AppText variant="label" color="textMuted">
        {label}
      </AppText>
      <AppText variant="bodyStrong" testID={`${testID}-title`}>
        {version.title}
      </AppText>
      {version.meta ? (
        <AppText variant="caption" color="textMuted" testID={`${testID}-meta`}>
          {version.meta}
        </AppText>
      ) : null}
      {version.body ? (
        <AppText numberOfLines={3} testID={`${testID}-description`}>
          {version.body}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.md },
  sheet: { width: '100%', maxWidth: 560, maxHeight: '90%', borderWidth: 1, borderRadius: radius.card },
  body: { padding: spacing.lg, gap: spacing.sm },
  box: { borderWidth: 2, borderRadius: radius.input, padding: spacing.sm, gap: spacing.xxs },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: spacing.sm, marginTop: spacing.xs },
});
