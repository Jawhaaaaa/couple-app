import { router, useLocalSearchParams } from 'expo-router';
import { ChevronRight, Download, FolderHeart, Heart, MapPin, Plus, Search, Sparkles, Trash2 } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, SectionList, StyleSheet, View } from 'react-native';

import {
  type MemoryFilters,
  type MemoryScopeParam,
  hasActiveFilters,
  useMemoriesInfinite,
  useMemoryMonths,
  useMemoryPlaces,
} from '@/api/queries/memories';
import { useRecaps } from '@/api/queries/recaps';
import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { Chip, ChipRow } from '@/components/Chip';
import { PlacesMap } from '@/components/map/PlacesMap';
import { MemoryCard } from '@/components/memories/MemoryCard';
import { isFreshMemory, PolaroidIn } from '@/components/memories/PolaroidIn';
import { ScreenState } from '@/components/ScreenState';
import { SegmentedTabs } from '@/components/SegmentedTabs';
import { TabScreen } from '@/components/TabScreen';
import { emptyStateText } from '@/content/emptyStates';
import { useErrorText } from '@/hooks/useErrorText';
import { formatDateLong, useT } from '@/i18n';
import { monthLabel, groupByMonth } from '@/memories/timeline';
import { playHaptic } from '@/motion/haptics';
import { usePrefsStore } from '@/stores/prefsStore';
import { useColors } from '@/theme/ThemeProvider';
import { iconStroke, radius, spacing, touchTarget } from '@/theme/tokens';

type ViewKey = 'timeline' | 'map' | 'recap';
const VIEWS: readonly ViewKey[] = ['timeline', 'map', 'recap'];
const SCOPES: readonly MemoryScopeParam[] = ['shared', 'private', 'all'];

function pick<T extends string>(value: string | string[] | undefined, allowed: readonly T[]): T | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  return allowed.includes(v as T) ? (v as T) : undefined;
}

const openEditor = () => router.push('/memory-editor');

/**
 * S-30 Дурсамж (FR-5.3, FR-5.13): `?view=timeline|map|recap&scope=`. Timeline нь сараар
 * бүлэглэсэн, наалддаг толгойтой («2026 оны 11 сар · 2 дурсамж», AC-80), хязгааргүй ачаална;
 * «Хувийн» chip нь `scope=private` (R-4, AC-67). Газрын зураг таб — газруудын жагсаалт
 * (Leaflet газрын зураг, S-70-тэй ижил), Recap таб — жилийн хураангуйнууд.
 */
export default function MemoriesScreen() {
  const t = useT();
  const params = useLocalSearchParams<{ view?: string; scope?: string }>();
  const view = pick(params.view, VIEWS) ?? 'timeline';
  const scope = pick(params.scope, SCOPES);
  const [favorite, setFavorite] = useState(false);
  const [hasLocation, setHasLocation] = useState(false);
  const filters: MemoryFilters = { scope, favorite, hasLocation };

  const setScope = (next: MemoryScopeParam | undefined) => router.setParams({ scope: next === scope ? undefined : next });
  const clearFilters = () => {
    setFavorite(false);
    setHasLocation(false);
    router.setParams({ scope: undefined });
  };

  return (
    <TabScreen title={t('tabs.memories')} testID="screen-S-30">
      <View style={styles.header}>
        <Pressable
          onPress={() => router.push('/memories/search')}
          accessibilityRole="search"
          accessibilityLabel={t('memories.search.open')}
          testID="memories-search-open"
          style={({ pressed }) => [styles.searchBox, { opacity: pressed ? 0.85 : 1 }]}
        >
          <SearchBoxInner />
        </Pressable>
        <Shortcuts />
        <SegmentedTabs
          options={[
            { key: 'timeline', label: t('memories.views.timeline') },
            { key: 'map', label: t('memories.views.map') },
            { key: 'recap', label: t('memories.views.recap') },
          ]}
          value={view}
          onChange={(v) => router.setParams({ view: v })}
          testID="memories-view"
        />
        {view === 'timeline' ? (
          <ChipRow testID="memories-filters">
            <Chip label={t('memories.filters.shared')} selected={scope === 'shared'} onPress={() => setScope('shared')} testID="memories-chip-shared" />
            <Chip label={t('memories.filters.private')} selected={scope === 'private'} onPress={() => setScope('private')} testID="memories-chip-private" />
            <Chip label={t('memories.filters.favorite')} selected={favorite} onPress={() => setFavorite((v) => !v)} testID="memories-chip-favorite" />
            <Chip label={t('memories.filters.hasLocation')} selected={hasLocation} onPress={() => setHasLocation((v) => !v)} testID="memories-chip-location" />
          </ChipRow>
        ) : null}
      </View>
      {view === 'timeline' ? <Timeline filters={filters} onClearFilters={clearFilters} /> : view === 'map' ? <PlacesList /> : <RecapList />}
      <CaptureFab />
    </TabScreen>
  );
}

