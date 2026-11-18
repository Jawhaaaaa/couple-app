import { useQuery } from '@tanstack/react-query';
import { MapPin } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { type CityRef, searchCities } from '@/api/queries/auth';
import { useT } from '@/i18n';
import { usePrefsStore } from '@/stores/prefsStore';
import { useColors } from '@/theme/ThemeProvider';
import { iconStroke, spacing, touchTarget } from '@/theme/tokens';

import { AppButton } from './AppButton';
import { AppText } from './AppText';
import { FormMessage } from './FormMessage';
import { TextField } from './TextField';

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

interface Props {
  value: CityRef | null;
  onChange: (city: CityRef | null) => void;
  /** Offline-д хайлт идэвхгүй. */
  disabled?: boolean;
}

/**
 * Хот сонгогч (S-07, S-81): `GET /geo/cities?q&locale`. Гадны үйлчилгээ унасан бол
 * (503 UPSTREAM_UNAVAILABLE) тайлбар харуулж, хот сонгохгүйгээр үргэлжлүүлэх боломжтой.
 */
export function CityPicker({ value, onChange, disabled }: Props) {
  const t = useT();
  const colors = useColors();
  const locale = usePrefsStore((s) => s.locale);
  const [query, setQuery] = useState('');
  const q = useDebounced(query.trim(), SEARCH_DEBOUNCE_MS);

  const cities = useQuery({
    queryKey: ['geo-cities', q, locale],
    queryFn: () => searchCities(q, locale),
    enabled: q.length >= 2 && !disabled && !value,
    retry: 0,
    staleTime: 5 * 60_000,
  });

  if (value) {
    return (
      <View style={styles.selected}>
        <AppText style={styles.flex} testID="profile-city-selected">
          {t('setup.profile.citySelected', { city: value.name })}
        </AppText>
        <AppButton variant="ghost" label={t('setup.profile.cityClear')} onPress={() => onChange(null)} testID="profile-city-clear" />
      </View>
    );
  }

  return (
    <>
      <TextField
        label={t('setup.profile.city')}
        placeholder={t('setup.profile.cityPlaceholder')}
        value={query}
        onChangeText={setQuery}
        autoCorrect={false}
        editable={!disabled}
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
              onChange(c);
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
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
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
