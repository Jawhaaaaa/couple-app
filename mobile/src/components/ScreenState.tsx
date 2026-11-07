import { useEffect, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import { useT } from '@/i18n';
import { AnimatedMoment } from '@/motion/AnimatedMoment';

import { AppButton } from './AppButton';
import { AppText } from './AppText';
import { Mascot } from './Mascot';
import { ServerUnreachable } from './ServerUnreachable';
import { SkeletonList } from './Skeleton';
import { spacing } from '@/theme/tokens';

export type PermissionKind = 'camera' | 'photos' | 'location' | 'microphone' | 'notifications' | 'calendar';

export type ScreenStateProps =
  | { kind: 'loading'; rows?: number; slowAfterMs?: number }
  | { kind: 'empty'; text: string; actionLabel: string; onAction: () => void }
  | { kind: 'error'; onRetry: () => void; unreachable?: boolean; message?: string }
  | { kind: 'permission'; permission: PermissionKind; onOpenSettings?: () => void };

/**
 * Дэлгэц бүрийн заавал төлөв (Хавсралт А, AC-213): ачаалж буй (skeleton, 1 с-ээс
 * урт бол маскот — ANIM-16) · хоосон (маскот + 1 өгүүлбэр + нэг товч — ANIM-11) ·
 * алдаа (юу болсон + «Дахин оролдох») · зөвшөөрөл татгалзсан (шалтгаан + «Тохиргоо
 * нээх»). Offline төлөв нь кэшээс харуулах + `OfflineBanner` (S-95).
 */
export function ScreenState(props: ScreenStateProps) {
  switch (props.kind) {
    case 'loading':
      return <Loading rows={props.rows} slowAfterMs={props.slowAfterMs} />;
    case 'empty':
      return <Empty {...props} />;
    case 'error':
      return props.unreachable ? <ServerUnreachable onRetry={props.onRetry} /> : <ErrorState {...props} />;
    case 'permission':
      return <Permission {...props} />;
  }
}

function Loading({ rows = 3, slowAfterMs = 1000 }: { rows?: number; slowAfterMs?: number }) {
  const t = useT();
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), slowAfterMs);
    return () => clearTimeout(timer);
  }, [slowAfterMs]);
  return (
    <AnimatedMoment anim="ANIM-16" playing style={styles.fill} testID="state-loading">
      {() => (
        <>
          <SkeletonList rows={rows} />
          {slow ? (
            <View style={styles.center} testID="state-loading-slow">
              <Mascot size={88} />
              <AppText color="textMuted">{t('common.stillLoading')}</AppText>
            </View>
          ) : null}
        </>
      )}
    </AnimatedMoment>
  );
}

function Empty({ text, actionLabel, onAction }: { text: string; actionLabel: string; onAction: () => void }) {
  return (
    <AnimatedMoment anim="ANIM-11" playing style={styles.center} testID="state-empty">
      {() => (
        <>
          <Mascot size={120} pose="wave" />
          <AppText variant="body" style={styles.text}>
            {text}
          </AppText>
          <AppButton label={actionLabel} onPress={onAction} testID="state-empty-action" />
        </>
      )}
    </AnimatedMoment>
  );
}

function ErrorState({ onRetry, message }: { onRetry: () => void; message?: string }) {
  const t = useT();
  return (
    <View style={styles.center} testID="state-error" accessibilityRole="alert">
      <AppText variant="h2" style={styles.text}>
        {t('states.errorTitle')}
      </AppText>
      <AppText color="textMuted" style={styles.text}>
        {message ?? t('states.errorBody')}
      </AppText>
      <AppButton label={t('common.retry')} onPress={onRetry} testID="state-retry" />
    </View>
  );
}

function Permission({ permission, onOpenSettings }: { permission: PermissionKind; onOpenSettings?: () => void }) {
  const t = useT();
  return (
    <View style={styles.center} testID="state-permission">
      <AppText variant="h2" style={styles.text}>
        {t('states.permissionTitle')}
      </AppText>
      <AppText color="textMuted" style={styles.text}>
        {t(`states.permission.${permission}`)}
      </AppText>
      <AppButton
        label={t('common.openSettings')}
        onPress={onOpenSettings ?? (() => Linking.openSettings().catch(() => {}))}
        testID="state-open-settings"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, width: '100%' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl },
  text: { textAlign: 'center' },
});
