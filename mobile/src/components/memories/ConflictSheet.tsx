import { Modal, ScrollView, StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { formatDateLong, useT } from '@/i18n';
import { usePrefsStore } from '@/stores/prefsStore';
import { useColors } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';

export interface VersionPreview {
  title: string;
  occurredOn: string;
  placeName?: string | null;
  description?: string | null;
}

interface Props {
  visible: boolean;
  mine: VersionPreview;
  theirs: VersionPreview;
  /** Сервер дээр сүүлд өөрчилсөн хүний нэр (`details.updatedBy`). */
  updatedBy: string | null;
  onKeepMine: () => void;
  onKeepTheirs: () => void;
  /** Сонголтгүй хаах (Android «буцах») — ноорог хэвээр, дахин хадгалж болно. */
  onDismiss: () => void;
  loading?: boolean;
}

/**
 * Зэрэг засварын сонголт (FR-15.1, AC-131, INV-07): хоёр дахь хадгалагчид «Миний хувилбар /
 * Түүний хувилбар» хоёрыг зэрэгцүүлж харуулна — аль ч өөрчлөлт чимээгүй дарагдахгүй.
 */
export function ConflictSheet({ visible, mine, theirs, updatedBy, onKeepMine, onKeepTheirs, onDismiss, loading }: Props) {
  const t = useT();
  const colors = useColors();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={[styles.scrim, { backgroundColor: colors.scrim }]}>
        <View style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]} accessibilityViewIsModal testID="conflict-sheet">
          <ScrollView contentContainerStyle={styles.body}>
            <AppText variant="h2" accessibilityRole="header">
              {updatedBy ? t('memories.conflict.titleBy', { name: updatedBy }) : t('memories.conflict.title')}
            </AppText>
            <AppText color="textMuted">{t('memories.conflict.body')}</AppText>
            <VersionBox label={t('memories.conflict.mine')} version={mine} tone={colors.primary} testID="conflict-mine" />
            <VersionBox label={t('memories.conflict.theirs')} version={theirs} tone={colors.secondary} testID="conflict-theirs" />
            <View style={styles.actions}>
              <AppButton variant="secondary" label={t('memories.conflict.keepTheirs')} onPress={onKeepTheirs} disabled={loading} testID="conflict-keep-theirs" />
              <AppButton label={t('memories.conflict.keepMine')} onPress={onKeepMine} loading={loading} testID="conflict-keep-mine" />
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function VersionBox({ label, version, tone, testID }: { label: string; version: VersionPreview; tone: string; testID: string }) {
  const locale = usePrefsStore((s) => s.locale);
  return (
    <View style={[styles.box, { borderColor: tone }]} testID={testID}>
      <AppText variant="label" color="textMuted">
        {label}
      </AppText>
      <AppText variant="bodyStrong" testID={`${testID}-title`}>
        {version.title}
      </AppText>
      <AppText variant="caption" color="textMuted">
        {[formatDateLong(version.occurredOn, locale), version.placeName].filter(Boolean).join(' · ')}
      </AppText>
      {version.description ? (
        <AppText numberOfLines={3} testID={`${testID}-description`}>
          {version.description}
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
