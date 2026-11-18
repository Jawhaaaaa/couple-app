import { useState } from 'react';
import { type GestureResponderEvent, type LayoutChangeEvent, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, Line, Polyline } from 'react-native-svg';

import { AppText } from '@/components/AppText';
import { averageMood, MOOD_LEVELS, type MoodDay, moodSegments } from '@/domain/moodChart';
import { formatDate, useT } from '@/i18n';
import { usePrefsStore } from '@/stores/prefsStore';
import { useColors } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';

const HEIGHT = 168;
const PAD_X = 12;
const PAD_Y = 14;

interface Props {
  days: MoodDay[];
  partnerName: string;
}

/**
 * Сэтгэл санааны график (S-69, FR-11.3, AC-115): өөрийн шугам (бүтэн, дүүрэн цэг) ба хамтрагчийн
 * хуваалцсан өдрийн хоёр дахь шугам (тасархай, хөндий цэг — өнгөнөөс гадна хэлбэрээр ялгана).
 * Хоосон өдөр шугамыг таслана. Товшсон өдрийн утга доор; домог ба дундаж үргэлж харагдана.
 */
export function MoodChart({ days, partnerName }: Props) {
  const t = useT();
  const colors = useColors();
  const dateFormat = usePrefsStore((s) => s.dateFormat);
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const box = { width, height: HEIGHT, padX: PAD_X, padY: PAD_Y };
  const mine = width ? moodSegments(days, 'mine', box) : [];
  const partner = width ? moodSegments(days, 'partner', box) : [];
  const innerH = HEIGHT - PAD_Y * 2;
  const step = days.length > 1 ? (width - PAD_X * 2) / (days.length - 1) : 0;
  const pick = (e: GestureResponderEvent) => {
    if (!step) return;
    const i = Math.round((e.nativeEvent.locationX - PAD_X) / step);
    setSelected(Math.max(0, Math.min(days.length - 1, i)));
  };
  const day = selected != null ? days[selected] : null;
  const avgMine = averageMood(days, 'mine');
  const avgPartner = averageMood(days, 'partner');
  const dash = (v: number | null) => (v == null ? '—' : String(v));

  return (
    <View style={[styles.root, { backgroundColor: colors.surface, borderColor: colors.border }]} testID="mood-chart">
      <View style={styles.legend}>
        <LegendItem color={colors.primary} label={t('checkin.chart.me')} value={avgMine} testID="mood-legend-mine" />
        <LegendItem color={colors.secondary} label={partnerName} value={avgPartner} dashed testID="mood-legend-partner" />
      </View>
      <Pressable
        onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
        onPress={pick}
        accessibilityRole="image"
        accessibilityLabel={t('checkin.chart.a11y', { mine: dash(avgMine), partner: dash(avgPartner), name: partnerName })}
        style={{ height: HEIGHT }}
        testID="mood-chart-area"
      >
        {width ? (
          <Svg width={width} height={HEIGHT}>
            {MOOD_LEVELS.map((lvl) => {
              const y = PAD_Y + innerH * ((5 - lvl) / 4);
              return <Line key={lvl} x1={PAD_X} x2={width - PAD_X} y1={y} y2={y} stroke={colors.border} strokeWidth={1} />;
            })}
            {day && selected != null ? (
              <Line x1={PAD_X + step * selected} x2={PAD_X + step * selected} y1={PAD_Y} y2={HEIGHT - PAD_Y} stroke={colors.textMuted} strokeWidth={1} />
            ) : null}
            {mine.map((seg, i) =>
              seg.length > 1 ? (
                <Polyline key={`m${i}`} points={seg.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke={colors.primary} strokeWidth={2} strokeLinejoin="round" />
              ) : null,
            )}
            {partner.map((seg, i) =>
              seg.length > 1 ? (
                <Polyline
                  key={`p${i}`}
                  points={seg.map((p) => `${p.x},${p.y}`).join(' ')}
                  fill="none"
                  stroke={colors.secondary}
                  strokeWidth={2}
                  strokeDasharray="5,4"
                  strokeLinejoin="round"
                />
              ) : null,
            )}
            {mine.flat().map((p) => (
              <Circle key={`md${p.date}`} cx={p.x} cy={p.y} r={4} fill={colors.primary} stroke={colors.surface} strokeWidth={2} testID={`mood-dot-mine-${p.date}`} />
            ))}
            {partner.flat().map((p) => (
              <Circle key={`pd${p.date}`} cx={p.x} cy={p.y} r={4} fill={colors.surface} stroke={colors.secondary} strokeWidth={2} testID={`mood-dot-partner-${p.date}`} />
            ))}
          </Svg>
        ) : null}
      </Pressable>
      <View style={styles.axis}>
        <AppText variant="caption" color="textMuted">
          {days[0] ? formatDate(days[0].date, dateFormat) : ''}
        </AppText>
        <AppText variant="caption" color="textMuted">
          {days.length ? formatDate(days[days.length - 1].date, dateFormat) : ''}
        </AppText>
      </View>
      <AppText variant="caption" color={day ? 'text' : 'textMuted'} testID="mood-chart-detail">
        {day
          ? t('checkin.chart.day', { date: formatDate(day.date, dateFormat), mine: dash(day.mine), partner: dash(day.partner), name: partnerName })
          : t('checkin.chart.hint')}
      </AppText>
    </View>
  );
}

function LegendItem({ color, label, value, dashed, testID }: { color: string; label: string; value: number | null; dashed?: boolean; testID: string }) {
  const t = useT();
  return (
    <View style={styles.legendItem} testID={testID}>
      <Svg width={22} height={10}>
        <Line x1={1} x2={21} y1={5} y2={5} stroke={color} strokeWidth={2} strokeDasharray={dashed ? '5,4' : undefined} />
      </Svg>
      <AppText variant="caption">
        {value == null ? label : t('checkin.chart.legend', { name: label, avg: value })}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { borderWidth: 1, borderRadius: radius.card, padding: spacing.sm, gap: spacing.xs },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs },
  axis: { flexDirection: 'row', justifyContent: 'space-between' },
});
