import { StyleSheet, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { useT } from '@/i18n';
import { qrColors, radius, spacing } from '@/theme/tokens';

interface Props {
  /** QR-д кодлох холбоос (`invite.link`) — код нь холбоосын төгсгөлд (AC-169). */
  value: string;
  size?: number;
}

/** S-08 урилгын QR: камераар уншуулахад S-09/S-10 нээгдэнэ (AC-12). */
export function InviteQr({ value, size = 184 }: Props) {
  const t = useT();
  return (
    <View
      style={[styles.frame, { backgroundColor: qrColors.background }]}
      accessibilityRole="image"
      accessibilityLabel={t('pairing.create.qrLabel')}
      testID="invite-qr"
    >
      <QRCode value={value} size={size} color={qrColors.module} backgroundColor={qrColors.background} ecl="M" />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { alignSelf: 'center', padding: spacing.sm, borderRadius: radius.input },
});
