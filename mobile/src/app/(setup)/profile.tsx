import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { CircleUser } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { CityRef } from '@/api/queries/auth';
import { useMeQuery } from '@/api/queries/bootstrap';
import { patchMe } from '@/api/queries/profile';
import { deviceTimezone } from '@/auth/device';
import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { AuthScreen } from '@/components/AuthScreen';
import { CityPicker } from '@/components/CityPicker';
import { FormMessage } from '@/components/FormMessage';
import { TextField } from '@/components/TextField';
import { useErrorText } from '@/hooks/useErrorText';
import { useOnlineOnly } from '@/hooks/useOnlineOnly';
import { useT } from '@/i18n';
import { useColors } from '@/theme/ThemeProvider';
import { iconStroke, radius, spacing } from '@/theme/tokens';

/**
 * S-07 Профайл (FR-1.4): аватар (зургийг S-81-д), дуудах нэр, цагийн бүсийн санал
 * (төхөөрөмжөөс), хот (`GET /geo/cities`). Хот хайлт эсвэл хадгалалт ажиллахгүй бол
 * алдааг харуулж «Дараа нь»-гээр үргэлжлүүлэх боломжтой. Дараа нь хаалга → S-13.
 */
export default function ProfileSetupScreen() {
  const t = useT();
  const colors = useColors();
  const errorText = useErrorText();
  const { disabled: offline } = useOnlineOnly();
  const queryClient = useQueryClient();
  const me = useMeQuery().data;
  const [callName, setCallName] = useState(me?.callName ?? '');
  const [city, setCity] = useState<CityRef | null>(me?.city ?? null);
  const [suggestedZone] = useState(() => deviceTimezone());

  const timezone = city?.timezone ?? suggestedZone ?? me?.timezone ?? null;

  const save = useMutation({
    mutationFn: () =>
      patchMe({
        callName: callName.trim() || null,
        ...(timezone ? { timezone } : {}),
        city,
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(['me'], updated);
      router.replace('/');
    },
  });

  return (
    <AuthScreen title={t('setup.profile.title')} subtitle={t('setup.profile.subtitle')} mascot={false} testID="screen-S-07">
      <View style={styles.avatarRow}>
        <View
          style={[styles.avatar, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}
          accessibilityRole="image"
          accessibilityLabel={t('setup.profile.avatar')}
          testID="profile-avatar"
        >
          <CircleUser size={48} color={colors.textMuted} strokeWidth={iconStroke} />
        </View>
        <AppText variant="caption" color="textMuted" style={styles.flex}>
          {t('setup.profile.avatarLater')}
        </AppText>
      </View>

      <TextField
        label={t('setup.profile.callName')}
        hint={t('setup.profile.callNameHint')}
        value={callName}
        onChangeText={setCallName}
        maxLength={50}
        testID="profile-call-name"
      />

      {timezone ? (
        <AppText color="textMuted" testID="profile-timezone">
          {t('setup.profile.timezone', { zone: timezone })}
        </AppText>
      ) : null}

      <CityPicker value={city} onChange={setCity} disabled={offline} />

      {save.error ? <FormMessage text={errorText(save.error)} testID="profile-save-error" /> : null}
      <AppButton
        label={t('setup.profile.save')}
        onPress={() => save.mutate()}
        disabled={!me || offline}
        loading={save.isPending}
        testID="profile-save"
      />
      <AppButton variant="ghost" label={t('setup.profile.later')} onPress={() => router.replace('/')} testID="profile-later" />
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
