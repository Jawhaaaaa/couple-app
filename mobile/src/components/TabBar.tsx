import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { CalendarHeart, HeartHandshake, House, Images, type LucideIcon, MessageCircleHeart } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useT } from '@/i18n';
import { AnimatedMoment } from '@/motion/AnimatedMoment';
import { playHaptic } from '@/motion/haptics';
import { useMotionPreference } from '@/motion/useMotionPreference';
import { useColors } from '@/theme/ThemeProvider';
import { iconStroke, motion, spacing, touchTarget } from '@/theme/tokens';

import { AppText } from './AppText';

/** Доод навигацийн 5 таб (§3.3, зургийнх): Нүүр · Дурсамж · Чат · Төлөвлөгөө · Хамтдаа. */
export const TABS = [
  { name: 'home', label: 'tabs.home', Icon: House },
  { name: 'memories', label: 'tabs.memories', Icon: Images },
  { name: 'chat', label: 'tabs.chat', Icon: MessageCircleHeart },
  { name: 'plans', label: 'tabs.plans', Icon: CalendarHeart },
  { name: 'together', label: 'tabs.together', Icon: HeartHandshake },
] as const satisfies readonly { name: string; label: string; Icon: LucideIcon }[];

interface ItemProps {
  label: string;
  Icon: LucideIcon;
  focused: boolean;
  vertical: boolean;
  onPress: () => void;
  testID: string;
}

function TabItem({ label, Icon, focused, vertical, onPress, testID }: ItemProps) {
  const colors = useColors();
  const level = useMotionPreference();
  const scale = useSharedValue(1);
  const dot = useSharedValue(focused ? 1 : 0);
  // E2E-д ажиглах (TQ-05): идэвхтэй болсны дараах spring-ийн хугацаанд `playing`
  // Идэвхтэй таб mount болох (вэбэд таб солиход bar дахин үүсч болно) ба идэвхжих үед
  const [bouncing, setBouncing] = useState(focused);
  const [wasFocused, setWasFocused] = useState(focused);
  if (focused !== wasFocused) {
    setWasFocused(focused);
    if (focused) setBouncing(true);
  }
  useEffect(() => {
    if (!bouncing) return;
    const timer = setTimeout(() => setBouncing(false), motion.duration.long);
    return () => clearTimeout(timer);
  }, [bouncing]);

  useEffect(() => {
    // ANIM-10: идэвхтэй дүрс spring-ээр үсэрч, доогуур цэг гулсаж гарна
    if (focused && level === 'full') scale.value = withSequence(withSpring(1.18, motion.springBouncy), withSpring(1, motion.spring));
    dot.value = level === 'off' ? (focused ? 1 : 0) : withSpring(focused ? 1 : 0, motion.spring);
  }, [dot, focused, level, scale]);

  const iconStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const dotStyle = useAnimatedStyle(() => ({ opacity: dot.value, transform: [{ scaleX: dot.value }] }));
  const tint = focused ? colors.primary : colors.textMuted;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: focused }}
      aria-selected={focused}
      testID={testID}
      style={[styles.item, vertical && styles.itemVertical]}
    >
      <Animated.View style={iconStyle}>
        <Icon size={24} color={tint} strokeWidth={iconStroke} />
      </Animated.View>
      <AppText variant="caption" color={focused ? 'primary' : 'textMuted'} numberOfLines={1}>
        {label}
      </AppText>
      {focused ? (
        // Босоо (вэбийн sidebar) үед байрлалыг тэмдэглэгээний View авна — цэг өөрөө хэмжээтэй л
        <AnimatedMoment anim="ANIM-10" playing={bouncing} style={vertical ? styles.dotHostVertical : undefined}>
          {() => <Animated.View style={[vertical ? styles.dotVerticalSize : styles.dot, { backgroundColor: colors.primary }, dotStyle]} />}
        </AnimatedMoment>
      ) : (
        <Animated.View style={[vertical ? styles.dotVertical : styles.dot, { backgroundColor: colors.primary }, dotStyle]} />
      )}
    </Pressable>
  );
}

/**
 * Утас/таблетэд доод таб, вэб ≥ 1024 px-д зүүн талын навигаци (`tabBarPosition: 'left'`).
 * Таб солиход ANIM-10 ба `selection` haptic.
 */
export function TabBar({ state, navigateToTab, vertical }: BottomTabBarProps & { vertical: boolean }) {
  const colors = useColors();
  const t = useT();
  const insets = useSafeAreaInsets();
  return (
    <View
      accessibilityRole="tablist"
      testID={vertical ? 'sidebar-nav' : 'bottom-tabs'}
      style={[
        vertical ? styles.sidebar : styles.bar,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          paddingBottom: vertical ? spacing.md : Math.max(insets.bottom, spacing.xs),
        },
      ]}
    >
      {vertical ? (
        <AppText variant="h2" style={styles.brand}>
          {t('app.name')}
        </AppText>
      ) : null}
      {state.routes.map((route, index) => {
        const tab = TABS.find((x) => x.name === route.name);
        if (!tab) return null;
        const focused = state.index === index;
        return (
          <TabItem
            key={route.key}
            label={t(tab.label)}
            Icon={tab.Icon}
            focused={focused}
            vertical={vertical}
            testID={`tab-${tab.name}`}
            onPress={() => {
              if (focused) return;
              playHaptic('ANIM-10');
              navigateToTab(route.key);
            }}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', borderTopWidth: 1, paddingTop: spacing.xs },
  sidebar: { width: 232, borderRightWidth: 1, paddingTop: spacing.xl, paddingHorizontal: spacing.sm, gap: spacing.xxs },
  brand: { paddingHorizontal: spacing.md, paddingBottom: spacing.lg },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: touchTarget + 8, gap: 2 },
  itemVertical: {
    flex: 0,
    flexDirection: 'row',
    justifyContent: 'flex-start',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    minHeight: touchTarget + 4,
  },
  dot: { width: 16, height: 3, borderRadius: 2, marginTop: 2 },
  dotVertical: { position: 'absolute', left: 0, width: 3, height: 20, borderRadius: 2 },
  dotHostVertical: { position: 'absolute', left: 0 },
  dotVerticalSize: { width: 3, height: 20, borderRadius: 2 },
});
