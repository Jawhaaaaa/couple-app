import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { CircleUser, MapPin } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { type CityRef, profileVersion, searchCities, updateMe } from '@/api/queries/auth';
import { useMeQuery } from '@/api/queries/bootstrap';
import { deviceTimezone } from '@/auth/device';
import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { AuthScreen } from '@/components/AuthScreen';
import { FormMessage } from '@/components/FormMessage';
import { TextField } from '@/components/TextField';
import { useErrorText } from '@/hooks/useErrorText';
import { useOnlineOnly } from '@/hooks/useOnlineOnly';
import { useT } from '@/i18n';
import { usePrefsStore } from '@/stores/prefsStore';
import { useColors } from '@/theme/ThemeProvider';
import { iconStroke, radius, spacing, touchTarget } from '@/theme/tokens';

const SEARCH_DEBOUNCE_MS = 300;

/** Хайлтын үгийг бичиж дуусахыг хүлээнэ. */
function useDebounced(value: string, ms: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

/**
 * S-07 Профайл (FR-1.4): аватар (одоохондоо орлуулга — зургийг S-81-д), дуудах нэр,
 * цагийн бүсийн санал (төхөөрөмжөөс), хот (`GET /geo/cities`). Хот хайлт эсвэл
 * хадгалалт ажиллахгүй бол алдааг харуулж «Дараа нь»-гээр үргэлжлүүлэх боломжтой.
 */
export default function ProfileSetupScreen() {
  const t = useT();
  const colors = useColors();
  const errorText = useErrorText();
  const locale = usePrefsStore((s) => s.locale);
  const { disabled: offline } = useOnlineOnly();
  const queryClient = useQueryClient();
  const me = useMeQuery().data;
  const [callName, setCallName] = useState(me?.callName ?? '');
  const [query, setQuery] = useState('');
  const [city, setCity] = useState<CityRef | null>(me?.city ?? null);
  const [suggestedZone] = useState(() => deviceTimezone());
  const q = useDebounced(query.trim(), SEARCH_DEBOUNCE_MS);

  const cities = useQuery({
    queryKey: ['geo-cities', q, locale],
    queryFn: () => searchCities(q, locale),
    enabled: q.length >= 2 && !offline,
    retry: 0,
    staleTime: 5 * 60_000,
  });

  const timezone = city?.timezone ?? suggestedZone ?? me?.timezone ?? null;

  const save = useMutation({
    mutationFn: () => {
      if (!me) throw new Error('me алга');
      return updateMe({
        callName: callName.trim() || null,
        ...(timezone ? { timezone } : {}),
        city,
        version: profileVersion(me),
      });
    },
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

      {city ? (
        <View style={styles.selected}>
          <AppText style={styles.flex} testID="profile-city-selected">
            {t('setup.profile.citySelected', { city: city.name })}
          </AppText>
          <AppButton variant="ghost" label={t('setup.profile.cityClear')} onPress={() => setCity(null)} testID="profile-city-clear" />
        </View>
      ) : (
        <>
          <TextField
            label={t('setup.profile.city')}
            placeholder={t('setup.profile.cityPlaceholder')}
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
            editable={!offline}
            testID="profile-city"
          />
          {cities.isError ? <FormMessage kind="info" text={t('setup.profile.cityUnavailable')} testID="profile-city-unavailable" /> : null}
          {cities.isSuccess && cities.data.length === 0 ? (
            <AppText color="textMuted" testID="profile-city-empty">
              {t('setup.profile.cityEmpty')}
            </AppText>
          ) : null}
          {cities.data?.slice(0, 8).map((c) => {
            const label = `${c.name}, ${c.countryCode}`;
            return (
              <Pressable
                key={`${c.name}-${c.countryCode}-${c.lat}-${c.lon}`}
                onPress={() => {
                  setCity(c);
                  setQuery('');
                }}
                accessibilityRole="button"
                accessibilityLabel={label}
                style={[styles.cityRow, { borderColor: colors.border }]}
                testID="profile-city-option"
              >
                <MapPin size={18} color={colors.textMuted} strokeWidth={iconStroke} />
                <AppText style={styles.flex}>{label}</AppText>
              </Pressable>
            );
          })}
        </>
      )}

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
  selected: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  cityRow: {
    minHeight: touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: 1,
  },
});
