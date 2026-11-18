import { ExternalLink } from 'lucide-react-native';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { StackScreen } from '@/components/StackScreen';
import licenses from '@/content/licenses.json';
import { useT } from '@/i18n';
import { useColors } from '@/theme/ThemeProvider';
import { iconStroke, spacing, touchTarget } from '@/theme/tokens';

type LicenseItem = (typeof licenses.groups)[number]['items'][number] & { files?: number };
type GroupId = 'assets' | 'libraries' | 'data';

/**
 * S-89 Лиценз ба талархал (шаардлага §3.5, AC-AS-02): `docs/ASSETS.md`-ээс үүсгэсэн `licenses.json`
 * (`scripts/generate-licenses.cjs`) — «Animated Noto Emoji © Google, CC BY 4.0», Fluent Emoji (MIT), фонт
 * (OFL), нээлттэй эхийн сангууд, OpenStreetMap ба Open-Meteo-гийн attribution.
 */
export default function LicensesScreen() {
  const t = useT();
  return (
    <StackScreen title={t('licenses.title')} testID="screen-S-89">
      <ScrollView contentContainerStyle={styles.body}>
        <AppText color="textMuted">{t('licenses.intro')}</AppText>
        {licenses.groups.map((group) => (
          <Card key={group.id} testID={`licenses-${group.id}`}>
            <AppText variant="h3" accessibilityRole="header">
              {t(`licenses.groups.${group.id as GroupId}`)}
            </AppText>
            {group.items.map((item: LicenseItem) => (
              <LicenseRow key={item.name} item={item} />
            ))}
          </Card>
        ))}
      </ScrollView>
    </StackScreen>
  );
}

function LicenseRow({ item }: { item: LicenseItem }) {
  const t = useT();
  const colors = useColors();
  const url = item.url;
  return (
    <View style={styles.row} testID="license-item">
      <View style={styles.flex}>
        <AppText variant="bodyStrong">{item.notice}</AppText>
        {item.files ? (
          <AppText variant="caption" color="textMuted">
            {t('licenses.files', { count: item.files })}
          </AppText>
        ) : null}
      </View>
      {url ? (
        <Pressable
          onPress={() => void Linking.openURL(url).catch(() => undefined)}
          accessibilityRole="link"
          accessibilityLabel={`${t('licenses.open')}: ${item.name}`}
          style={styles.link}
        >
          <ExternalLink size={18} color={colors.primary} strokeWidth={iconStroke} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: spacing.screen, gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  flex: { flex: 1, gap: spacing.xxs },
  link: { width: touchTarget, height: touchTarget, alignItems: 'center', justifyContent: 'center' },
});
