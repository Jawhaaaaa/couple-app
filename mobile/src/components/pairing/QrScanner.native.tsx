import { CameraView, useCameraPermissions } from 'expo-camera';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, Linking, StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { useT } from '@/i18n';
import { useColors } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';

import type { QrScannerProps } from './qrScannerTypes';

export const qrScannerAvailable = true;

/**
 * S-09 QR уншигч (`expo-camera`, Expo Go-д бий). Камерын зөвшөөрөл татгалзвал
 * шалтгааныг хэлж «Тохиргоо нээх» санал болгоно; код гараар оруулах зам үргэлж
 * нээлттэй (spec §6.2 — камер → кодоо гараар бичих).
 */
export function QrScanner({ onScanned, onClose }: QrScannerProps) {
  const t = useT();
  const colors = useColors();
  const [permission, requestPermission] = useCameraPermissions();
  const handled = useRef(false);

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) void requestPermission();
  }, [permission, requestPermission]);

  if (!permission) {
    return (
      <View style={styles.box} testID="qr-scanner-loading">
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <Card testID="qr-permission-denied">
        <AppText variant="label">{t('states.permissionTitle')}</AppText>
        <AppText color="textMuted">{t('pairing.enter.cameraDenied')}</AppText>
        {permission.canAskAgain ? (
          <AppButton variant="secondary" label={t('pairing.enter.cameraAllow')} onPress={() => void requestPermission()} testID="qr-allow" />
        ) : (
          <AppButton
            variant="secondary"
            label={t('common.openSettings')}
            // Тохиргоо нээгдэхгүй (ховор) бол гараар оруулах зам доор нээлттэй хэвээр
            onPress={() => void Linking.openSettings().catch(() => undefined)}
            testID="qr-open-settings"
          />
        )}
        <AppButton variant="ghost" label={t('pairing.enter.typeInstead')} onPress={onClose} testID="qr-close" />
      </Card>
    );
  }

  return (
    <View style={styles.wrap} testID="qr-scanner">
      <CameraView
        style={[styles.box, { borderColor: colors.border }]}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={(result) => {
          if (handled.current) return;
          handled.current = true;
          onScanned(result.data);
        }}
        accessibilityLabel={t('pairing.enter.scannerLabel')}
      />
      <AppText color="textMuted" variant="caption" style={styles.center}>
        {t('pairing.enter.scanHint')}
      </AppText>
      <AppButton variant="ghost" label={t('pairing.enter.typeInstead')} onPress={onClose} testID="qr-close" />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  box: { width: '100%', height: 280, borderRadius: radius.card, borderWidth: 1, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  center: { textAlign: 'center' },
});
