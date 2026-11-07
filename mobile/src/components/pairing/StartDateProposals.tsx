import { StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { formatDate, useT } from '@/i18n';
import type { StartDateView } from '@/pairing/startDate';
import type { DateFormat } from '@/stores/prefsStore';
import { useColors } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';

interface Props {
  view: StartDateView;
  partnerName: string;
  dateFormat: DateFormat;
  /** Хамтрагчийн саналыг батлах (ижил огноог санал болгох). */
  onAccept: (date: string) => void;
  disabled?: boolean;
  pending?: boolean;
}

/**
 * S-11-ийн саналын төлөв (AC-65): батлагдсан · хамтрагчийг хүлээж буй · хамтрагчийн
 * санал · зөрүү (хоёр огноо зэрэгцээ, хамтрагчийнхыг сонгох эсвэл засах).
 */
export function StartDateProposals({ view, partnerName, dateFormat, onAccept, disabled, pending }: Props) {
  const t = useT();
  const colors = useColors();
  const fmt = (date: string) => formatDate(date, dateFormat);

  switch (view.kind) {
    case 'none':
      return null;
    case 'confirmed':
      return (
        <Card testID="start-date-confirmed">
          <AppText variant="h2">{t('pairing.startDate.confirmed', { date: fmt(view.date) })}</AppText>
          <AppText color="textMuted">{t('pairing.startDate.confirmedBody')}</AppText>
        </Card>
      );
    case 'waitingPartner':
      return (
        <Card testID="start-date-waiting">
          <AppText>{t('pairing.startDate.waitingPartner', { date: fmt(view.mine), name: partnerName })}</AppText>
        </Card>
      );
    case 'partnerProposed':
      return (
        <Card testID="start-date-partner">
          <AppText>{t('pairing.startDate.partnerProposed', { name: partnerName, date: fmt(view.partner) })}</AppText>
          <AppButton
            label={t('pairing.startDate.acceptPartner', { date: fmt(view.partner) })}
            onPress={() => onAccept(view.partner)}
            disabled={disabled}
            loading={pending}
            testID="start-date-accept"
          />
        </Card>
      );
    case 'mismatch':
      return (
        <Card testID="start-date-mismatch">
          <AppText variant="h2" accessibilityRole="header">
            {t('pairing.startDate.mismatchTitle')}
          </AppText>
          <AppText color="textMuted">{t('pairing.startDate.mismatchBody')}</AppText>
          <View style={[styles.row, { borderColor: colors.border }]} testID="start-date-mine">
            <AppText variant="label" color="textMuted">
              {t('pairing.startDate.mine')}
            </AppText>
            <AppText variant="h2">{fmt(view.mine)}</AppText>
          </View>
          <View style={[styles.row, { borderColor: colors.primary }]} testID="start-date-theirs">
            <AppText variant="label" color="textMuted">
              {t('pairing.startDate.partners', { name: partnerName })}
            </AppText>
            <AppText variant="h2">{fmt(view.partner)}</AppText>
            <AppButton
              variant="secondary"
              label={t('pairing.startDate.acceptPartner', { date: fmt(view.partner) })}
              onPress={() => onAccept(view.partner)}
              disabled={disabled}
              loading={pending}
              testID="start-date-pick-partner"
            />
          </View>
        </Card>
      );
  }
}

const styles = StyleSheet.create({
  row: { borderWidth: 1, borderRadius: radius.input, padding: spacing.sm, gap: spacing.xxs },
});