function SearchBoxInner() {
  const t = useT();
  const colors = useColors();
  return (
    <View style={[styles.searchInner, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Search size={20} color={colors.textMuted} strokeWidth={iconStroke} />
      <AppText color="textMuted">{t('memories.search.placeholder')}</AppText>
    </View>
  );
}

/** S-34…S-39 руу: цомог, дуртай, хогийн сав, экспорт. */
function Shortcuts() {
  const t = useT();
  const colors = useColors();
  const items = [
    { icon: FolderHeart, label: t('memories.groups.title'), href: '/memories/groups', testID: 'memories-open-groups' },
    { icon: Heart, label: t('memories.favorites.title'), href: '/memories/favorites', testID: 'memories-open-favorites' },
    { icon: Trash2, label: t('memories.trash.title'), href: '/memories/trash', testID: 'memories-open-trash' },
    { icon: Download, label: t('memories.export.title'), href: '/memories/export', testID: 'memories-open-export' },
  ] as const;
  return (
    <View style={styles.shortcuts}>
      {items.map(({ icon: Icon, label, href, testID }) => (
        <Pressable
          key={href}
          onPress={() => router.push(href)}
          accessibilityRole="link"
          accessibilityLabel={label}
          testID={testID}
          style={({ pressed }) => [styles.shortcut, { backgroundColor: colors.surfaceRaised, opacity: pressed ? 0.85 : 1 }]}
        >
          <Icon size={18} color={colors.primary} strokeWidth={iconStroke} />
          <AppText variant="caption" numberOfLines={1}>
            {label}
          </AppText>
        </Pressable>
      ))}
    </View>
  );
}

function Timeline({ filters, onClearFilters }: { filters: MemoryFilters; onClearFilters: () => void }) {
  const t = useT();
  const colors = useColors();
  const errorText = useErrorText();
  const locale = usePrefsStore((s) => s.locale);
  const list = useMemoriesInfinite(filters);
  const months = useMemoryMonths(filters.scope);
  const data = list.data;
  const sections = useMemo(() => groupByMonth(data?.pages.flatMap((p) => p.items) ?? [], months.data), [data, months.data]);

  if (list.isPending) return <ScreenState kind="loading" rows={3} />;
  if (list.isError && !data) return <ScreenState kind="error" message={errorText(list.error)} onRetry={() => void list.refetch()} />;
  if (sections.length === 0) {
    if (hasActiveFilters({ ...filters, scope: undefined }) || filters.scope) {
      const empty = emptyStateText('S-34', locale);
      return <ScreenState kind="empty" text={empty.text} actionLabel={empty.action} onAction={onClearFilters} />;
    }
    const empty = emptyStateText('S-30', locale);
    return <ScreenState kind="empty" text={empty.text} actionLabel={empty.action} onAction={openEditor} />;
  }

  return (
    <SectionList
      sections={sections}
      keyExtractor={(m) => m.id}
      stickySectionHeadersEnabled
      contentContainerStyle={styles.list}
      testID="memories-timeline"
      refreshControl={
        <RefreshControl
          refreshing={list.isRefetching && !list.isFetchingNextPage}
          onRefresh={() => {
            playHaptic('ANIM-09');
            void list.refetch();
            void months.refetch();
          }}
        />
      }
      renderSectionHeader={({ section }) => (
        <View style={[styles.monthHeader, { backgroundColor: colors.bg }]} testID={`month-${section.key}`}>
          <AppText variant="label" color="textMuted" accessibilityRole="header">
            {t('memories.timeline.month', { year: section.year, month: monthLabel(section.month, locale), count: section.count })}
          </AppText>
        </View>
      )}
      renderItem={({ item }) => (
        <View style={styles.item}>
          <PolaroidIn id={item.id} fresh={isFreshMemory(item.id, item.createdAt)}>
            <MemoryCard memory={item} />
          </PolaroidIn>
        </View>
      )}
      onEndReached={() => {
        if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
      }}
      onEndReachedThreshold={0.5}
      ListFooterComponent={
        list.isFetchingNextPage ? (
          <ActivityIndicator accessibilityLabel={t('common.loading')} style={styles.footer} />
        ) : list.isError ? (
          <AppButton variant="ghost" label={t('common.retry')} onPress={() => void list.fetchNextPage()} testID="memories-more-retry" />
        ) : (
          <View style={styles.fabSpace} />
        )
      }
    />
  );
}

/** «Газрын зураг» таб (FR-5.13, AC-86): S-70-тэй ижил газрын зураг (`/memories/places`) + газруудын жагсаалт. */
function PlacesList() {
  const t = useT();
  const colors = useColors();
  const errorText = useErrorText();
  const places = useMemoryPlaces();
  if (places.isPending) return <ScreenState kind="loading" rows={3} />;
  if (!places.data) return <ScreenState kind="error" message={errorText(places.error)} onRetry={() => void places.refetch()} />;
  if (places.data.length === 0) {
    return <ScreenState kind="empty" text={t('memories.places.empty')} actionLabel={t('memories.places.emptyAction')} onAction={openEditor} />;
  }
  return (
    <FlatList
      data={places.data}
      keyExtractor={(p) => `${p.placeName}-${p.lat}-${p.lon}`}
      contentContainerStyle={styles.list}
      testID="memories-places"
      ListHeaderComponent={
        <View style={styles.listHeader}>
          <PlacesMap places={places.data} height={300} />
          <AppText variant="h3" accessibilityRole="header">
            {t('memories.places.title')}
          </AppText>
        </View>
      }
      renderItem={({ item }) => (
        <Pressable
          onPress={() => router.push({ pathname: '/memories/search', params: { place: item.placeName } })}
          accessibilityRole="link"
          accessibilityLabel={`${item.placeName}, ${t('memories.count', { count: item.count })}`}
          testID="memories-place"
          style={({ pressed }) => [styles.row, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.85 : 1 }]}
        >
          <MapPin size={20} color={colors.primary} strokeWidth={iconStroke} />
          <View style={styles.flex}>
            <AppText variant="bodyStrong">{item.placeName}</AppText>
            <AppText variant="caption" color="textMuted">
              {t('memories.count', { count: item.count })}
            </AppText>
          </View>
          <ChevronRight size={20} color={colors.textMuted} strokeWidth={iconStroke} />
        </Pressable>
      )}
    />
  );
}

/** «Recap» таб (FR-5.11): ойн өдрийн жилийн хураангуйнууд → S-38. */
function RecapList() {
  const t = useT();
  const colors = useColors();
  const errorText = useErrorText();
  const locale = usePrefsStore((s) => s.locale);
  const recaps = useRecaps();
  if (recaps.isPending) return <ScreenState kind="loading" rows={2} />;
  if (!recaps.data) return <ScreenState kind="error" message={errorText(recaps.error)} onRetry={() => void recaps.refetch()} />;
  if (recaps.data.length === 0) {
    return <ScreenState kind="empty" text={t('memories.recaps.empty')} actionLabel={t('memories.recaps.emptyAction')} onAction={openEditor} />;
  }
  return (
    <FlatList
      data={recaps.data}
      keyExtractor={(r) => r.id}
      contentContainerStyle={styles.list}
      testID="memories-recaps"
      renderItem={({ item }) => (
        <Pressable
          onPress={() => router.push(`/recap/${item.id}`)}
          accessibilityRole="link"
          accessibilityLabel={`${item.yearLabel}, ${formatDateLong(item.anniversaryOn, locale)}`}
          testID="memories-recap"
          style={({ pressed }) => [styles.row, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.85 : 1 }]}
        >
          <Sparkles size={22} color={colors.primary} strokeWidth={iconStroke} />
          <View style={styles.flex}>
            <AppText variant="bodyStrong">{item.yearLabel}</AppText>
            <AppText variant="caption" color="textMuted">
              {formatDateLong(item.anniversaryOn, locale)}
            </AppText>
          </View>
          <ChevronRight size={20} color={colors.textMuted} strokeWidth={iconStroke} />
        </Pressable>
      )}
    />
  );
}

/** «Мөч хадгалах» (Capture Moment) → S-32. */
function CaptureFab() {
  const t = useT();
  const colors = useColors();
  return (
    <Pressable
      onPress={openEditor}
      accessibilityRole="button"
      accessibilityLabel={t('memories.capture')}
      testID="memories-fab"
      style={({ pressed }) => [
        styles.fab,
        { backgroundColor: colors.primary, opacity: pressed ? 0.9 : 1, shadowColor: colors.text },
      ]}
    >
      <Plus size={22} color={colors.onPrimary} strokeWidth={iconStroke} />
      <AppText variant="label" color="onPrimary">
        {t('memories.capture')}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.screen, gap: spacing.sm, paddingBottom: spacing.xs, width: '100%', maxWidth: 720, alignSelf: 'center' },
  searchBox: { minHeight: touchTarget },
  searchInner: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  shortcuts: { flexDirection: 'row', gap: spacing.xs },
  shortcut: {
    flex: 1,
    minHeight: touchTarget + spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xxs,
    borderRadius: radius.input,
    paddingHorizontal: spacing.xxs,
  },
  list: { padding: spacing.screen, paddingTop: 0, gap: spacing.sm, width: '100%', maxWidth: 720, alignSelf: 'center' },
  listHeader: { gap: spacing.xxs, paddingBottom: spacing.xs },
  monthHeader: { paddingVertical: spacing.xs },
  item: { paddingBottom: spacing.sm },
  footer: { padding: spacing.md },
  fabSpace: { height: 88 },
  row: {
    minHeight: touchTarget + spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.input,
    borderWidth: 1,
  },
  flex: { flex: 1 },
  fab: {
    position: 'absolute',
    right: spacing.screen,
    bottom: spacing.md,
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    elevation: 4,
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
});
